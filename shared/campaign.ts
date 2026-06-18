export type StudentStatus = "g1" | "g2" | "g3" | "returning" | "repeat" | "university";
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
    email: string;
    emailVerified: boolean;
    studentStatus: StudentStatus;
    school: HighSchool;
    referralCode: string;
    referralAllowed: boolean;
    badgeLabel: string;
    marketingEmailConsent: boolean;
};

export type ReferralLocationVerification = {
    referralCode: string;
    school: HighSchool;
    distanceKm: number;
    verifiedAt: string;
    verificationToken?: string;
    nickname?: string;
};

export type CampaignStats = {
    totals: {
        users: number;
        schools: number;
        referralVisits: number;
        referralEvents: number;
        convertedReferrals: number;
        referralConversionRate: number;
        whitelistedLinks: number;
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
    whitelist: Array<{
        referralCode: string;
        schoolId: string;
        schoolName: string;
        region: string;
        note: string;
        createdAt: string;
    }>;
};

export const STUDENT_STATUSES: StudentStatus[] = [
    "g1",
    "g2",
    "g3",
    "returning",
    "repeat",
    "university",
];

export const normalizeStudentStatus = (value: unknown): StudentStatus =>
    STUDENT_STATUSES.includes(value as StudentStatus) ? (value as StudentStatus) : "g3";

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
    g1: "고1",
    g2: "고2",
    g3: "고3",
    returning: "반수",
    repeat: "재수",
    university: "대학생",
};

export const schoolRepresentativeBadge = (schoolName: string) =>
    `${schoolName.replace(/\s+/g, " ").trim()} 대표`;
