const siteTitle = "KICE 아레나";
const homeUpdatedAt = "2026-06-18";

function sanitizeHost(host: string): string {
    return host
        .trim()
        .split("/")[0]
        .replace(/[^A-Za-z0-9.:[\]-]/g, "");
}

export function getPublicOrigin(headers: {
    host?: string | string[];
    "x-forwarded-host"?: string | string[];
    "x-forwarded-proto"?: string | string[];
}): string {
    const forwardedHost = readHeader(headers["x-forwarded-host"])?.split(",")[0]?.trim();
    const host = sanitizeHost(forwardedHost || readHeader(headers.host) || "localhost");
    const forwardedProto = readHeader(headers["x-forwarded-proto"])?.split(",")[0]?.trim();
    const protocol = forwardedProto === "http" ? "http" : "https";
    return `${protocol}://${host}`;
}

export function renderRobotsTxt(origin: string): string {
    return [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /api/",
        `Sitemap: ${origin}/sitemap.xml`,
        "",
    ].join("\n");
}

export function renderSitemapXml(origin: string): string {
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        "  <url>",
        `    <loc>${origin}/</loc>`,
        `    <lastmod>${homeUpdatedAt}</lastmod>`,
        "    <changefreq>weekly</changefreq>",
        "    <priority>1.0</priority>",
        "  </url>",
        "</urlset>",
        "",
    ].join("\n");
}

export function renderSiteManifest(origin: string): Record<string, unknown> {
    return {
        name: siteTitle,
        short_name: siteTitle,
        description: "실시간 수학 모의고사 풀이 아레나",
        lang: "ko-KR",
        start_url: `${origin}/`,
        scope: `${origin}/`,
        display: "standalone",
        background_color: "#f4f0e6",
        theme_color: "#f4f0e6",
    };
}

function readHeader(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}
