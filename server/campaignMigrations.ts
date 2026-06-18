import type { CampaignDatabase } from "./campaignDatabase.js";

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
      student_status text NOT NULL CHECK (student_status IN ('g1', 'g2', 'g3', 'returning', 'repeat', 'university')),
      phone text NOT NULL,
      school_id text NOT NULL REFERENCES high_schools(id) ON DELETE RESTRICT,
      referral_code text NOT NULL UNIQUE,
      referred_by_user_id text REFERENCES campaign_users(id) ON DELETE SET NULL,
      payment_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    );
    await db.query("ALTER TABLE campaign_users ADD COLUMN IF NOT EXISTS email text");
    await db.query(
        "UPDATE campaign_users SET email = username || '@legacy.kice.local' WHERE email IS NULL",
    );
    await db.query("ALTER TABLE campaign_users ALTER COLUMN email SET NOT NULL");
    await db.query(
        "CREATE UNIQUE INDEX IF NOT EXISTS campaign_users_email_lower_idx ON campaign_users(lower(email))",
    );
    await db.query(
        "ALTER TABLE campaign_users ADD COLUMN IF NOT EXISTS marketing_email_consent boolean NOT NULL DEFAULT false",
    );
    await db.query(
        "ALTER TABLE campaign_users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz",
    );
    await db.query(
        "ALTER TABLE campaign_users ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz",
    );
    await db.query(
        "ALTER TABLE campaign_users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz",
    );
    await db.query(
        "ALTER TABLE campaign_users ADD COLUMN IF NOT EXISTS email_verification_code_hash text",
    );
    await db.query(
        "ALTER TABLE campaign_users ADD COLUMN IF NOT EXISTS email_verification_expires_at timestamptz",
    );
    await db.query(
        "UPDATE campaign_users SET student_status = 'g3' WHERE student_status = 'other'",
    );
    await db.query(
        "ALTER TABLE campaign_users DROP CONSTRAINT IF EXISTS campaign_users_student_status_check",
    );
    await db.query(
        "ALTER TABLE campaign_users ADD CONSTRAINT campaign_users_student_status_check CHECK (student_status IN ('g1', 'g2', 'g3', 'returning', 'repeat', 'university'))",
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
      school_id text REFERENCES high_schools(id) ON DELETE CASCADE,
      note text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    );
    await db.query(
        "ALTER TABLE campaign_referral_whitelist ADD COLUMN IF NOT EXISTS school_id text REFERENCES high_schools(id) ON DELETE CASCADE",
    );
    await db.query(
        "CREATE INDEX IF NOT EXISTS campaign_referral_whitelist_school_idx ON campaign_referral_whitelist(school_id)",
    );
};
