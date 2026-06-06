import { ChevronLeft, ChevronRight, Eye, EyeOff, KeyRound, Plus, RefreshCw, Save, Search, Settings2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { isProblemBody, type ExamManifest, type ProblemManifest, type ProblemPublic } from "../../../shared/game";
import { ProblemContent } from "../components/arena/ProblemContent";
import {
  adminAssetSrc,
  appendDefaultChoiceMarkup,
  bodyForAdminPreview,
  bodyToMarkup,
  insertMarkupAtRange,
  makeDefaultChoices,
  normalizedBodyForSave,
  parseProblemMarkup,
  removeChoiceMarkup
} from "./adminProblemMarkup";

type AdminExam = ExamManifest & { active: boolean };
type ProblemForm = {
  title: string;
  answerKind: ProblemManifest["answerKind"];
  answer: string;
  difficulty: number;
  pointValue: string;
  bodyMarkup: string;
};
type ExamSettingsForm = {
  title: string;
  subtitle: string;
  timeLimitMin: string;
  active: boolean;
  releaseAt: string;
};
type NewExamForm = ExamSettingsForm & {
  id: string;
};
type AdminAssetUpload = {
  path: string;
  src: string;
};

const ADMIN_TOKEN_KEY = "kice-admin-token";

const makeExamSettingsForm = (exam: AdminExam): ExamSettingsForm => ({
  title: exam.title,
  subtitle: exam.subtitle,
  timeLimitMin: String(Math.max(1, Math.round(exam.timeLimitSec / 60))),
  active: exam.active,
  releaseAt: exam.releaseAt ?? ""
});

const makeEmptyNewExamForm = (): NewExamForm => ({
  id: "",
  title: "",
  subtitle: "직접 추가한 문제지",
  timeLimitMin: "100",
  active: false,
  releaseAt: ""
});

const makeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

const isSvgFile = (file: File) => file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
const uploadHeaderFileName = (fileName: string) => fileName.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "asset.svg";

const makeForm = (problem: ProblemManifest): ProblemForm => ({
  title: problem.title,
  answerKind: problem.answerKind,
  answer: problem.answer,
  difficulty: problem.difficulty,
  pointValue: problem.pointValue ? String(problem.pointValue) : "",
  bodyMarkup: bodyToMarkup(problem.answerKind === "short" ? problem.body?.filter((block) => block.kind !== "choices") : problem.body)
});

export function AdminScreen() {
  const [token, setToken] = useState(() => window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "");
  const [exams, setExams] = useState<AdminExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedProblemId, setSelectedProblemId] = useState("");
  const [form, setForm] = useState<ProblemForm | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [problemQuery, setProblemQuery] = useState("");
  const [examSettings, setExamSettings] = useState<ExamSettingsForm | null>(null);
  const [newExam, setNewExam] = useState<NewExamForm>(() => makeEmptyNewExamForm());
  const [newExamOpen, setNewExamOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [assetDragging, setAssetDragging] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const bodyEditorRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedExam = useMemo(() => exams.find((exam) => exam.id === selectedExamId) ?? exams[0], [exams, selectedExamId]);
  const selectedProblem = useMemo(() => selectedExam?.problems.find((problem) => problem.id === selectedProblemId) ?? selectedExam?.problems[0], [selectedExam, selectedProblemId]);
  const selectedProblemIndex = useMemo(() => selectedExam?.problems.findIndex((problem) => problem.id === selectedProblem?.id) ?? -1, [selectedExam, selectedProblem]);
  const filteredProblems = useMemo(() => {
    if (!selectedExam) return [];
    const query = problemQuery.trim().toLowerCase();
    if (!query) return selectedExam.problems;
    return selectedExam.problems.filter((problem) =>
      [String(problem.number), problem.id, problem.title, problem.answer, problem.answerKind, String(problem.difficulty), String(problem.pointValue ?? "")]
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [problemQuery, selectedExam]);

  const bodyCheck = useMemo(() => {
    if (!form) return { ok: false as const, body: null, error: "" };
    const body = normalizedBodyForSave(form);
    if (!isProblemBody(body)) return { ok: false as const, body: null, error: "본문 구조를 확인하세요." };
    const choices = body.find((block) => block.kind === "choices")?.choices;
    if (form.answerKind === "choice" && !choices) return { ok: false as const, body: null, error: "객관식 선택지를 추가하세요." };
    if (form.answerKind === "choice" && choices?.some((choice) => !choice.trim())) return { ok: false as const, body: null, error: "빈 선택지를 채우거나 지우세요." };
    if (form.answerKind === "choice" && choices && (!Number.isInteger(Number(form.answer)) || Number(form.answer) < 1 || Number(form.answer) > choices.length)) {
      return { ok: false as const, body: null, error: "정답 번호가 선택지 범위를 벗어났습니다." };
    }
    return { ok: true as const, body: body.length ? body : null, error: "" };
  }, [form?.answer, form?.answerKind, form?.bodyMarkup]);

  const pointValueCheck = useMemo(() => {
    if (!form || !form.pointValue.trim()) return { ok: true, value: null as number | null, error: "" };
    const value = Number(form.pointValue);
    if (!Number.isInteger(value) || value < 1 || value > 100) return { ok: false, value: null, error: "점수는 1 이상 100 이하의 정수여야 합니다." };
    return { ok: true, value, error: "" };
  }, [form?.pointValue]);
  const examSettingsCheck = useMemo(() => {
    if (!selectedExam || !examSettings) return { ok: false, timeLimitSec: 0, error: "" };
    const timeLimitMin = Number(examSettings.timeLimitMin);
    if (!examSettings.title.trim() || !examSettings.subtitle.trim()) return { ok: false, timeLimitSec: 0, error: "문제지 제목과 설명을 입력하세요." };
    if (!Number.isInteger(timeLimitMin) || timeLimitMin < 1 || timeLimitMin > 1440) return { ok: false, timeLimitSec: 0, error: "시간은 1분 이상 1440분 이하의 정수여야 합니다." };
    if (examSettings.releaseAt.trim() && Number.isNaN(Date.parse(examSettings.releaseAt.trim()))) return { ok: false, timeLimitSec: 0, error: "공개 시작 시각 형식을 확인하세요." };
    return { ok: true, timeLimitSec: timeLimitMin * 60, error: "" };
  }, [examSettings, selectedExam]);
  const newExamCheck = useMemo(() => {
    const timeLimitMin = Number(newExam.timeLimitMin);
    if (!/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(newExam.id.trim())) return { ok: false, timeLimitSec: 0, error: "id는 영문 소문자, 숫자, 하이픈으로 3~80자여야 합니다." };
    if (!newExam.title.trim() || !newExam.subtitle.trim()) return { ok: false, timeLimitSec: 0, error: "새 문제지 제목과 설명을 입력하세요." };
    if (!Number.isInteger(timeLimitMin) || timeLimitMin < 1 || timeLimitMin > 1440) return { ok: false, timeLimitSec: 0, error: "시간은 1분 이상 1440분 이하의 정수여야 합니다." };
    return { ok: true, timeLimitSec: timeLimitMin * 60, error: "" };
  }, [newExam]);
  const isExamSettingsDirty = Boolean(selectedExam && examSettings && JSON.stringify(makeExamSettingsForm(selectedExam)) !== JSON.stringify(examSettings));
  const isDirty = Boolean(selectedProblem && form && JSON.stringify(makeForm(selectedProblem)) !== JSON.stringify(form));
  const canSave = Boolean(form && selectedProblem && bodyCheck.ok && pointValueCheck.ok && form.title.trim() && form.answer.trim() && Number.isInteger(form.difficulty) && form.difficulty >= 1 && form.difficulty <= 5);
  const previewProblem = useMemo<ProblemPublic | null>(() => {
    if (!selectedExam || !selectedProblem || !form || !bodyCheck.ok) return null;
    return {
      id: selectedProblem.id,
      number: selectedProblem.number,
      title: form.title,
      answerKind: form.answerKind,
      difficulty: form.difficulty as ProblemManifest["difficulty"],
      pointValue: pointValueCheck.value ?? selectedProblem.pointValue ?? 0,
      imageUrl: selectedProblem.image ? adminAssetSrc(selectedExam.id, `problems/${selectedProblem.image}`) : undefined,
      body: bodyCheck.body ? bodyForAdminPreview(selectedExam.id, bodyCheck.body) : undefined,
      text: selectedProblem.text,
      sourceNumber: selectedProblem.sourceNumber,
      sourcePage: selectedProblem.sourcePage,
      bbox: selectedProblem.bbox,
      section: selectedProblem.section,
      captureQuality: selectedProblem.captureQuality
    };
  }, [bodyCheck, form, pointValueCheck.value, selectedExam, selectedProblem]);

  const authHeaders = (): Record<string, string> => (token ? { "X-Admin-Token": token } : {});

  const loadExams = async () => {
    setLoading(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/admin/exams", { headers: authHeaders() });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "관리자 권한을 확인하세요." : "문제지 목록을 불러오지 못했습니다.");
      const data = (await response.json()) as AdminExam[];
      setExams(data);
      setSelectedExamId((current) => (data.some((exam) => exam.id === current) ? current : data[0]?.id ?? ""));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "문제지 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadExams();
  }, []);

  useEffect(() => {
    if (!selectedExam) return;
    setSelectedProblemId((current) => (selectedExam.problems.some((problem) => problem.id === current) ? current : selectedExam.problems[0]?.id ?? ""));
    setSettingsOpen(false);
  }, [selectedExam?.id]);

  useEffect(() => {
    setForm(selectedProblem ? makeForm(selectedProblem) : null);
  }, [selectedProblem?.id]);

  useEffect(() => {
    if (selectedExam) setExamSettings(makeExamSettingsForm(selectedExam));
  }, [selectedExam?.id, selectedExam?.active, selectedExam?.title, selectedExam?.subtitle, selectedExam?.timeLimitSec, selectedExam?.releaseAt]);

  const saveToken = () => {
    window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
    setStatus("관리자 토큰 저장됨");
  };

  const updateForm = <TKey extends keyof ProblemForm>(key: TKey, value: ProblemForm[TKey]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateExamSettings = <TKey extends keyof ExamSettingsForm>(key: TKey, value: ExamSettingsForm[TKey]) => {
    setExamSettings((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateNewExam = <TKey extends keyof NewExamForm>(key: TKey, value: NewExamForm[TKey]) => {
    setNewExam((current) => ({ ...current, [key]: value }));
  };

  const updateAnswerKind = (answerKind: ProblemManifest["answerKind"]) => {
    setForm((current) => {
      if (!current) return current;
      if (answerKind === "short") {
        return { ...current, answerKind, bodyMarkup: removeChoiceMarkup(current.bodyMarkup) };
      }
      if (!parseProblemMarkup(current.bodyMarkup).some((block) => block.kind === "choices")) {
        return { ...current, answerKind, answer: "1", bodyMarkup: appendDefaultChoiceMarkup(current.bodyMarkup) };
      }
      return { ...current, answerKind, answer: answerKind === "choice" && !current.answer.trim() ? "1" : current.answer };
    });
  };

  const insertBodyMarkup = (markup: string, textarea = bodyEditorRef.current) => {
    let nextCaret = -1;
    setForm((current) => {
      if (!current) return current;
      const source = current.bodyMarkup;
      const start = textarea ? textarea.selectionStart : source.length;
      const end = textarea ? textarea.selectionEnd : start;
      const inserted = insertMarkupAtRange(source, markup, start, end);
      nextCaret = inserted.caret;
      return { ...current, bodyMarkup: inserted.value };
    });
    window.requestAnimationFrame(() => {
      if (!bodyEditorRef.current || nextCaret < 0) return;
      bodyEditorRef.current.focus();
      bodyEditorRef.current.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const uploadSvgAsset = async (file: File) => {
    if (!selectedExam) throw new Error("문제지를 먼저 선택하세요.");
    const response = await fetch(`/api/admin/exams/${encodeURIComponent(selectedExam.id)}/assets`, {
      method: "POST",
      headers: { "Content-Type": "image/svg+xml", "X-File-Name": uploadHeaderFileName(file.name), ...authHeaders() },
      body: file
    });
    if (!response.ok) {
      throw new Error(response.status === 401 || response.status === 403 ? "관리자 권한을 확인하세요." : "SVG 업로드 실패");
    }
    return (await response.json()) as AdminAssetUpload;
  };

  const handleBodyDrop = async (event: DragEvent<HTMLTextAreaElement>) => {
    const files = [...event.dataTransfer.files];
    const file = files.find(isSvgFile);
    if (!file) {
      if (files.length > 0) {
        event.preventDefault();
        setAssetDragging(false);
        setError("SVG 파일만 업로드할 수 있습니다.");
      }
      return;
    }
    event.preventDefault();
    setAssetDragging(false);
    setUploadingAsset(true);
    setError("");
    setStatus("");
    try {
      const uploaded = await uploadSvgAsset(file);
      const label = file.name.replace(/\.svg$/i, "").replace(/[-_]+/g, " ").trim() || "도표";
      insertBodyMarkup(`::svg ${uploaded.path} | ${label}`, event.currentTarget);
      setStatus(`${file.name} 업로드됨`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "SVG 업로드 실패");
    } finally {
      setUploadingAsset(false);
    }
  };

  const handleBodyDragOver = (event: DragEvent<HTMLTextAreaElement>) => {
    if (![...event.dataTransfer.items].some((item) => item.kind === "file")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setAssetDragging(true);
  };

  const resetForm = () => {
    if (!selectedProblem) return;
    setForm(makeForm(selectedProblem));
    setError("");
    setStatus("");
  };

  const createExam = async () => {
    setError("");
    setStatus("");
    if (!newExamCheck.ok) {
      setError(newExamCheck.error);
      return;
    }

    const response = await fetch("/api/admin/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        id: newExam.id.trim(),
        title: newExam.title.trim(),
        subtitle: newExam.subtitle.trim(),
        timeLimitSec: newExamCheck.timeLimitSec,
        active: newExam.active
      })
    });
    if (!response.ok) {
      setError(response.status === 409 ? "이미 존재하는 문제지 id입니다." : response.status === 401 || response.status === 403 ? "관리자 권한을 확인하세요." : "문제지 생성 실패");
      return;
    }

    const created = (await response.json()) as AdminExam;
    setExams((current) => [...current.filter((exam) => exam.id !== created.id), created].sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)));
    setSelectedExamId(created.id);
    setSelectedProblemId("");
    setProblemQuery("");
    setNewExam(makeEmptyNewExamForm());
    setNewExamOpen(false);
    setStatus(`${created.title} 생성됨`);
  };

  const saveExamSettings = async (nextSettings = examSettings) => {
    if (!selectedExam || !nextSettings) return;
    setError("");
    setStatus("");

    const timeLimitMin = Number(nextSettings.timeLimitMin);
    if (!nextSettings.title.trim() || !nextSettings.subtitle.trim() || !Number.isInteger(timeLimitMin) || timeLimitMin < 1 || timeLimitMin > 1440) {
      setError("문제지 제목, 설명, 시간을 확인하세요.");
      return;
    }
    if (nextSettings.releaseAt.trim() && Number.isNaN(Date.parse(nextSettings.releaseAt.trim()))) {
      setError("공개 시작 시각 형식을 확인하세요.");
      return;
    }

    const response = await fetch(`/api/admin/exams/${encodeURIComponent(selectedExam.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        title: nextSettings.title.trim(),
        subtitle: nextSettings.subtitle.trim(),
        timeLimitSec: timeLimitMin * 60,
        active: nextSettings.active,
        releaseAt: nextSettings.releaseAt.trim() || null
      })
    });
    if (!response.ok) {
      setError(response.status === 401 || response.status === 403 ? "관리자 권한을 확인하세요." : "문제지 설정 저장 실패");
      return;
    }

    const updated = (await response.json()) as AdminExam;
    setExams((current) => current.map((exam) => (exam.id === updated.id ? updated : exam)).sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)));
    setSelectedExamId(updated.id);
    setExamSettings(makeExamSettingsForm(updated));
    setStatus(`${updated.title} 설정 저장됨`);
  };

  const toggleSelectedExamActive = () => {
    if (!examSettings) return;
    const nextSettings = { ...examSettings, active: !examSettings.active };
    setExamSettings(nextSettings);
    void saveExamSettings(nextSettings);
  };

  const createProblem = async () => {
    if (!selectedExam) return;
    setError("");
    setStatus("");
    const response = await fetch(`/api/admin/exams/${encodeURIComponent(selectedExam.id)}/problems`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        title: "새 문항",
        answerKind: "short",
        answer: "1",
        difficulty: 1,
        pointValue: null,
        body: [{ kind: "paragraph", text: "" }]
      })
    });
    if (!response.ok) {
      setError(response.status === 401 || response.status === 403 ? "관리자 권한을 확인하세요." : "문항 추가 실패");
      return;
    }

    const created = (await response.json()) as ProblemManifest;
    setExams((current) =>
      current.map((exam) =>
        exam.id === selectedExam.id ? { ...exam, problems: [...exam.problems.filter((problem) => problem.id !== created.id), created].sort((left, right) => left.number - right.number) } : exam
      )
    );
    setSelectedProblemId(created.id);
    setStatus(`${created.number}번 문항 추가됨`);
  };

  const selectProblemOffset = (offset: number) => {
    if (!selectedExam || selectedProblemIndex < 0) return;
    const nextIndex = Math.max(0, Math.min(selectedExam.problems.length - 1, selectedProblemIndex + offset));
    setSelectedProblemId(selectedExam.problems[nextIndex]?.id ?? "");
  };

  const saveProblem = async () => {
    if (!selectedExam || !selectedProblem || !form) return;
    setError("");
    setStatus("");

    if (!bodyCheck.ok) {
      setError(bodyCheck.error);
      return;
    }
    if (!pointValueCheck.ok) {
      setError(pointValueCheck.error);
      return;
    }
    if (!form.title.trim() || !form.answer.trim() || !Number.isInteger(form.difficulty) || form.difficulty < 1 || form.difficulty > 5) {
      setError("제목, 정답, 난도를 확인하세요.");
      return;
    }

    const response = await fetch(`/api/admin/exams/${encodeURIComponent(selectedExam.id)}/problems/${encodeURIComponent(selectedProblem.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        title: form.title,
        answerKind: form.answerKind,
        answer: form.answer,
        difficulty: form.difficulty,
        pointValue: pointValueCheck.value,
        body: bodyCheck.body
      })
    });
    if (!response.ok) {
      setError(response.status === 401 || response.status === 403 ? "관리자 권한을 확인하세요." : "문제 저장 실패");
      return;
    }

    const updated = (await response.json()) as ProblemManifest;
    setExams((current) =>
      current.map((exam) =>
        exam.id === selectedExam.id ? { ...exam, problems: exam.problems.map((problem) => (problem.id === updated.id ? updated : problem)) } : exam
      )
    );
    setForm(makeForm(updated));
    setStatus(`${updated.number}번 저장됨`);
  };

  const parsedBody = form ? normalizedBodyForSave(form) : [];
  const choicesForAnswer = form?.answerKind === "choice" ? parsedBody.find((block) => block.kind === "choices")?.choices ?? makeDefaultChoices() : [];

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <span>KICE ARENA ADMIN</span>
          <strong>문제지 관리</strong>
        </div>
        <label>
          <span>Admin Token</span>
          <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="X-Admin-Token" />
        </label>
        <button type="button" className="secondary-btn" onClick={saveToken}>
          <KeyRound size={16} /> 토큰 저장
        </button>
        <button type="button" className="secondary-btn" onClick={loadExams} disabled={loading}>
          <RefreshCw size={16} /> 새로고침
        </button>
      </header>

      <section className="admin-layout">
        <aside className="admin-exam-list">
          <div className="admin-section-head">
            <span>문제지</span>
            <div className="admin-section-actions">
              <strong>{exams.length}</strong>
              <button type="button" className="admin-icon-btn" onClick={() => setNewExamOpen((current) => !current)} aria-label="새 문제지">
                <Plus size={16} />
              </button>
            </div>
          </div>
          {newExamOpen && <section className="admin-new-exam">
            <div className="admin-body-builder-head">
              <span>새 문제지</span>
              <strong>{newExam.active ? "공개" : "비공개"}</strong>
            </div>
            <label>
              <span>ID</span>
              <input value={newExam.id} onChange={(event) => updateNewExam("id", makeSlug(event.target.value))} placeholder="mock-exam-2026" />
            </label>
            <label>
              <span>제목</span>
              <input
                value={newExam.title}
                onChange={(event) => {
                  const title = event.target.value;
                  setNewExam((current) => ({ ...current, title, id: current.id ? current.id : makeSlug(title) }));
                }}
                placeholder="새 문제지"
              />
            </label>
            <label>
              <span>설명</span>
              <input value={newExam.subtitle} onChange={(event) => updateNewExam("subtitle", event.target.value)} />
            </label>
            <div className="admin-new-exam-row">
              <label>
                <span>시간</span>
                <input value={newExam.timeLimitMin} onChange={(event) => updateNewExam("timeLimitMin", event.target.value)} inputMode="numeric" />
              </label>
              <button type="button" className={`admin-visibility-btn ${newExam.active ? "published" : ""}`} onClick={() => updateNewExam("active", !newExam.active)}>
                {newExam.active ? <Eye size={16} /> : <EyeOff size={16} />}
                {newExam.active ? "공개" : "비공개"}
              </button>
            </div>
            <button type="button" className="primary-btn" onClick={createExam} disabled={!newExamCheck.ok}>
              <Plus size={16} /> 문제지 생성
            </button>
          </section>}
          {exams.map((exam) => (
            <button key={exam.id} type="button" className={exam.id === selectedExam?.id ? "selected" : ""} onClick={() => setSelectedExamId(exam.id)}>
              <strong>{exam.title}</strong>
              <span>{exam.problems.length}문항 · {exam.active ? "공개" : "비공개"}</span>
            </button>
          ))}
        </aside>

        <section className="admin-problem-list">
          <div className="admin-section-head">
            <span>{selectedExam?.title ?? "문제지 없음"}</span>
            <strong>{selectedExam ? (selectedExam.active ? "공개" : "비공개") : ""}</strong>
          </div>
          {selectedExam && examSettings && (
            <div className="admin-exam-quick-actions">
              <button type="button" className={`admin-visibility-btn ${examSettings.active ? "published" : ""}`} onClick={toggleSelectedExamActive}>
                {examSettings.active ? <Eye size={16} /> : <EyeOff size={16} />}
                {examSettings.active ? "공개 중" : "비공개"}
              </button>
              <button type="button" className="secondary-btn" onClick={() => setSettingsOpen((current) => !current)}>
                <Settings2 size={16} /> 설정
              </button>
            </div>
          )}
          {selectedExam && examSettings && settingsOpen && (
            <section className="admin-exam-settings">
              <label>
                <span>제목</span>
                <input value={examSettings.title} onChange={(event) => updateExamSettings("title", event.target.value)} />
              </label>
              <label>
                <span>설명</span>
                <input value={examSettings.subtitle} onChange={(event) => updateExamSettings("subtitle", event.target.value)} />
              </label>
              <label>
                <span>시간</span>
                <input value={examSettings.timeLimitMin} onChange={(event) => updateExamSettings("timeLimitMin", event.target.value)} inputMode="numeric" />
              </label>
              <label>
                <span>공개 시작</span>
                <input value={examSettings.releaseAt} onChange={(event) => updateExamSettings("releaseAt", event.target.value)} placeholder="비워두면 즉시" />
              </label>
              <button type="button" className="secondary-btn" onClick={() => void saveExamSettings()} disabled={!examSettingsCheck.ok || !isExamSettingsDirty}>
                <Save size={16} /> 설정 저장
              </button>
            </section>
          )}
          <div className="admin-section-head admin-subsection-head">
            <span>문항</span>
            <strong>{filteredProblems.length}/{selectedExam?.problems.length ?? 0}</strong>
          </div>
          <button type="button" className="secondary-btn admin-add-problem-btn" onClick={() => void createProblem()} disabled={!selectedExam}>
            <Plus size={16} /> 문항 추가
          </button>
          <label className="admin-search">
            <span>검색</span>
            <div>
              <Search size={16} />
              <input value={problemQuery} onChange={(event) => setProblemQuery(event.target.value)} placeholder="번호, 제목, 정답, id" />
            </div>
          </label>
          <div className="admin-problem-nav">
            <button type="button" className="secondary-btn" onClick={() => selectProblemOffset(-1)} disabled={selectedProblemIndex <= 0}>
              <ChevronLeft size={16} /> 이전
            </button>
            <span>{selectedProblemIndex >= 0 ? `${selectedProblemIndex + 1}/${selectedExam?.problems.length ?? 0}` : "-"}</span>
            <button type="button" className="secondary-btn" onClick={() => selectProblemOffset(1)} disabled={!selectedExam || selectedProblemIndex >= selectedExam.problems.length - 1}>
              다음 <ChevronRight size={16} />
            </button>
          </div>
          <div className="admin-problem-table">
            <div className="admin-problem-row head">
              <span>번호</span>
              <span>제목</span>
              <span>유형</span>
            </div>
            {filteredProblems.map((problem) => (
              <button key={problem.id} type="button" className={`admin-problem-row ${problem.id === selectedProblem?.id ? "selected" : ""}`} onClick={() => setSelectedProblemId(problem.id)}>
                <span>{problem.number}</span>
                <span>{problem.title}</span>
                <span>{problem.answerKind === "choice" ? "객관식" : "단답형"} · {problem.difficulty}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="admin-editor">
          <div className="admin-section-head">
            <span>{selectedProblem ? `${selectedProblem.number}번` : "문제 선택"}</span>
            <strong>{isDirty ? "수정중" : selectedProblem?.id ?? ""}</strong>
          </div>
          {form && (
            <>
              <label>
                <span>제목</span>
                <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} />
              </label>
              <div className="admin-editor-grid">
                <div className="admin-field">
                  <span>정답 유형</span>
                  <div className="admin-segmented" role="group" aria-label="정답 유형">
                    {(["choice", "short"] as const).map((answerKind) => (
                      <button key={answerKind} type="button" className={form.answerKind === answerKind ? "selected" : ""} onClick={() => updateAnswerKind(answerKind)}>
                        {answerKind === "choice" ? "객관식" : "단답형"}
                      </button>
                    ))}
                  </div>
                </div>
                <label className={form.answerKind === "choice" ? "admin-choice-answer" : ""}>
                  <span>정답</span>
                  {form.answerKind === "choice" ? (
                    <div className="admin-answer-picks" role="group" aria-label="객관식 정답">
                      {choicesForAnswer.map((_, index) => {
                        const answer = String(index + 1);
                        return (
                          <button key={answer} type="button" className={form.answer === answer ? "selected" : ""} onClick={() => updateForm("answer", answer)}>
                            {answer}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input value={form.answer} onChange={(event) => updateForm("answer", event.target.value)} />
                  )}
                </label>
                <div className="admin-field">
                  <span>난도</span>
                  <div className="admin-difficulty-picks" role="group" aria-label="난도">
                    {[1, 2, 3, 4, 5].map((difficulty) => (
                      <button key={difficulty} type="button" className={form.difficulty === difficulty ? "selected" : ""} onClick={() => updateForm("difficulty", difficulty)}>
                        {difficulty}
                      </button>
                    ))}
                  </div>
                </div>
                <label>
                  <span>점수</span>
                  <input value={form.pointValue} onChange={(event) => updateForm("pointValue", event.target.value)} placeholder="auto" />
                </label>
              </div>
              <label className={`admin-markup-editor ${assetDragging || uploadingAsset ? "drag-active" : ""}`}>
                <span>본문</span>
                <textarea
                  ref={bodyEditorRef}
                  value={form.bodyMarkup}
                  onChange={(event) => updateForm("bodyMarkup", event.target.value)}
                  onDragEnter={handleBodyDragOver}
                  onDragOver={handleBodyDragOver}
                  onDragLeave={() => setAssetDragging(false)}
                  onDrop={(event) => void handleBodyDrop(event)}
                  spellCheck={false}
                  placeholder={"문제 본문\n\n::math x^2+1\n::svg diagrams/graph.svg | 그래프 | 참고\n::note 자연수로 입력\n::choice 1"}
                />
              </label>
              {(!bodyCheck.ok || !pointValueCheck.ok || uploadingAsset) && (
                <div className="admin-validation-strip">
                  {!bodyCheck.ok && <span className="invalid">{bodyCheck.error}</span>}
                  {!pointValueCheck.ok && <span className="invalid">{pointValueCheck.error}</span>}
                  {uploadingAsset && <span className="valid">업로드 중</span>}
                </div>
              )}
              <div className="admin-editor-actions">
                <button type="button" className="secondary-btn" onClick={resetForm} disabled={!isDirty}>
                  <Undo2 size={16} /> 되돌리기
                </button>
                <button type="button" className="primary-btn" onClick={saveProblem} disabled={!canSave || !isDirty}>
                  <Save size={16} /> 문제 저장
                </button>
              </div>
            </>
          )}
          {!form && selectedExam && <p className="admin-empty-copy">아직 문항이 없습니다. 왼쪽 문항 추가 버튼으로 첫 문항을 만들 수 있습니다.</p>}
          {error && <p className="error-text">{error}</p>}
          {status && <p className="admin-status">{status}</p>}
        </section>

        <section className="admin-preview">
          <div className="admin-section-head">
            <span>미리보기</span>
            <strong>{previewProblem ? `${previewProblem.number}번` : ""}</strong>
          </div>
          {previewProblem && (
            <div className="admin-preview-paper">
              <div className="admin-preview-head">
                <span>{previewProblem.title}</span>
                <strong>{previewProblem.answerKind} · {form?.answer ?? ""}</strong>
              </div>
              <ProblemContent problem={previewProblem} />
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
