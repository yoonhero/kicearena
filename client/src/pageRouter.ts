export type PageRoute = "app" | "admin" | "admin-campaign" | "not-found";

const normalizePathname = (pathname: string) => {
    const normalized = pathname.replace(/\/+$/, "");
    return normalized || "/";
};

export const getPageRoute = (pathname: string): PageRoute => {
    switch (normalizePathname(pathname)) {
        case "/":
        case "/competition":
        case "/compeition":
        case "/contest":
        case "/practice":
        case "/profile":
        case "/login":
            return "app";
        case "/admin":
            return "admin";
        case "/admin/campaign":
            return "admin-campaign";
        default:
            return "not-found";
    }
};
