import { Ticket } from "lucide-react";
import type { CampaignUserPublic, ReferralLocationVerification } from "../../../shared/campaign";

type AdmissionTicketData = {
    badgeLabel: string;
    referralCode: string;
    region: string;
    schoolName: string;
    verifiedAt: string;
};

const ticketSchool = (
    campaignUser: CampaignUserPublic | null,
    referralVerification: ReferralLocationVerification | null,
) => campaignUser?.school ?? referralVerification?.school ?? null;

const ticketVerifiedAt = (referralVerification: ReferralLocationVerification | null) =>
    referralVerification
        ? new Date(referralVerification.verifiedAt).toLocaleDateString("ko-KR", {
              month: "2-digit",
              day: "2-digit",
          })
        : "";

const readAdmissionTicketData = (
    campaignUser: CampaignUserPublic | null,
    referralVerification: ReferralLocationVerification | null,
): AdmissionTicketData => {
    const school = ticketSchool(campaignUser, referralVerification);
    return {
        badgeLabel: campaignUser?.badgeLabel ?? referralVerification?.nickname ?? "",
        referralCode: campaignUser?.referralCode ?? referralVerification?.referralCode ?? "",
        region: school?.region ?? "",
        schoolName: school?.name ?? "",
        verifiedAt: ticketVerifiedAt(referralVerification),
    };
};

export function SavedAdmissionTicket({
    campaignUser,
    entrantStatus,
    referralVerification,
}: {
    campaignUser: CampaignUserPublic | null;
    entrantStatus: string;
    referralVerification: ReferralLocationVerification | null;
}) {
    const ticket = readAdmissionTicketData(campaignUser, referralVerification);

    return (
        <section className="gym-omr-block gym-ticket-block" aria-label="저장된 수험표">
            <div className="gym-omr-heading">
                <Ticket size={17} />
                <span>저장된 수험표</span>
                <strong>{entrantStatus}</strong>
            </div>
            <div className="gym-ticket-card">
                <div className="gym-ticket-title">
                    <span>2026학년도 KICE ARENA</span>
                    <strong>수 험 표</strong>
                </div>
                <div className="gym-ticket-main">
                    <div className="gym-ticket-row">
                        <span>성명</span>
                        <strong>{ticket.badgeLabel}</strong>
                    </div>
                    <div className="gym-ticket-row">
                        <span>인증</span>
                        <strong>{ticket.verifiedAt}</strong>
                    </div>
                    <div className="gym-ticket-row">
                        <span>학교</span>
                        <strong>{ticket.schoolName}</strong>
                    </div>
                    <div className="gym-ticket-row">
                        <span>지역</span>
                        <strong>{ticket.region}</strong>
                    </div>
                </div>
                <div className="gym-ticket-side">
                    <span>수험번호</span>
                    <strong>{ticket.referralCode}</strong>
                </div>
            </div>
            <p className="gym-ticket-note">이 기기에 저장된 수험표로 참가합니다.</p>
        </section>
    );
}
