import type { QueryResult } from "pg";
import {
    DEFAULT_SNU_REFERRAL_CODE,
    DEFAULT_SNU_REFERRAL_SCHOOL_ID,
    schoolRepresentativeBadge,
    type CampaignUserPublic,
    type HighSchool,
    type StudentStatus,
} from "../shared/campaign.js";
import { readDefaultHighSchools } from "./defaultHighSchools.js";

export { migrateCampaign } from "./campaignMigrations.js";

export interface CampaignDatabase {
    query<T extends object = Record<string, unknown>>(
        text: string,
        values?: unknown[],
    ): Promise<QueryResult<T>>;
}

export type HighSchoolInput = {
    id: string;
    name: string;
    region: string;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
};

export type CampaignUserInput = {
    username: string;
    email: string;
    passwordHash: string;
    studentStatus: StudentStatus;
    marketingEmailConsent: boolean;
    termsAcceptedAt: string;
    privacyAcceptedAt: string;
    emailVerificationCodeHash: string;
    emailVerificationExpiresAt: string;
    schoolId: string;
    paymentMeta: Record<string, unknown>;
    referredByCode: string | null;
};

export type SchoolRepresentativeBadgeInput = {
    userId: string;
    schoolId: string;
    awardedBy: string;
    awardedAt: number;
};

export type ReferralWhitelistBinding = {
    referralCode: string;
    schoolId: string;
};

type HighSchoolRow = {
    id: string;
    name: string;
    region: string;
    address: string;
    latitude: string | number | null;
    longitude: string | number | null;
};

type CampaignUserRow = {
    id: string;
    username: string;
    email: string;
    email_verified_at: string | null;
    password_hash: string;
    student_status: StudentStatus;
    marketing_email_consent: boolean | null;
    school_id: string;
    referral_code: string;
    referral_allowed: boolean | null;
    school_name: string;
    region: string;
    address: string;
    latitude: string | number | null;
    longitude: string | number | null;
};

const toHighSchool = (row: HighSchoolRow): HighSchool => ({
    id: row.id,
    name: row.name,
    region: row.region,
    address: row.address,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
});

const toPublicUser = (row: CampaignUserRow): CampaignUserPublic => {
    const school = toHighSchool({
        id: row.school_id,
        name: row.school_name,
        region: row.region,
        address: row.address,
        latitude: row.latitude,
        longitude: row.longitude,
    });
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        emailVerified: Boolean(row.email_verified_at),
        studentStatus: row.student_status,
        school,
        referralCode: row.referral_code,
        referralAllowed: row.referral_allowed === true,
        badgeLabel: schoolRepresentativeBadge(school.name),
        marketingEmailConsent: row.marketing_email_consent === true,
    };
};

export const seedDefaultHighSchools = async (db: CampaignDatabase) => {
    await db.query(
        `DELETE FROM high_schools school
     WHERE school.source = 'seed'
       AND NOT EXISTS (
         SELECT 1
         FROM campaign_users user_account
         WHERE user_account.school_id = school.id
       )`,
    );
    await upsertHighSchools(db, readDefaultHighSchools(), "official-20260320");
};

export const upsertHighSchools = async (
    db: CampaignDatabase,
    schools: HighSchoolInput[],
    source: string,
) => {
    for (const school of schools) {
        await db.query(
            `INSERT INTO high_schools (id, name, region, address, latitude, longitude, source, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         region = EXCLUDED.region,
         address = EXCLUDED.address,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         source = EXCLUDED.source,
         updated_at = now()`,
            [
                school.id,
                school.name,
                school.region,
                school.address,
                school.latitude ?? null,
                school.longitude ?? null,
                source,
            ],
        );
    }
};

export const searchHighSchools = async (
    db: CampaignDatabase,
    query: string,
    limit = 12,
): Promise<HighSchool[]> => {
    const normalized = query.trim();
    const result = await db.query<HighSchoolRow>(
        `SELECT id, name, region, address, latitude, longitude
     FROM high_schools
     WHERE $1 = '' OR name ILIKE $2 OR region ILIKE $2 OR address ILIKE $2
     ORDER BY CASE WHEN name = $1 THEN 0 WHEN name ILIKE $3 THEN 1 ELSE 2 END, name, region
     LIMIT $4`,
        [normalized, `%${normalized}%`, `${normalized}%`, limit],
    );
    return result.rows.map(toHighSchool);
};

export const readCampaignUserByUsername = async (db: CampaignDatabase, username: string) => {
    const result = await db.query<CampaignUserRow>(
        `SELECT user_account.id, user_account.username, user_account.email, user_account.email_verified_at,
            user_account.password_hash, user_account.student_status,
            user_account.marketing_email_consent, user_account.school_id, user_account.referral_code,
            whitelist.referral_code IS NOT NULL AS referral_allowed,
            school.name AS school_name, school.region, school.address, school.latitude, school.longitude
     FROM campaign_users user_account
     JOIN high_schools school ON school.id = user_account.school_id
     LEFT JOIN campaign_referral_whitelist whitelist ON whitelist.referral_code = user_account.referral_code
     WHERE user_account.username = $1`,
        [username],
    );
    const row = result.rows[0];
    return row ? { passwordHash: row.password_hash, user: toPublicUser(row) } : null;
};

export const createCampaignUser = async (
    db: CampaignDatabase,
    input: CampaignUserInput,
): Promise<CampaignUserPublic> => {
    const result = await db.query<CampaignUserRow>(
        `WITH referrer AS (
       SELECT id FROM campaign_users WHERE referral_code = $12
     ), created AS (
       INSERT INTO campaign_users (
         id, username, email, password_hash, student_status, marketing_email_consent,
         terms_accepted_at, privacy_accepted_at, email_verification_code_hash,
         email_verification_expires_at, phone, school_id, referral_code, referred_by_user_id, payment_meta
       )
       SELECT $1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9,
              $10::timestamptz, '', $11, $13, referrer.id, $14::jsonb
       FROM (SELECT 1) singleton
       LEFT JOIN referrer ON true
       RETURNING *
     )
     SELECT created.id, created.username, created.email, created.email_verified_at,
            created.password_hash, created.student_status,
            created.marketing_email_consent, created.school_id, created.referral_code,
            whitelist.referral_code IS NOT NULL AS referral_allowed,
            school.name AS school_name, school.region, school.address, school.latitude, school.longitude
     FROM created
     JOIN high_schools school ON school.id = created.school_id
     LEFT JOIN campaign_referral_whitelist whitelist ON whitelist.referral_code = created.referral_code`,
        [
            cryptoRandomId(),
            input.username,
            input.email,
            input.passwordHash,
            input.studentStatus,
            input.marketingEmailConsent,
            input.termsAcceptedAt,
            input.privacyAcceptedAt,
            input.emailVerificationCodeHash,
            input.emailVerificationExpiresAt,
            input.schoolId,
            input.referredByCode,
            cryptoRandomId(9),
            JSON.stringify(input.paymentMeta),
        ],
    );
    return toPublicUser(result.rows[0]);
};

export const verifyCampaignUserEmail = async (
    db: CampaignDatabase,
    username: string,
    codeHash: string,
    nowIso: string,
): Promise<CampaignUserPublic | null> => {
    const result = await db.query<CampaignUserRow>(
        `WITH verified AS (
       UPDATE campaign_users
       SET email_verified_at = $3::timestamptz,
           email_verification_code_hash = NULL,
           email_verification_expires_at = NULL
       WHERE username = $1
         AND email_verified_at IS NULL
         AND email_verification_code_hash = $2
         AND email_verification_expires_at >= $3::timestamptz
       RETURNING *
     )
     SELECT verified.id, verified.username, verified.email, verified.email_verified_at,
            verified.password_hash, verified.student_status, verified.marketing_email_consent,
            verified.school_id, verified.referral_code,
            whitelist.referral_code IS NOT NULL AS referral_allowed,
            school.name AS school_name, school.region, school.address, school.latitude, school.longitude
     FROM verified
     JOIN high_schools school ON school.id = verified.school_id
     LEFT JOIN campaign_referral_whitelist whitelist ON whitelist.referral_code = verified.referral_code`,
        [username, codeHash, nowIso],
    );
    const row = result.rows[0];
    return row ? toPublicUser(row) : null;
};

export const recordReferralVisit = async (
    db: CampaignDatabase,
    referralCode: string,
    visitorFingerprint: string,
) => {
    await db.query(
        `INSERT INTO campaign_referral_events (referral_code, visitor_fingerprint)
     VALUES ($1, $2)`,
        [referralCode, visitorFingerprint],
    );
};

export const readReferralWhitelistSchool = async (
    db: CampaignDatabase,
    referralCode: string,
): Promise<HighSchool | null> => {
    const result = await db.query<HighSchoolRow>(
        `SELECT school.id, school.name, school.region, school.address, school.latitude, school.longitude
       FROM campaign_referral_whitelist whitelist
       JOIN high_schools school ON school.id = whitelist.school_id
       WHERE whitelist.referral_code = $1`,
        [referralCode],
    );
    return result.rows[0] ? toHighSchool(result.rows[0]) : null;
};

export const isReferralCodeWhitelisted = async (db: CampaignDatabase, referralCode: string) =>
    Boolean(await readReferralWhitelistSchool(db, referralCode));

export const parseReferralWhitelistBindings = (entries: string[]): ReferralWhitelistBinding[] =>
    entries.flatMap((entry) => {
        const [rawCode, rawSchoolId] = entry.split(":");
        const referralCode = rawCode?.trim().toLowerCase() ?? "";
        const schoolId = rawSchoolId?.trim() ?? "";
        if (!/^[2-9a-z]{4,32}$/.test(referralCode) || !schoolId) return [];
        return [{ referralCode, schoolId }];
    });

const DEFAULT_REFERRAL_WHITELIST = [
    `${DEFAULT_SNU_REFERRAL_CODE}:${DEFAULT_SNU_REFERRAL_SCHOOL_ID}`,
];

export const syncReferralWhitelist = async (db: CampaignDatabase, entries: string[]) => {
    for (const binding of parseReferralWhitelistBindings([
        ...DEFAULT_REFERRAL_WHITELIST,
        ...entries,
    ])) {
        await db.query(
            `INSERT INTO campaign_referral_whitelist (referral_code, school_id, note)
       VALUES ($1, $2, 'env')
       ON CONFLICT (referral_code) DO UPDATE SET
         school_id = EXCLUDED.school_id,
         note = EXCLUDED.note`,
            [binding.referralCode, binding.schoolId],
        );
    }
};

export const attachReferralConversion = async (
    db: CampaignDatabase,
    referralCode: string,
    userId: string,
    visitorFingerprint: string,
) => {
    await db.query(
        `UPDATE campaign_referral_events
     SET converted_user_id = $2
     WHERE id = (
       SELECT id
       FROM campaign_referral_events
       WHERE referral_code = $1 AND visitor_fingerprint = $3 AND converted_user_id IS NULL
       ORDER BY created_at DESC
       LIMIT 1
     )`,
        [referralCode, userId, visitorFingerprint],
    );
};

export const awardSchoolRepresentativeBadge = async (
    db: CampaignDatabase,
    input: SchoolRepresentativeBadgeInput,
) => {
    await db.query(
        `INSERT INTO school_representative_badges (user_id, school_id, awarded_by, awarded_at)
     VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
     ON CONFLICT (user_id) DO UPDATE SET
       school_id = EXCLUDED.school_id,
       awarded_by = EXCLUDED.awarded_by,
       awarded_at = EXCLUDED.awarded_at`,
        [input.userId, input.schoolId, input.awardedBy, input.awardedAt],
    );
};

const cryptoRandomId = (length = 12) => {
    const alphabet = "23456789abcdefghijkmnopqrstuvwxyz";
    return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(
        "",
    );
};
