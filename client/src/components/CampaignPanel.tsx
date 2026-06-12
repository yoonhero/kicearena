import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, LogIn, School, Share2 } from "lucide-react";
import type { CampaignUserPublic, HighSchool, StudentStatus } from "../../../shared/campaign";

const CAMPAIGN_USER_KEY = "kice-campaign-user";

const readCampaignUser = (): CampaignUserPublic | null => {
    const raw = window.localStorage.getItem(CAMPAIGN_USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as CampaignUserPublic;
    } catch {
        return null;
    }
};

const saveCampaignUser = (user: CampaignUserPublic) => {
    window.localStorage.setItem(CAMPAIGN_USER_KEY, JSON.stringify(user));
};

const referralFromUrl = () =>
    new URLSearchParams(window.location.search).get("c")?.trim().toLowerCase() ?? "";

export function CampaignPanel() {
    const [user, setUser] = useState<CampaignUserPublic | null>(() => readCampaignUser());
    const [mode, setMode] = useState<"register" | "login">("register");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [phone, setPhone] = useState("");
    const [studentStatus, setStudentStatus] = useState<StudentStatus>("g3");
    const [schoolQuery, setSchoolQuery] = useState("");
    const [schools, setSchools] = useState<HighSchool[]>([]);
    const [selectedSchool, setSelectedSchool] = useState<HighSchool | null>(null);
    const [noticeOptIn, setNoticeOptIn] = useState(true);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const referredByCode = useMemo(referralFromUrl, []);
    const referralLink = useMemo(() => {
        if (!user) return "";
        const url = new URL(window.location.href);
        url.search = "";
        url.searchParams.set("c", user.referralCode);
        return url.toString();
    }, [user]);

    useEffect(() => {
        if (!referredByCode) return;
        void fetch("/api/campaign/referral-visit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ referralCode: referredByCode }),
        }).catch(() => undefined);
    }, [referredByCode]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            fetch(`/api/schools?q=${encodeURIComponent(schoolQuery)}`, {
                signal: controller.signal,
            })
                .then((response) => response.json())
                .then((data: HighSchool[]) => setSchools(data))
                .catch(() => undefined);
        }, 160);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [schoolQuery]);

    const submit = async () => {
        setError("");
        setStatus("");
        const endpoint = mode === "register" ? "/api/campaign/register" : "/api/campaign/login";
        const body =
            mode === "register"
                ? {
                      username,
                      password,
                      phone,
                      studentStatus,
                      schoolId: selectedSchool?.id,
                      referredByCode,
                      paymentMeta: { noticeOptIn },
                  }
                : { username, password };
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            setError(
                mode === "register"
                    ? "가입 정보를 확인하세요."
                    : "아이디나 비밀번호가 맞지 않습니다.",
            );
            return;
        }
        const nextUser = (await response.json()) as CampaignUserPublic;
        saveCampaignUser(nextUser);
        setUser(nextUser);
        setStatus("인증 완료");
    };

    const copyReferral = async () => {
        await navigator.clipboard.writeText(referralLink);
        setStatus("인증 링크 복사됨");
    };

    if (user) {
        return (
            <section className="campaign-panel verified" aria-label="고등학교 인증">
                <div className="campaign-panel-head">
                    <span>
                        <BadgeCheck size={15} />
                        학교 인증
                    </span>
                    <strong>{user.badgeLabel}</strong>
                </div>
                <div className="school-badge-preview">
                    <School size={18} />
                    <span>{user.school.region}</span>
                    <strong>{user.school.name}</strong>
                </div>
                {user.referralAllowed ? (
                    <button
                        type="button"
                        className="secondary-btn campaign-copy"
                        onClick={copyReferral}
                    >
                        <Share2 size={16} /> 인증 링크
                    </button>
                ) : (
                    <p className="campaign-status">전파 링크 대기</p>
                )}
                {status && <p className="campaign-status">{status}</p>}
            </section>
        );
    }

    return (
        <section className="campaign-panel" aria-label="고등학교 인증">
            <div className="campaign-panel-head">
                <span>
                    <BadgeCheck size={15} />
                    고등학교 인증
                </span>
                <strong>{referredByCode ? "초대 링크" : "대표 배지"}</strong>
            </div>
            <div className="campaign-mode-tabs" role="tablist" aria-label="인증 방식">
                <button
                    type="button"
                    className={mode === "register" ? "active" : ""}
                    onClick={() => setMode("register")}
                >
                    가입
                </button>
                <button
                    type="button"
                    className={mode === "login" ? "active" : ""}
                    onClick={() => setMode("login")}
                >
                    로그인
                </button>
            </div>
            <label>
                <span>아이디</span>
                <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                />
            </label>
            <label>
                <span>비밀번호</span>
                <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                />
            </label>
            {mode === "register" && (
                <>
                    <label>
                        <span>신분</span>
                        <select
                            value={studentStatus}
                            onChange={(event) =>
                                setStudentStatus(event.target.value as StudentStatus)
                            }
                        >
                            <option value="g3">고3</option>
                            <option value="repeat">재수</option>
                            <option value="other">기타</option>
                        </select>
                    </label>
                    <label>
                        <span>휴대폰</span>
                        <input
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                            inputMode="tel"
                            placeholder="대회 공지 수신"
                        />
                    </label>
                    <label>
                        <span>학교</span>
                        <input
                            value={schoolQuery}
                            onChange={(event) => setSchoolQuery(event.target.value)}
                            placeholder="학교명 또는 지역"
                        />
                    </label>
                    <div className="school-search-results">
                        {schools.map((school) => (
                            <button
                                key={school.id}
                                type="button"
                                className={selectedSchool?.id === school.id ? "selected" : ""}
                                onClick={() => setSelectedSchool(school)}
                            >
                                <strong>{school.name}</strong>
                                <span>{school.region}</span>
                            </button>
                        ))}
                    </div>
                    <label className="campaign-check">
                        <input
                            type="checkbox"
                            checked={noticeOptIn}
                            onChange={(event) => setNoticeOptIn(event.target.checked)}
                        />
                        <span>대회 공지 수신</span>
                    </label>
                </>
            )}
            <button
                type="button"
                className="primary-btn campaign-submit"
                onClick={() => void submit()}
            >
                <LogIn size={16} /> {mode === "register" ? "인증" : "로그인"}
            </button>
            {error && <p className="error-text">{error}</p>}
            {status && <p className="campaign-status">{status}</p>}
        </section>
    );
}
