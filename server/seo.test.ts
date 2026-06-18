import { describe, expect, it } from "vitest";
import { getPublicOrigin, renderRobotsTxt, renderSiteManifest, renderSitemapXml } from "./seo";

describe("seo helpers", () => {
    it("uses forwarded production origin when present", () => {
        expect(
            getPublicOrigin({
                host: "127.0.0.1:3001",
                "x-forwarded-host": "kice.example.com",
                "x-forwarded-proto": "https",
            }),
        ).toBe("https://kice.example.com");
    });

    it("falls back to https host and strips unsafe host characters", () => {
        expect(getPublicOrigin({ host: "kice.example.com/path" })).toBe("https://kice.example.com");
    });

    it("renders robots with a crawlable home and sitemap", () => {
        expect(renderRobotsTxt("https://kice.example.com")).toBe(
            [
                "User-agent: *",
                "Allow: /",
                "Disallow: /admin",
                "Disallow: /api/",
                "Sitemap: https://kice.example.com/sitemap.xml",
                "",
            ].join("\n"),
        );
    });

    it("renders sitemap and manifest with absolute home URLs", () => {
        expect(renderSitemapXml("https://kice.example.com")).toContain(
            "<loc>https://kice.example.com/</loc>",
        );
        expect(renderSiteManifest("https://kice.example.com")).toMatchObject({
            lang: "ko-KR",
            start_url: "https://kice.example.com/",
            scope: "https://kice.example.com/",
        });
    });
});
