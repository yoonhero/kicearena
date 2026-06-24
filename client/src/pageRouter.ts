import { isEnabledSitePath, normalizeRoutePath } from "./lib/siteRoutes";

export type PageRoute = "app" | "admin" | "admin-campaign" | "not-found";

export const getPageRoute = (pathname: string): PageRoute => {
    const normalized = normalizeRoutePath(pathname);
    if (isEnabledSitePath(normalized)) return "app";

    switch (normalized) {
        case "/admin":
            return "admin";
        case "/admin/campaign":
            return "admin-campaign";
        default:
            return "not-found";
    }
};
