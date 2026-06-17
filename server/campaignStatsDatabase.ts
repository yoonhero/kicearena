import type { CampaignStats, StudentStatus } from "../shared/campaign.js";
import type { CampaignDatabase } from "./campaignDatabase.js";

export type HighSchoolCampaignAdminStats = {
    schoolId: string;
    schoolName: string;
    region: string;
    users: number;
    referralEvents: number;
    representativeBadges: number;
};

export const readHighSchoolCampaignAdminStats = async (
    db: CampaignDatabase,
    limit = 100,
): Promise<HighSchoolCampaignAdminStats[]> => {
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const result = await db.query<{
        school_id: string;
        school_name: string;
        region: string;
        users: string;
        referral_events: string;
        representative_badges: string;
    }>(
        `WITH user_counts AS (
       SELECT school_id, count(*)::text AS users
       FROM campaign_users
       GROUP BY school_id
     ),
     referral_counts AS (
       SELECT user_account.school_id, count(referral.id)::text AS referral_events
       FROM campaign_referral_events referral
       JOIN campaign_users user_account ON user_account.id = referral.converted_user_id
       GROUP BY user_account.school_id
     ),
     representative_counts AS (
       SELECT school_id, count(*)::text AS representative_badges
       FROM school_representative_badges
       GROUP BY school_id
     )
     SELECT school.id AS school_id,
            school.name AS school_name,
            school.region,
            COALESCE(user_counts.users, '0') AS users,
            COALESCE(referral_counts.referral_events, '0') AS referral_events,
            COALESCE(representative_counts.representative_badges, '0') AS representative_badges
     FROM high_schools school
     LEFT JOIN user_counts ON user_counts.school_id = school.id
     LEFT JOIN referral_counts ON referral_counts.school_id = school.id
     LEFT JOIN representative_counts ON representative_counts.school_id = school.id
     WHERE user_counts.users IS NOT NULL
        OR referral_counts.referral_events IS NOT NULL
        OR representative_counts.representative_badges IS NOT NULL
     ORDER BY COALESCE(user_counts.users, '0')::bigint DESC,
              COALESCE(referral_counts.referral_events, '0')::bigint DESC,
              school.name
     LIMIT $1`,
        [boundedLimit],
    );
    return result.rows.map((row) => ({
        schoolId: row.school_id,
        schoolName: row.school_name,
        region: row.region,
        users: Number(row.users),
        referralEvents: Number(row.referral_events),
        representativeBadges: Number(row.representative_badges),
    }));
};

export const readCampaignStats = async (db: CampaignDatabase): Promise<CampaignStats> => {
    const [totals, topSchools, recentUsers, whitelist] = await Promise.all([
        db.query<{
            users: string;
            schools: string;
            referral_visits: string;
            referral_events: string;
            converted_referrals: string;
            whitelisted_links: string;
        }>(
            `SELECT
         (SELECT count(*)::text FROM campaign_users) AS users,
         (SELECT count(*)::text FROM high_schools) AS schools,
         (SELECT count(DISTINCT (referral_code, visitor_fingerprint))::text FROM campaign_referral_events) AS referral_visits,
         (SELECT count(*)::text FROM campaign_referral_events) AS referral_events,
         (SELECT count(*)::text FROM campaign_referral_events WHERE converted_user_id IS NOT NULL) AS converted_referrals,
         (SELECT count(*)::text FROM campaign_referral_whitelist) AS whitelisted_links`,
        ),
        db.query<{
            school_id: string;
            school_name: string;
            region: string;
            users: string;
            referrals: string;
        }>(
            `WITH user_counts AS (
         SELECT school_id, count(*)::text AS users
         FROM campaign_users
         GROUP BY school_id
       ),
       referral_counts AS (
         SELECT user_account.school_id, count(referral.id)::text AS referrals
         FROM campaign_referral_events referral
         JOIN campaign_users user_account ON user_account.id = referral.converted_user_id
         GROUP BY user_account.school_id
       )
       SELECT school.id AS school_id, school.name AS school_name, school.region,
              COALESCE(user_counts.users, '0') AS users,
              COALESCE(referral_counts.referrals, '0') AS referrals
       FROM high_schools school
       LEFT JOIN user_counts ON user_counts.school_id = school.id
       LEFT JOIN referral_counts ON referral_counts.school_id = school.id
       WHERE user_counts.users IS NOT NULL OR referral_counts.referrals IS NOT NULL
       ORDER BY COALESCE(user_counts.users, '0')::bigint DESC,
                COALESCE(referral_counts.referrals, '0')::bigint DESC,
                school.name
       LIMIT 10`,
        ),
        db.query<{
            id: string;
            username: string;
            student_status: StudentStatus;
            school_name: string;
            region: string;
            created_at: Date | string;
        }>(
            `SELECT user_account.id, user_account.username, user_account.student_status,
              school.name AS school_name, school.region, user_account.created_at
       FROM campaign_users user_account
       JOIN high_schools school ON school.id = user_account.school_id
       ORDER BY user_account.created_at DESC
       LIMIT 12`,
        ),
        db.query<{
            referral_code: string;
            school_id: string;
            school_name: string;
            region: string;
            note: string;
            created_at: Date | string;
        }>(
            `SELECT whitelist.referral_code, whitelist.school_id, school.name AS school_name,
              school.region, whitelist.note, whitelist.created_at
       FROM campaign_referral_whitelist whitelist
       JOIN high_schools school ON school.id = whitelist.school_id
       ORDER BY whitelist.created_at DESC, whitelist.referral_code`,
        ),
    ]);
    const totalRow = totals.rows[0];
    const referralVisits = Number(totalRow?.referral_visits ?? 0);
    const convertedReferrals = Number(totalRow?.converted_referrals ?? 0);
    return {
        totals: {
            users: Number(totalRow?.users ?? 0),
            schools: Number(totalRow?.schools ?? 0),
            referralVisits,
            referralEvents: Number(totalRow?.referral_events ?? 0),
            convertedReferrals,
            referralConversionRate: referralVisits === 0 ? 0 : convertedReferrals / referralVisits,
            whitelistedLinks: Number(totalRow?.whitelisted_links ?? 0),
        },
        topSchools: topSchools.rows.map((row) => ({
            schoolId: row.school_id,
            schoolName: row.school_name,
            region: row.region,
            users: Number(row.users),
            referrals: Number(row.referrals),
        })),
        recentUsers: recentUsers.rows.map((row) => ({
            id: row.id,
            username: row.username,
            studentStatus: row.student_status,
            schoolName: row.school_name,
            region: row.region,
            createdAt:
                row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        })),
        whitelist: whitelist.rows.map((row) => ({
            referralCode: row.referral_code,
            schoolId: row.school_id,
            schoolName: row.school_name,
            region: row.region,
            note: row.note,
            createdAt:
                row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        })),
    };
};
