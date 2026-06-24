import { describe, expect, it } from "vitest";
import {
    isEnabledSitePath,
    isSitePageEnabled,
    SITE_NAV_ITEMS,
    sitePageFromPath,
    sitePathForPage,
} from "./siteRoutes";

describe("site routes", () => {
    it("maps enabled public paths to site pages", () => {
        expect(sitePageFromPath("/")).toBe("home");
        expect(sitePageFromPath("/competition")).toBe("competition");
        expect(sitePageFromPath("/contest")).toBe("competition");
        expect(sitePageFromPath("/compeition")).toBe("competition");
        expect(sitePageFromPath("/profile")).toBe("profile");
        expect(sitePageFromPath("/login")).toBe("login");
    });

    it("keeps the practice page disabled for public routing", () => {
        expect(isSitePageEnabled("practice")).toBe(false);
        expect(isEnabledSitePath("/practice")).toBe(false);
        expect(sitePageFromPath("/practice")).toBe("home");
    });

    it("exposes only enabled pages in the site nav", () => {
        expect(SITE_NAV_ITEMS.map((item) => item.page)).toEqual([
            "home",
            "competition",
            "profile",
            "login",
        ]);
    });

    it("keeps internal signup on the profile URL", () => {
        expect(sitePathForPage("signup")).toBe("/profile");
    });
});
