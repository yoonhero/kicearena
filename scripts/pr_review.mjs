#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const MARKER = "<!-- kice-pr-review -->";
const OUTPUT_PATH = process.env.PR_REVIEW_OUTPUT ?? "pr-review.md";
const SOURCE_EXTENSIONS = new Set([".css", ".md", ".mjs", ".ts", ".tsx"]);
const LINE_CAP = 400;

const runGit = (args) =>
    execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const readEvent = () => {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath || !existsSync(eventPath)) return null;
    return JSON.parse(readFileSync(eventPath, "utf8"));
};

const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

const resolveBaseRef = (event) => {
    if (process.env.PR_REVIEW_BASE_SHA) return process.env.PR_REVIEW_BASE_SHA;
    if (event?.pull_request?.base?.sha) return event.pull_request.base.sha;
    if (process.env.PR_REVIEW_BASE_REF) return process.env.PR_REVIEW_BASE_REF;
    return "origin/dev";
};

const changedFiles = (baseRef) => {
    const output = runGit(["diff", "--name-status", `${baseRef}...HEAD`]);
    if (!output) return [];
    return output.split("\n").map((line) => {
        const parts = line.split("\t");
        const status = parts[0];
        const file = status.startsWith("R") ? parts[2] : parts[1];
        return { status, file };
    });
};

const diffStat = (baseRef) => {
    const output = runGit(["diff", "--shortstat", `${baseRef}...HEAD`]);
    const changed = Number(output.match(/(\d+) files? changed/)?.[1] ?? 0);
    const insertions = Number(output.match(/(\d+) insertions?\(\+\)/)?.[1] ?? 0);
    const deletions = Number(output.match(/(\d+) deletions?\(-\)/)?.[1] ?? 0);
    return { changed, insertions, deletions, text: output || "No file changes." };
};

const diffForFile = (baseRef, file) => {
    try {
        return runGit(["diff", "--unified=0", `${baseRef}...HEAD`, "--", file]);
    } catch {
        return "";
    }
};

const lineCount = (file) => {
    if (!existsSync(file) || !statSync(file).isFile()) return 0;
    const body = readFileSync(file, "utf8");
    if (!body) return 0;
    return body.split("\n").length - (body.endsWith("\n") ? 1 : 0);
};

const isSourceFile = (file) => SOURCE_EXTENSIONS.has(path.extname(file));

const hasMatchingTest = (file) => {
    const parsed = path.parse(file);
    if (parsed.name.endsWith(".test") || parsed.name.endsWith(".spec")) return true;
    return [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"].some((suffix) =>
        existsSync(path.join(parsed.dir, `${parsed.name}${suffix}`)),
    );
};

const addFinding = (findings, severity, title, detail) => {
    findings.push({ severity, title, detail });
};

const branchFindings = (findings, event) => {
    const base = event?.pull_request?.base?.ref;
    const head = event?.pull_request?.head?.ref;
    if (!base) return;
    const allowedFeatureTarget = base === "dev";
    const allowedReleaseTarget = base === "main" && head === "dev";
    if (!allowedFeatureTarget && !allowedReleaseTarget) {
        addFinding(
            findings,
            "high",
            "PR target branch does not match the branch policy",
            `Feature PRs should target \`dev\`. Only release PRs from \`dev\` should target \`main\`. Current target: \`${head ?? "unknown"} -> ${base}\`.`,
        );
    }
};

const lineCapFindings = (findings, files) => {
    for (const { file, status } of files) {
        if (status === "D" || !isSourceFile(file) || !existsSync(file)) continue;
        const lines = lineCount(file);
        if (lines > LINE_CAP) {
            addFinding(
                findings,
                "high",
                "File exceeds the project line cap",
                `\`${file}\` has ${lines} lines. Project rule keeps final files at ${LINE_CAP} lines or less.`,
            );
        }
    }
};

const dependencyFindings = (findings, files) => {
    const changed = new Set(files.map(({ file }) => file));
    if (changed.has("package.json") && !changed.has("bun.lock")) {
        addFinding(
            findings,
            "medium",
            "Dependency manifest changed without lockfile update",
            "`package.json` changed, but `bun.lock` did not. Confirm this is intentional.",
        );
    }
};

const testCoverageFindings = (findings, files) => {
    for (const { file, status } of files) {
        if (status === "D") continue;
        if (!/^(server|shared)\//.test(file)) continue;
        if (!/\.(ts|tsx)$/.test(file) || file.endsWith(".test.ts") || file.endsWith(".test.tsx"))
            continue;
        if (hasMatchingTest(file)) continue;
        addFinding(
            findings,
            "medium",
            "Server/shared change has no colocated test",
            `\`${file}\` changed without a colocated test file. If this is behavior-only refactor, mention why in the PR.`,
        );
    }
};

const diffPatternFindings = (findings, files, baseRef) => {
    for (const { file, status } of files) {
        if (status === "D" || !isSourceFile(file)) continue;
        const diff = diffForFile(baseRef, file);
        const addedLines = diff
            .split("\n")
            .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
        if (addedLines.some((line) => /@ts-ignore|@ts-expect-error/.test(line))) {
            addFinding(
                findings,
                "medium",
                "TypeScript suppression added",
                `\`${file}\` adds a TypeScript suppression. Confirm the PR explains why it is necessary.`,
            );
        }
        if (addedLines.some((line) => /eslint-disable/.test(line))) {
            addFinding(
                findings,
                "medium",
                "ESLint suppression added",
                `\`${file}\` adds an ESLint suppression. Keep it narrow and justify it in review.`,
            );
        }
        if (addedLines.some((line) => /TODO|FIXME/.test(line))) {
            addFinding(
                findings,
                "low",
                "TODO/FIXME added",
                `\`${file}\` adds a TODO/FIXME. Make sure it has an owner or issue reference.`,
            );
        }
    }
};

const workflowFindings = (findings, files) => {
    if (files.some(({ file }) => file.startsWith(".github/workflows/"))) {
        addFinding(
            findings,
            "medium",
            "GitHub Actions workflow changed",
            "Workflow changes can affect deploy, CI, or permissions. Review them manually before merge.",
        );
    }
};

const largePrFindings = (findings, stat) => {
    if (stat.insertions + stat.deletions >= 1200 || stat.changed >= 35) {
        addFinding(
            findings,
            "low",
            "Large PR",
            `${stat.text}. Consider splitting if the PR mixes unrelated behavior.`,
        );
    }
};

const formatFindings = (findings) => {
    if (findings.length === 0) return "No heuristic review findings.\n";
    const order = { high: 0, medium: 1, low: 2 };
    return findings
        .sort((a, b) => order[a.severity] - order[b.severity])
        .map(
            (finding) =>
                `- **${finding.severity.toUpperCase()}**: ${finding.title}\n  ${finding.detail}`,
        )
        .join("\n");
};

const main = () => {
    const event = readEvent();
    const baseRef = resolveBaseRef(event);
    const files = changedFiles(baseRef);
    const stat = diffStat(baseRef);
    const findings = [];

    branchFindings(findings, event);
    lineCapFindings(findings, files);
    dependencyFindings(findings, files);
    testCoverageFindings(findings, files);
    diffPatternFindings(findings, files, baseRef);
    workflowFindings(findings, files);
    largePrFindings(findings, stat);

    const changedList =
        files.length === 0
            ? "No files changed."
            : files.map(({ status, file }) => `- \`${status}\` ${file}`).join("\n");
    const markdown = `${MARKER}
## Free PR Review

This is a deterministic, no-paid-API review pass. It checks branch policy, line caps, lockfile drift, missing colocated tests, suppressions, workflow changes, and PR size.

### Summary
- Base: \`${baseRef}\`
- Diff: ${stat.text}
- Files changed: ${files.length}

### Findings
${formatFindings(findings)}

### Changed Files
${changedList}

<sub>Run locally with: \`PR_REVIEW_BASE_REF=${shellQuote(baseRef)} bun scripts/pr_review.mjs\`</sub>
`;
    writeFileSync(OUTPUT_PATH, `${markdown}\n`);
    console.log(markdown);
};

main();
