import type { HighSchool } from "../shared/campaign.js";
import type { CampaignDatabase } from "./campaignDatabase.js";

type HighSchoolGeoRow = {
    id: string;
    name: string;
    region: string;
    address: string;
    latitude: string | number | null;
    longitude: string | number | null;
    distance_km: string | number;
};

const toHighSchool = (row: HighSchoolGeoRow): HighSchool => ({
    id: row.id,
    name: row.name,
    region: row.region,
    address: row.address,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
});

export const findHighSchoolNearLocation = async (
    db: CampaignDatabase,
    schoolId: string,
    latitude: number,
    longitude: number,
    maxDistanceKm: number,
): Promise<{ school: HighSchool; distanceKm: number } | null> => {
    const latDelta = maxDistanceKm / 111;
    const lonDelta = maxDistanceKm / Math.max(20, 111 * Math.cos((latitude * Math.PI) / 180));
    const result = await db.query<HighSchoolGeoRow>(
        `SELECT id, name, region, address, latitude, longitude,
            6371 * acos(
              least(1, greatest(-1,
                cos(radians($1)) * cos(radians(latitude::double precision)) *
                cos(radians(longitude::double precision) - radians($2)) +
                sin(radians($1)) * sin(radians(latitude::double precision))
              ))
            ) AS distance_km
     FROM high_schools
     WHERE id = $3
       AND latitude IS NOT NULL AND longitude IS NOT NULL
       AND latitude BETWEEN $4 AND $5
       AND longitude BETWEEN $6 AND $7
     ORDER BY distance_km ASC
     LIMIT 1`,
        [
            latitude,
            longitude,
            schoolId,
            latitude - latDelta,
            latitude + latDelta,
            longitude - lonDelta,
            longitude + lonDelta,
        ],
    );
    const row = result.rows[0];
    if (!row) return null;
    const distanceKm = Number(row.distance_km);
    if (!Number.isFinite(distanceKm) || distanceKm > maxDistanceKm) return null;
    return { school: toHighSchool(row), distanceKm };
};
