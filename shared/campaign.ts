export type StudentStatus = "g3" | "repeat" | "other";

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
