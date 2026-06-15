export type StudentStatus = "g3" | "repeat" | "other";
export const DEFAULT_SNU_REFERRAL_CODE = "snu226";
export const DEFAULT_SNU_REFERRAL_SCHOOL_ID = "SNU-GWANAK";

export type HighSchool = {
    id: string;
    name: string;
    region: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
};

export type CampaignUserPublic = {
    id: string;
    username: string;
    studentStatus: StudentStatus;
    phone: string;
    school: HighSchool;
    referralCode: string;
    referralAllowed: boolean;
    badgeLabel: string;
};

export type ReferralLocationVerification = {
    referralCode: string;
    school: HighSchool;
    distanceKm: number;
    verifiedAt: string;
};

export type CampaignStats = {
    totals: {
        users: number;
        schools: number;
        referralVisits: number;
        convertedReferrals: number;
    };
    topSchools: Array<{
        schoolId: string;
        schoolName: string;
        region: string;
        users: number;
        referrals: number;
    }>;
    recentUsers: Array<{
        id: string;
        username: string;
        studentStatus: StudentStatus;
        schoolName: string;
        region: string;
        createdAt: string;
    }>;
};

export const STUDENT_STATUSES: StudentStatus[] = ["g3", "repeat", "other"];

export const normalizeStudentStatus = (value: unknown): StudentStatus =>
    value === "g3" || value === "repeat" || value === "other" ? value : "other";

export const schoolRepresentativeBadge = (schoolName: string) =>
    `${schoolName.replace(/\s+/g, " ").trim()} 대표`;
