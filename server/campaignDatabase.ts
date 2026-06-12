import type { QueryResult } from "pg";
import {
    schoolRepresentativeBadge,
    type CampaignUserPublic,
    type HighSchool,
    type StudentStatus,
} from "../shared/campaign.js";
import { readDefaultHighSchools } from "./defaultHighSchools.js";

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
    passwordHash: string;
    studentStatus: StudentStatus;
    phone: string;
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
    password_hash: string;
    student_status: StudentStatus;
    phone: string;
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
        studentStatus: row.student_status,
        phone: row.phone,
        school,
        referralCode: row.referral_code,
        referralAllowed: row.referral_allowed === true,
        badgeLabel: schoolRepresentativeBadge(school.name),
    };
};

export const migrateCampaign = async (db: CampaignDatabase) => {
    await db.query(
        `CREATE TABLE IF NOT EXISTS high_schools (
      id text PRIMARY KEY,
      name text NOT NULL,
      region text NOT NULL,
      address text NOT NULL,
      latitude numeric,
      longitude numeric,
      source text NOT NULL DEFAULT 'seed',
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    );
    await db.query(
        "CREATE INDEX IF NOT EXISTS high_schools_name_region_idx ON high_schools(name, region)",
    );
    await db.query(
        "CREATE INDEX IF NOT EXISTS high_schools_geo_idx ON high_schools(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL",
    );
    await db.query(
        `CREATE TABLE IF NOT EXISTS campaign_users (
      id text PRIMARY KEY,
      username text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      student_status text NOT NULL CHECK (student_status IN ('g3', 'repeat', 'other')),
      phone text NOT NULL,
      school_id text NOT NULL REFERENCES high_schools(id) ON DELETE RESTRICT,
      referral_code text NOT NULL UNIQUE,
      referred_by_user_id text REFERENCES campaign_users(id) ON DELETE SET NULL,
      payment_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    );
    await db.query(
        "CREATE INDEX IF NOT EXISTS campaign_users_school_created_idx ON campaign_users(school_id, created_at DESC)",
    );
    await db.query(
        "CREATE INDEX IF NOT EXISTS campaign_users_referred_by_idx ON campaign_users(referred_by_user_id)",
    );
    await db.query(
        `CREATE TABLE IF NOT EXISTS campaign_referral_events (
      id bigserial PRIMARY KEY,
      referral_code text NOT NULL,
      visitor_fingerprint text NOT NULL,
      converted_user_id text REFERENCES campaign_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    );
    await db.query(
        "CREATE INDEX IF NOT EXISTS campaign_referral_events_code_created_idx ON campaign_referral_events(referral_code, created_at DESC)",
    );
    await db.query(
        "CREATE INDEX IF NOT EXISTS campaign_referral_events_converted_user_idx ON campaign_referral_events(converted_user_id) WHERE converted_user_id IS NOT NULL",
    );
    await db.query(
        `CREATE TABLE IF NOT EXISTS school_representative_badges (
      user_id text PRIMARY KEY REFERENCES campaign_users(id) ON DELETE CASCADE,
      school_id text NOT NULL REFERENCES high_schools(id) ON DELETE CASCADE,
      awarded_by text NOT NULL,
      awarded_at timestamptz NOT NULL DEFAULT now()
    )`,
    );
    await db.query(
        "CREATE INDEX IF NOT EXISTS school_representative_badges_school_idx ON school_representative_badges(school_id)",
    );
    await db.query(
        `CREATE TABLE IF NOT EXISTS campaign_referral_whitelist (
      referral_code text PRIMARY KEY,
      note text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    );
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
        `SELECT user_account.id, user_account.username, user_account.password_hash, user_account.student_status,
            user_account.phone, user_account.school_id, user_account.referral_code,
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
       SELECT id FROM campaign_users WHERE referral_code = $7
     ), created AS (
       INSERT INTO campaign_users (
         id, username, password_hash, student_status, phone, school_id, referral_code,
         referred_by_user_id, payment_meta
       )
       SELECT $1, $2, $3, $4, $5, $6, $8, referrer.id, $9::jsonb
       FROM (SELECT 1) singleton
       LEFT JOIN referrer ON true
       RETURNING *
     )
     SELECT created.id, created.username, created.password_hash, created.student_status,
            created.phone, created.school_id, created.referral_code,
            whitelist.referral_code IS NOT NULL AS referral_allowed,
            school.name AS school_name, school.region, school.address, school.latitude, school.longitude
     FROM created
     JOIN high_schools school ON school.id = created.school_id
     LEFT JOIN campaign_referral_whitelist whitelist ON whitelist.referral_code = created.referral_code`,
        [
            cryptoRandomId(),
            input.username,
            input.passwordHash,
            input.studentStatus,
            input.phone,
            input.schoolId,
            input.referredByCode,
            cryptoRandomId(9),
            JSON.stringify(input.paymentMeta),
        ],
    );
    return toPublicUser(result.rows[0]);
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

export const isReferralCodeWhitelisted = async (
    db: CampaignDatabase,
    referralCode: string,
): Promise<boolean> => {
    const result = await db.query<{ exists: boolean }>(
        `SELECT EXISTS (
       SELECT 1
       FROM campaign_referral_whitelist
       WHERE referral_code = $1
     ) AS exists`,
        [referralCode],
    );
    return result.rows[0]?.exists === true;
};

export const syncReferralWhitelist = async (db: CampaignDatabase, referralCodes: string[]) => {
    for (const referralCode of referralCodes) {
        if (!/^[2-9a-z]{4,32}$/.test(referralCode)) continue;
        await db.query(
            `INSERT INTO campaign_referral_whitelist (referral_code, note)
       VALUES ($1, 'env')
       ON CONFLICT (referral_code) DO NOTHING`,
            [referralCode],
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
