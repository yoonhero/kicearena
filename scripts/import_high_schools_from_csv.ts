import fs from "node:fs";
import { createExamCatalogPool } from "../server/examDatabase.js";
import {
    migrateCampaign,
    type HighSchoolInput,
    upsertHighSchools,
} from "../server/campaignDatabase.js";

const parseCsv = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quoted) {
            if (char === '"' && text[index + 1] === '"') {
                cell += '"';
                index += 1;
            } else if (char === '"') quoted = false;
            else cell += char;
        } else if (char === '"') quoted = true;
        else if (char === ",") {
            row.push(cell);
            cell = "";
        } else if (char === "\n") {
            row.push(cell.replace(/\r$/, ""));
            rows.push(row);
            row = [];
            cell = "";
        } else cell += char;
    }
    if (cell || row.length > 0) rows.push([...row, cell]);
    return rows;
};

const regionFromAddress = (address: string) => address.split(/\s+/).slice(0, 2).join(" ");

const readSchoolsFromCsv = (filePath: string): HighSchoolInput[] => {
    const rows = parseCsv(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
    const header = rows.shift() ?? [];
    const column = new Map(header.map((name, index) => [name, index]));
    const get = (row: string[], name: string) => row[column.get(name) ?? -1]?.trim() ?? "";

    return rows
        .filter((row) => get(row, "학교급구분") === "고등학교" && get(row, "운영상태") === "운영")
        .map((row) => {
            const address = get(row, "소재지도로명주소") || get(row, "소재지지번주소");
            return {
                id: get(row, "학교ID"),
                name: get(row, "학교명"),
                region: regionFromAddress(address),
                address,
                latitude: Number(get(row, "위도")) || null,
                longitude: Number(get(row, "경도")) || null,
            };
        })
        .filter((school) => school.id && school.name && school.address);
};

const [csvPath] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!csvPath || !databaseUrl) {
    console.error(
        "Usage: DATABASE_URL=postgres://... bun scripts/import_high_schools_from_csv.ts <csv-path>",
    );
    process.exit(1);
}

const db = createExamCatalogPool(databaseUrl);
try {
    const schools = readSchoolsFromCsv(csvPath);
    await migrateCampaign(db);
    await upsertHighSchools(db, schools, "official-csv");
    console.log(`Imported ${schools.length} high schools from ${csvPath}.`);
} finally {
    await db.end();
}
