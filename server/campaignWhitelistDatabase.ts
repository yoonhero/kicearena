import type { CampaignDatabase, ReferralWhitelistBinding } from "./campaignDatabase.js";

export type ReferralWhitelistEntry = ReferralWhitelistBinding & {
    schoolName: string;
    region: string;
    note: string;
    createdAt: string;
};

type ReferralWhitelistRow = {
    referral_code: string;
    school_id: string;
    school_name: string;
    region: string;
    note: string;
    created_at: Date | string;
};

const toReferralWhitelistEntry = (row: ReferralWhitelistRow): ReferralWhitelistEntry => ({
    referralCode: row.referral_code,
    schoolId: row.school_id,
    schoolName: row.school_name,
    region: row.region,
    note: row.note,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
});

export const readReferralWhitelist = async (
    db: CampaignDatabase,
): Promise<ReferralWhitelistEntry[]> => {
    const result = await db.query<ReferralWhitelistRow>(
        `SELECT whitelist.referral_code, whitelist.school_id, school.name AS school_name,
                school.region, whitelist.note, whitelist.created_at
       FROM campaign_referral_whitelist whitelist
       JOIN high_schools school ON school.id = whitelist.school_id
       ORDER BY whitelist.created_at DESC, whitelist.referral_code`,
    );
    return result.rows.map(toReferralWhitelistEntry);
};

export const upsertReferralWhitelistEntry = async (
    db: CampaignDatabase,
    binding: ReferralWhitelistBinding & { note?: string },
): Promise<ReferralWhitelistEntry | null> => {
    const result = await db.query<ReferralWhitelistRow>(
        `WITH saved AS (
         INSERT INTO campaign_referral_whitelist (referral_code, school_id, note)
         SELECT $1, school.id, $3
         FROM high_schools school
         WHERE school.id = $2
         ON CONFLICT (referral_code) DO UPDATE SET
           school_id = EXCLUDED.school_id,
           note = EXCLUDED.note
         RETURNING referral_code, school_id, note, created_at
       )
       SELECT saved.referral_code, saved.school_id, school.name AS school_name,
              school.region, saved.note, saved.created_at
       FROM saved
       JOIN high_schools school ON school.id = saved.school_id`,
        [binding.referralCode, binding.schoolId, binding.note ?? "admin"],
    );
    return result.rows[0] ? toReferralWhitelistEntry(result.rows[0]) : null;
};

export const deleteReferralWhitelistEntry = async (db: CampaignDatabase, referralCode: string) => {
    const result = await db.query(
        "DELETE FROM campaign_referral_whitelist WHERE referral_code = $1",
        [referralCode],
    );
    return (result.rowCount ?? 0) > 0;
};
