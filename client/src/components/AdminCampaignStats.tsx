import { useState } from "react";
import { BadgeCheck, RefreshCw, Users } from "lucide-react";
import type { CampaignStats } from "../../../shared/campaign";

export function AdminCampaignStats({ token }: { token: string }) {
    const [stats, setStats] = useState<CampaignStats | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const loadStats = async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/admin/campaign/stats", {
                headers: token ? { "X-Admin-Token": token } : {},
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

    return (
        <section className="admin-campaign">
            <div className="admin-section-head">
                <span>입소문 캠페인</span>
                <button
                    type="button"
                    className="admin-icon-btn"
                    onClick={() => void loadStats()}
                    aria-label="캠페인 통계 새로고침"
                    disabled={loading}
                >
                    <RefreshCw size={16} />
                </button>
            </div>
            {stats && (
                <>
                    <div className="campaign-stat-grid">
                        <Stat label="인증" value={stats.totals.users} />
                        <Stat label="학교" value={stats.totals.schools} />
                        <Stat label="방문" value={stats.totals.referralVisits} />
                        <Stat label="전환" value={stats.totals.convertedReferrals} />
                    </div>
                    <div className="campaign-rank-list">
                        {stats.topSchools.map((school) => (
                            <div key={school.schoolId}>
                                <BadgeCheck size={15} />
                                <strong>{school.schoolName}</strong>
                                <span>{school.region}</span>
                                <em>
                                    {school.users}명 · {school.referrals}전환
                                </em>
                            </div>
                        ))}
                    </div>
                    <div className="campaign-recent-list">
                        {stats.recentUsers.map((user) => (
                            <div key={user.id}>
                                <Users size={14} />
                                <strong>{user.username}</strong>
                                <span>{user.schoolName}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
            {!stats && !error && (
                <p className="admin-empty-copy">새로고침으로 인증자와 전파 현황을 확인합니다.</p>
            )}
            {error && <p className="error-text">{error}</p>}
        </section>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}
