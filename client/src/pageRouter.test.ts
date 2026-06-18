import { describe, expect, it } from "vitest";
import { getPageRoute } from "./pageRouter";

describe("page router", () => {
    it("routes known pages", () => {
        expect(getPageRoute("/")).toBe("app");
        expect(getPageRoute("/contest")).toBe("app");
        expect(getPageRoute("/profile")).toBe("app");
        expect(getPageRoute("/signup")).toBe("app");
        expect(getPageRoute("/admin")).toBe("admin");
        expect(getPageRoute("/admin/campaign")).toBe("admin-campaign");
    });

    it("accepts trailing slashes on known pages", () => {
        expect(getPageRoute("/admin/")).toBe("admin");
        expect(getPageRoute("/admin/campaign/")).toBe("admin-campaign");
        expect(getPageRoute("/contest/")).toBe("app");
    });

    it("returns not-found for unknown page paths", () => {
        expect(getPageRoute("/missing")).toBe("not-found");
        expect(getPageRoute("/admin/missing")).toBe("not-found");
    });
});
