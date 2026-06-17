import { KeyRound, Link, RefreshCw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CampaignStats, HighSchool } from "../../../shared/campaign";

const ADMIN_TOKEN_KEY = "kice-admin-token";
const REFERRAL_CODE_PATTERN = /^[2-9a-z]{4,32}$/;
const SCHOOL_SEARCH_DELAY_MS = 250;

type WhitelistEntry = CampaignStats["whitelist"][number];

type ReferralForm = {
    referralCode: string;
    schoolId: string;
    note: string;
};

const emptyStats: CampaignStats = {
    totals: {
        users: 0,
        schools: 0,
        referralVisits: 0,
        referralEvents: 0,
        convertedReferrals: 0,
        referralConversionRate: 0,
        whitelistedLinks: 0,
    },
    topSchools: [],
    recentUsers: [],
    whitelist: [],
};

const emptyReferralForm = (): ReferralForm => ({
    referralCode: "",
    schoolId: "",
    note: "admin",
});

const referralUrl = (code: string) => `${window.location.origin}/?c=${encodeURIComponent(code)}`;

const formatPercent = (value: number) => `${Math.round(value * 1000) / 10}%`;

const upsertWhitelistEntry = (stats: CampaignStats, entry: WhitelistEntry): CampaignStats => {
    const exists = stats.whitelist.some(
        (candidate) => candidate.referralCode === entry.referralCode,
    );
    return {
        ...stats,
        whitelist: [
            entry,
            ...stats.whitelist.filter((candidate) => candidate.referralCode !== entry.referralCode),
        ],
        totals: {
            ...stats.totals,
            whitelistedLinks: exists
                ? stats.totals.whitelistedLinks
                : stats.totals.whitelistedLinks + 1,
        },
    };
};

const removeWhitelistEntry = (stats: CampaignStats, entry: WhitelistEntry): CampaignStats => ({
    ...stats,
    whitelist: stats.whitelist.filter((candidate) => candidate.referralCode !== entry.referralCode),
    totals: {
        ...stats.totals,
        whitelistedLinks: Math.max(0, stats.totals.whitelistedLinks - 1),
    },
});

export function AdminCampaignScreen() {
    const [token, setToken] = useState(() => window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "");
    const [stats, setStats] = useState<CampaignStats | null>(null);
    const [schools, setSchools] = useState<HighSchool[]>([]);
    const [schoolQuery, setSchoolQuery] = useState("");
    const [debouncedSchoolQuery, setDebouncedSchoolQuery] = useState("");
    const [form, setForm] = useState<ReferralForm>(() => emptyReferralForm());
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const authHeaders = (): Record<string, string> => (token ? { "X-Admin-Token": token } : {});
    const visibleStats = stats ?? emptyStats;

    const topSchools = useMemo(() => visibleStats.topSchools.slice(0, 8), [visibleStats]);
    const maxUsers = Math.max(1, ...topSchools.map((school) => school.users));
    const maxReferrals = Math.max(1, ...topSchools.map((school) => school.referrals));

    const loadStats = async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/admin/campaign/stats", {
                headers: authHeaders(),
            });
            if (!response.ok) {
                setError("캠페인 통계를 불러오지 못했습니다.");
                return;
            }
            setStats((await response.json()) as CampaignStats);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadStats();
    }, []);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedSchoolQuery(schoolQuery.trim());
        }, SCHOOL_SEARCH_DELAY_MS);
        return () => window.clearTimeout(timeoutId);
    }, [schoolQuery]);

    useEffect(() => {
        const query = debouncedSchoolQuery;
        if (query.length < 2) {
            setSchools([]);
            return;
        }
        const controller = new AbortController();
        fetch(`/api/schools?q=${encodeURIComponent(query)}`, { signal: controller.signal })
            .then((response) => (response.ok ? response.json() : []))
            .then((data: HighSchool[]) => setSchools(data))
            .catch((nextError) => {
                if (nextError instanceof DOMException && nextError.name === "AbortError") return;
                setSchools([]);
            });
        return () => controller.abort();
    }, [debouncedSchoolQuery]);

    const saveToken = () => {
        window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
        setStatus("관리자 토큰 저장됨");
    };

    const selectSchool = (school: HighSchool) => {
        setForm((current) => ({ ...current, schoolId: school.id }));
        setSchoolQuery(`${school.name} · ${school.region}`);
        setSchools([]);
    };

    const saveReferral = async () => {
        const referralCode = form.referralCode.trim().toLowerCase();
        if (!REFERRAL_CODE_PATTERN.test(referralCode) || !form.schoolId) {
            setError("추천 코드와 학교를 확인하세요.");
            return;
        }
        setError("");
        setStatus("");
        const response = await fetch(
            `/api/admin/campaign/referral-whitelist/${encodeURIComponent(referralCode)}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    schoolId: form.schoolId,
                    note: form.note.trim() || "admin",
                }),
            },
        );
        if (!response.ok) {
            setError(
                response.status === 401 || response.status === 403
                    ? "관리자 권한을 확인하세요."
                    : "추천 링크를 저장하지 못했습니다.",
            );
            return;
        }
        const entry = (await response.json()) as WhitelistEntry;
        setStats((current) => upsertWhitelistEntry(current ?? emptyStats, entry));
        setForm(emptyReferralForm());
        setSchoolQuery("");
        setStatus(`${entry.schoolName} 추천 링크 저장됨`);
    };

    const deleteReferral = async (entry: WhitelistEntry) => {
        setError("");
        setStatus("");
        const response = await fetch(
            `/api/admin/campaign/referral-whitelist/${encodeURIComponent(entry.referralCode)}`,
            { method: "DELETE", headers: authHeaders() },
        );
        if (!response.ok) {
            setError("추천 링크를 삭제하지 못했습니다.");
            return;
        }
        setStats((current) => removeWhitelistEntry(current ?? emptyStats, entry));
        setStatus(`${entry.referralCode} 삭제됨`);
    };

    return (
        <main className="admin-shell campaign-admin-shell">
            <header className="admin-topbar campaign-admin-topbar">
                <div>
                    <span>관리실</span>
                    <strong>입소문 캠페인</strong>
                </div>
                <label>
                    <span>관리자 토큰</span>
                    <input
                        type="password"
                        value={token}
                        onChange={(event) => setToken(event.target.value)}
                        placeholder="X-Admin-Token"
                    />
                </label>
                <button type="button" className="secondary-btn" onClick={saveToken}>
                    <KeyRound size={16} /> 토큰 저장
                </button>
                <a className="secondary-btn" href="/admin">
                    문제지
                </a>
                <button
                    type="button"
                    className="secondary-btn"
                    onClick={loadStats}
                    disabled={loading}
                >
                    <RefreshCw size={16} /> 새로고침
                </button>
            </header>

            <section className="campaign-dashboard">
                <section className="campaign-metrics" aria-label="캠페인 요약">
                    <Metric label="인증" value={visibleStats.totals.users} />
                    <Metric label="참여 학교" value={visibleStats.totals.schools} />
                    <Metric label="순방문" value={visibleStats.totals.referralVisits} />
                    <Metric label="방문 기록" value={visibleStats.totals.referralEvents} />
                    <Metric label="전환" value={visibleStats.totals.convertedReferrals} />
                    <Metric
                        label="전환율"
                        value={formatPercent(visibleStats.totals.referralConversionRate)}
                    />
                    <Metric label="허용 링크" value={visibleStats.totals.whitelistedLinks} />
                </section>

                <section className="campaign-chart-panel">
                    <div className="admin-section-head">
                        <span>학교별 참여 흐름</span>
                        <strong>인증 / 전환</strong>
                    </div>
                    <div className="campaign-bar-chart">
                        {topSchools.map((school) => (
                            <div key={school.schoolId} className="campaign-bar-row">
                                <span>{school.schoolName}</span>
                                <div>
                                    <i style={{ width: `${(school.users / maxUsers) * 100}%` }} />
                                    <b
                                        style={{
                                            width: `${(school.referrals / maxReferrals) * 100}%`,
                                        }}
                                    />
                                </div>
                                <em>
                                    {school.users}명 · {school.referrals}전환
                                </em>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="campaign-referral-admin">
                    <div className="admin-section-head">
                        <span>추천 링크 추가</span>
                        <strong>{form.schoolId || "학교 선택 필요"}</strong>
                    </div>
                    <div className="campaign-referral-form">
                        <label>
                            <span>추천 코드</span>
                            <input
                                value={form.referralCode}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        referralCode: event.target.value.toLowerCase(),
                                    }))
                                }
                                placeholder="school226"
                            />
                        </label>
                        <label>
                            <span>학교 검색</span>
                            <div className="campaign-school-search">
                                <Search size={15} />
                                <input
                                    value={schoolQuery}
                                    onChange={(event) => setSchoolQuery(event.target.value)}
                                    placeholder="학교명 또는 지역"
                                />
                            </div>
                        </label>
                        {schools.length > 0 && (
                            <div className="campaign-school-results">
                                {schools.map((school) => (
                                    <button
                                        key={school.id}
                                        type="button"
                                        onClick={() => selectSchool(school)}
                                    >
                                        <strong>{school.name}</strong>
                                        <span>{school.region}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <label>
                            <span>메모</span>
                            <input
                                value={form.note}
                                onChange={(event) =>
                                    setForm((current) => ({ ...current, note: event.target.value }))
                                }
                            />
                        </label>
                        <button type="button" className="primary-btn" onClick={saveReferral}>
                            <Link size={16} /> 추천 링크 저장
                        </button>
                    </div>
                </section>

                <section className="campaign-whitelist-panel">
                    <div className="admin-section-head">
                        <span>학교별 추천 링크</span>
                        <strong>{visibleStats.whitelist.length}</strong>
                    </div>
                    <div className="campaign-whitelist-table">
                        {visibleStats.whitelist.map((entry) => (
                            <div key={entry.referralCode}>
                                <strong>{entry.referralCode}</strong>
                                <span>{entry.schoolName}</span>
                                <em>{referralUrl(entry.referralCode)}</em>
                                <button
                                    type="button"
                                    className="admin-icon-btn"
                                    onClick={() => void deleteReferral(entry)}
                                    aria-label={`${entry.referralCode} 삭제`}
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="campaign-recent-panel">
                    <div className="admin-section-head">
                        <span>최근 인증</span>
                        <strong>{visibleStats.recentUsers.length}</strong>
                    </div>
                    <div className="campaign-recent-list">
                        {visibleStats.recentUsers.map((user) => (
                            <div key={user.id}>
                                <strong>{user.username}</strong>
                                <span>{user.schoolName}</span>
                                <em>{user.region}</em>
                            </div>
                        ))}
                    </div>
                </section>
            </section>

            {status && <p className="admin-status">{status}</p>}
            {error && <p className="error-text">{error}</p>}
        </main>
    );
}

function Metric({ label, value }: { label: string; value: number | string }) {
    return (
        <div>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}
