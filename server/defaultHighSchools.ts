import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import type { HighSchoolInput } from "./campaignDatabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fullDatasetPath = path.join(__dirname, "data", "high-schools-20260320.json.gz");

const FALLBACK_HIGH_SCHOOLS: HighSchoolInput[] = [
    {
        id: "B000000556",
        name: "경기고등학교",
        region: "서울 강남구",
        address: "서울특별시 강남구 영동대로 643",
        latitude: 37.5169,
        longitude: 127.0642,
    },
    {
        id: "B000011924",
        name: "경복고등학교",
        region: "서울 종로구",
        address: "서울특별시 종로구 자하문로28가길 9",
        latitude: 37.5861,
        longitude: 126.9691,
    },
    {
        id: "B000011819",
        name: "서울과학고등학교",
        region: "서울 종로구",
        address: "서울특별시 종로구 혜화로 63",
        latitude: 37.5903,
        longitude: 127.0034,
    },
];

const isHighSchoolInput = (value: unknown): value is HighSchoolInput => {
    if (!value || typeof value !== "object") return false;
    const item = value as Record<string, unknown>;
    return (
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.region === "string" &&
        typeof item.address === "string" &&
        (item.latitude === null || typeof item.latitude === "number") &&
        (item.longitude === null || typeof item.longitude === "number")
    );
};

export const readDefaultHighSchools = (): HighSchoolInput[] => {
    try {
        const parsed = JSON.parse(gunzipSync(fs.readFileSync(fullDatasetPath)).toString("utf8"));
        if (Array.isArray(parsed) && parsed.every(isHighSchoolInput) && parsed.length > 1000) {
            return parsed;
        }
    } catch {
        return FALLBACK_HIGH_SCHOOLS;
    }
    return FALLBACK_HIGH_SCHOOLS;
};
