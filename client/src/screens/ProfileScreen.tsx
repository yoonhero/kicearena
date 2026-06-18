import type { CampaignUserPublic, ReferralLocationVerification } from "../../../shared/campaign";
import { AdmissionSkeletonTicket } from "./AdmissionSkeletonTicket";
import { SavedAdmissionTicket } from "./SavedAdmissionTicket";

export function ProfileScreen({
    campaignUser,
    referralVerification,
    goSignup,
}: {
    campaignUser: CampaignUserPublic | null;
    referralVerification: ReferralLocationVerification | null;
    goSignup: () => void;
}) {
    const hasTicket = Boolean(campaignUser || referralVerification);
    return (
        <main className="exam-site-layout">
            <section className="exam-profile-paper" aria-labelledby="profile-title">
                <header className="exam-reference-head">
                    <strong>수험표</strong>
                    <span>응시자 등록 정보</span>
                    <em>{campaignUser?.emailVerified ? "이메일 확인" : "확인 필요"}</em>
                </header>
                <h1 id="profile-title">나의 수험표</h1>
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
                        <AdmissionSkeletonTicket note="초대 링크에서 위치 인증 후 회원가입을 완료하면 수험표가 저장됩니다." />
                    )}
                </div>
                {!campaignUser?.emailVerified && (
                    <button type="button" className="gym-primary-action" onClick={goSignup}>
                        회원가입 계속하기
                    </button>
                )}
            </section>
        </main>
    );
}
