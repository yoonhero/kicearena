import type { CampaignUserPublic } from "../../../shared/campaign";

const CAMPAIGN_USER_KEY = "kice-campaign-user";

export const readStoredCampaignUser = (): CampaignUserPublic | null => {
    const raw = window.localStorage.getItem(CAMPAIGN_USER_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as CampaignUserPublic;
        return parsed?.username && parsed?.school?.id ? parsed : null;
    } catch {
        return null;
    }
};

export const saveCampaignUser = (user: CampaignUserPublic) => {
    window.localStorage.setItem(CAMPAIGN_USER_KEY, JSON.stringify(user));
};

export const entrantNickname = (user: CampaignUserPublic) =>
    Array.from(user.username.trim() || user.badgeLabel.trim())
        .slice(0, 6)
        .join("");
