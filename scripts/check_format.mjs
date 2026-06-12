import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const FORMAT_EXTENSIONS = new Set([
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
]);

function git(args) {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function changedFiles() {
    if (process.env.GITHUB_BASE_REF) {
        const baseRef = `origin/${process.env.GITHUB_BASE_REF}`;
        return git(["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}...HEAD`]);
    }

    if (process.env.GITHUB_EVENT_PATH && existsSync(process.env.GITHUB_EVENT_PATH)) {
        const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
        const before = event.before;
        if (typeof before === "string" && !/^0+$/.test(before)) {
            return git(["diff", "--name-only", "--diff-filter=ACMR", `${before}...HEAD`]);
        }
        return git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD^...HEAD"]);
    }

    return git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
}

const files = changedFiles()
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => FORMAT_EXTENSIONS.has(path.extname(file)))
    .filter((file) => existsSync(file));

if (files.length === 0) {
    console.log("No changed files need Prettier format checks.");
    process.exit(0);
}

execFileSync("bun", ["x", "prettier", "--check", ...files], { stdio: "inherit" });
