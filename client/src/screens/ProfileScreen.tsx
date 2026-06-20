import type { ReactNode } from "react";
import type { CampaignUserPublic, ReferralLocationVerification } from "../../../shared/campaign";
import { AdmissionSkeletonTicket } from "./AdmissionSkeletonTicket";
import { SavedAdmissionTicket } from "./SavedAdmissionTicket";

export function ProfileScreen({
    campaignUser,
    referralVerification,
    goSignup,
    siteNav,
    goCompetition,
}: {
    campaignUser: CampaignUserPublic | null;
    referralVerification: ReferralLocationVerification | null;
    goSignup: () => void;
    siteNav: ReactNode;
    goCompetition: () => void;
}) {
    const hasTicket = Boolean(campaignUser || referralVerification);
    const canContinueSignup = Boolean(referralVerification && !campaignUser?.emailVerified);
    return (
        <main className="exam-site-layout">
            <section className="exam-profile-paper" aria-labelledby="profile-title">
                <header className="exam-reference-head">
                    <strong>수험표</strong>
                    <span>응시자 등록 정보</span>
                    <em>{campaignUser?.emailVerified ? "이메일 확인" : "확인 필요"}</em>
                </header>
                <h1 id="profile-title">나의 수험표</h1>
                {siteNav}
                {canContinueSignup && (
                    <div className="exam-profile-actions">
                        <button type="button" className="gym-primary-action" onClick={goSignup}>
                            회원가입 계속
                        </button>
                    </div>
                )}
                <div className="exam-profile-ticket">
                    {hasTicket ? (
                        <SavedAdmissionTicket
                            campaignUser={campaignUser}
                            entrantStatus={
                                campaignUser?.emailVerified
                                    ? "수험표 저장 완료"
                                    : "이메일 확인 대기"
                            }
                            referralVerification={referralVerification}
                        />
                    ) : (
                        <AdmissionSkeletonTicket note="위치 인증 후 수험표를 발급할 수 있습니다." />
                    )}
                </div>
                {!hasTicket && (
                    <div className="exam-profile-actions">
                        <button
                            type="button"
                            className="gym-secondary-action"
                            onClick={goCompetition}
                        >
                            대회 목록 보기
                        </button>
                    </div>
                )}
            </section>
        </main>
    );
}
