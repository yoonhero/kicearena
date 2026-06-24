export const SITE_PAGES = [
    "home",
    "competition",
    "practice",
    "profile",
    "login",
    "signup",
] as const;

export type SitePage = (typeof SITE_PAGES)[number];
type RoutedSitePage = Exclude<SitePage, "signup">;

type SiteRouteDefinition = {
    page: RoutedSitePage;
    canonicalPath: string;
    pathAliases: readonly string[];
    navLabel?: string;
    enabled: boolean;
};

const SITE_ROUTES = [
    {
        page: "home",
        canonicalPath: "/",
        pathAliases: ["/"],
        navLabel: "홈",
        enabled: true,
    },
    {
        page: "competition",
        canonicalPath: "/competition",
        pathAliases: ["/competition", "/contest", "/compeition"],
        navLabel: "대회",
        enabled: true,
    },
    {
        page: "practice",
        canonicalPath: "/practice",
        pathAliases: ["/practice"],
        navLabel: "연습",
        enabled: false,
    },
    {
        page: "profile",
        canonicalPath: "/profile",
        pathAliases: ["/profile"],
        navLabel: "프로필",
        enabled: true,
    },
    {
        page: "login",
        canonicalPath: "/login",
        pathAliases: ["/login"],
        navLabel: "로그인",
        enabled: true,
    },
] as const satisfies readonly SiteRouteDefinition[];

export const normalizeRoutePath = (pathname: string) => {
    const normalized = pathname.replace(/\/+$/, "");
    return normalized || "/";
};

export const sitePathForPage = (page: SitePage) => {
    if (page === "signup") return "/profile";
    return SITE_ROUTES.find((route) => route.page === page)?.canonicalPath ?? "/";
};

export const sitePageFromPath = (pathname: string): SitePage => {
    const normalized = normalizeRoutePath(pathname);
    return (
        SITE_ROUTES.find(
            (route) => route.enabled && route.pathAliases.some((alias) => alias === normalized),
        )?.page ?? "home"
    );
};

export const isSitePageEnabled = (page: SitePage) =>
    SITE_ROUTES.some((route) => route.page === page && route.enabled);

export const isEnabledSitePath = (pathname: string) => {
    const normalized = normalizeRoutePath(pathname);
    return SITE_ROUTES.some(
        (route) => route.enabled && route.pathAliases.some((alias) => alias === normalized),
    );
};

export const SITE_NAV_ITEMS = SITE_ROUTES.filter((route) => route.enabled && route.navLabel).map(
    (route) => ({
        page: route.page,
        label: route.navLabel,
        path: route.canonicalPath,
    }),
);
