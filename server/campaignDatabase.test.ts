import { describe, expect, it } from "vitest";
import {
    attachReferralConversion,
    createCampaignUser,
    type CampaignDatabase,
    migrateCampaign,
    parseReferralWhitelistBindings,
    recordReferralVisit,
    searchHighSchools,
    syncReferralWhitelist,
    upsertHighSchools,
} from "./campaignDatabase.js";
import { readCampaignStats } from "./campaignStatsDatabase.js";
import { readDefaultHighSchools } from "./defaultHighSchools.js";
import { findHighSchoolNearLocation } from "./highSchoolGeo.js";

const makeQueryResult = <T extends object>(rows: T[] = []) => ({
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
});

describe("campaign database persistence", () => {
    it("creates tables and indexes for school search, users, and referral stats", async () => {
        const statements: string[] = [];
        const db: CampaignDatabase = {
            query: async (text) => {
                statements.push(text);
                return makeQueryResult();
            },
        };

        await migrateCampaign(db);

        const joined = statements.join("\n");
        expect(joined).toContain("CREATE TABLE IF NOT EXISTS high_schools");
        expect(joined).toContain("CREATE INDEX IF NOT EXISTS high_schools_geo_idx");
        expect(joined).toContain("CREATE TABLE IF NOT EXISTS campaign_users");
        expect(joined).toContain("CREATE TABLE IF NOT EXISTS campaign_referral_events");
        expect(joined).toContain("CREATE TABLE IF NOT EXISTS campaign_referral_whitelist");
        expect(joined).toContain("school_id text REFERENCES high_schools");
        expect(joined).toContain("campaign_referral_whitelist_school_idx");
        expect(statements).toContain(
            "CREATE INDEX IF NOT EXISTS high_schools_name_region_idx ON high_schools(name, region)",
        );
        expect(statements).toContain(
            "CREATE INDEX IF NOT EXISTS campaign_users_school_created_idx ON campaign_users(school_id, created_at DESC)",
        );
        expect(statements).toContain(
            "CREATE INDEX IF NOT EXISTS campaign_referral_events_code_created_idx ON campaign_referral_events(referral_code, created_at DESC)",
        );
    });

    it("creates users with password hashes, school references, and public badges", async () => {
        const queries: { text: string; values?: unknown[] }[] = [];
        const db: CampaignDatabase = {
            query: async <T extends object>(text: string, values?: unknown[]) => {
                queries.push({ text, values });
                return makeQueryResult([
                    {
                        id: "generated-user",
                        username: "student2",
                        password_hash: "scrypt:hash",
                        student_status: "g3",
                        phone: "01012345678",
                        school_id: "school-1",
                        referral_code: "mine2",
                        referral_allowed: true,
                        school_name: "KICE High",
                        region: "Seoul",
                        address: "1 Test-ro",
                        latitude: 37.5,
                        longitude: 127,
                    } as T,
                ]);
            },
        };

        await expect(
            createCampaignUser(db, {
                username: "student2",
                passwordHash: "scrypt:hash",
                studentStatus: "g3",
                phone: "01012345678",
                schoolId: "school-1",
                paymentMeta: { noticeOptIn: true },
                referredByCode: "ref1",
            }),
        ).resolves.toMatchObject({
            username: "student2",
            studentStatus: "g3",
            school: { id: "school-1", name: "KICE High" },
            referralAllowed: true,
            badgeLabel: "KICE High 대표",
        });
        expect(queries[0]?.text).toContain(
            "SELECT id FROM campaign_users WHERE referral_code = $7",
        );
        expect(queries[0]?.text).toContain("password_hash");
        expect(queries[0]?.values?.[2]).toBe("scrypt:hash");
        expect(queries[0]?.values?.[6]).toBe("ref1");
    });

    it("keeps school imports and referral writes scoped", async () => {
        const queries: { text: string; values?: unknown[] }[] = [];
        const db: CampaignDatabase = {
            query: async (text, values) => {
                queries.push({ text, values });
                return makeQueryResult();
            },
        };

        await upsertHighSchools(
            db,
            [
                {
                    id: "school-1",
                    name: "KICE High",
                    region: "Seoul",
                    address: "1 Test-ro",
                    latitude: 37.5,
                    longitude: 127,
                },
            ],
            "admin",
        );
        await recordReferralVisit(db, "ref1", "visitor-1");
        await attachReferralConversion(db, "ref1", "user-2", "visitor-1");

        expect(queries[0]?.text).toContain("ON CONFLICT (id) DO UPDATE");
        expect(queries[1]?.text).toContain("INSERT INTO campaign_referral_events");
        expect(queries[2]?.text).toContain("ORDER BY created_at DESC");
    });

    it("loads the bundled full operating high-school dataset", () => {
        const schools = readDefaultHighSchools();
        expect(schools.length).toBeGreaterThan(2000);
        expect(schools.some((school) => school.name === "경기고등학교")).toBe(true);
        expect(schools.every((school) => school.id && school.name && school.address)).toBe(true);
    });

    it("syncs only valid referral whitelist code-school bindings", async () => {
        const queries: { text: string; values?: unknown[] }[] = [];
        const db: CampaignDatabase = {
            query: async (text, values) => {
                queries.push({ text, values });
                return makeQueryResult();
            },
        };

        expect(
            parseReferralWhitelistBindings(["abc234:B100000546", "abc234", "BAD!:school"]),
        ).toEqual([{ referralCode: "abc234", schoolId: "B100000546" }]);
        await syncReferralWhitelist(db, ["abc234:B100000546", "BAD!", "x"]);

        expect(queries).toHaveLength(1);
        expect(queries[0]?.text).toContain("campaign_referral_whitelist");
        expect(queries[0]?.text).toContain("school_id = EXCLUDED.school_id");
        expect(queries[0]?.values).toEqual(["abc234", "B100000546"]);
    });

    it("verifies only the code-bound high school within radius", async () => {
        const queries: { text: string; values?: unknown[] }[] = [];
        const db: CampaignDatabase = {
            query: async <T extends object>(text: string, values?: unknown[]) => {
                queries.push({ text, values });
                return makeQueryResult([
                    {
                        id: "school-1",
                        name: "KICE High",
                        region: "Seoul",
                        address: "1 Test-ro",
                        latitude: 37.5,
                        longitude: 127,
                        distance_km: 0.42,
                    } as T,
                ]);
            },
        };

        await expect(
            findHighSchoolNearLocation(db, "school-1", 37.5, 127, 1),
        ).resolves.toMatchObject({
            school: { id: "school-1", name: "KICE High" },
            distanceKm: 0.42,
        });
        await expect(
            findHighSchoolNearLocation(db, "school-1", 37.5, 127, 0.1),
        ).resolves.toBeNull();
        expect(queries[0]?.text).toContain("ORDER BY distance_km ASC");
        expect(queries[0]?.text).toContain("WHERE id = $3");
        expect(queries[0]?.text).toContain("latitude BETWEEN $4 AND $5");
        expect(queries[0]?.values?.slice(0, 3)).toEqual([37.5, 127, "school-1"]);
        expect(queries[0]?.values).toHaveLength(7);
    });

    it("searches schools and reads bounded admin stats", async () => {
        const queries: { text: string; values?: unknown[] }[] = [];
        const db: CampaignDatabase = {
            query: async <T extends object>(text: string, values?: unknown[]) => {
                queries.push({ text, values });
                if (text.includes("WHERE $1 = ''")) {
                    return makeQueryResult([
                        {
                            id: "school-1",
                            name: "KICE High",
                            region: "Seoul",
                            address: "1 Test-ro",
                            latitude: 37.5,
                            longitude: 127,
                        } as T,
                    ]);
                }
                if (text.includes("converted_referrals")) {
                    return makeQueryResult([
                        {
                            users: "2",
                            schools: "15",
                            referral_visits: "3",
                            converted_referrals: "1",
                        } as T,
                    ]);
                }
                if (text.includes("COALESCE(referral_counts.referrals")) {
                    return makeQueryResult([
                        {
                            school_id: "school-1",
                            school_name: "KICE High",
                            region: "Seoul",
                            users: "2",
                            referrals: "1",
                        } as T,
                    ]);
                }
                return makeQueryResult([
                    {
                        id: "u1",
                        username: "student",
                        student_status: "g3",
                        school_name: "KICE High",
                        region: "Seoul",
                        created_at: "2026-06-12T00:00:00.000Z",
                    } as T,
                ]);
            },
        };

        await expect(searchHighSchools(db, "KICE")).resolves.toHaveLength(1);
        await expect(readCampaignStats(db)).resolves.toMatchObject({
            totals: { users: 2, schools: 15, referralVisits: 3, convertedReferrals: 1 },
            topSchools: [{ schoolName: "KICE High", users: 2, referrals: 1 }],
            recentUsers: [{ username: "student", schoolName: "KICE High" }],
        });
        expect(queries[0]?.values).toEqual(["KICE", "%KICE%", "KICE%", 12]);
    });
});
