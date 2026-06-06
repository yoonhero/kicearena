import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProblemBodyBlock } from "../shared/game.js";
import { createExamCatalogPool, type ExamAssetInput, migrateExamCatalog, seedExamCatalog } from "./examDatabase.js";
import { readExams } from "./exams.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examsDir = path.join(__dirname, "exams");

const contentTypeForPath = (assetPath: string) => {
  const ext = path.extname(assetPath).toLowerCase();
  if (ext === ".svg") return "image/svg+xml; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
};

const collectAssetPaths = (body: ProblemBodyBlock[] | undefined, image: string | undefined) => {
  const assetPaths = new Set<string>();
  if (image) assetPaths.add(`problems/${image}`);
  for (const block of body ?? []) {
    if (block.kind === "diagram") assetPaths.add(block.src);
  }
  return assetPaths;
};

const readExamAssets = () => {
  const exams = readExams(examsDir);
  const assets: ExamAssetInput[] = [];

  for (const exam of exams) {
    const assetPaths = new Set<string>();
    for (const problem of exam.problems) {
      for (const assetPath of collectAssetPaths(problem.body, problem.image)) assetPaths.add(assetPath);
    }

    for (const assetPath of assetPaths) {
      const filePath = path.join(examsDir, exam.id, assetPath);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing exam asset: ${filePath}`);
      }
      assets.push({
        examId: exam.id,
        path: assetPath,
        contentType: contentTypeForPath(assetPath),
        body: fs.readFileSync(filePath)
      });
    }
  }

  return { exams, assets };
};

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the exam catalog.");
  }

  const pool = createExamCatalogPool(databaseUrl);
  try {
    const { exams, assets } = readExamAssets();
    await migrateExamCatalog(pool);
    await seedExamCatalog(pool, exams, undefined, assets);
    console.log(`Seeded ${exams.length} exams and ${assets.length} assets into Postgres.`);
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
