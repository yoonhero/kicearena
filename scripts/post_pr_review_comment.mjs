#!/usr/bin/env bun
import { readFileSync } from "node:fs";

const MARKER = "<!-- kice-pr-review -->";
const [commentPath = "pr-review.md"] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
const eventPath = process.env.GITHUB_EVENT_PATH;

const request = async (url, options = {}) => {
    const response = await fetch(url, {
        ...options,
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(options.headers ?? {}),
        },
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`${options.method ?? "GET"} ${url} failed: ${response.status} ${body}`);
    }
    if (response.status === 204) return null;
    return response.json();
};

const main = async () => {
    if (!token) {
        console.log("GITHUB_TOKEN is unavailable; skipping PR review comment.");
        return;
    }
    if (!eventPath) {
        console.log("GITHUB_EVENT_PATH is unavailable; skipping PR review comment.");
        return;
    }

    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    const issueNumber = event.pull_request?.number;
    const repo = event.repository;
    if (!issueNumber || !repo) {
        console.log("This event is not a pull request; skipping PR review comment.");
        return;
    }

    const body = readFileSync(commentPath, "utf8");
    const commentsUrl = `${repo.url}/issues/${issueNumber}/comments`;
    const comments = await request(`${commentsUrl}?per_page=100`);
    const existing = comments.find(
        (comment) => comment.user?.type === "Bot" && comment.body?.includes(MARKER),
    );

    if (existing) {
        await request(existing.url, {
            method: "PATCH",
            body: JSON.stringify({ body }),
        });
        console.log(`Updated PR review comment ${existing.id}.`);
        return;
    }

    const created = await request(commentsUrl, {
        method: "POST",
        body: JSON.stringify({ body }),
    });
    console.log(`Created PR review comment ${created.id}.`);
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
