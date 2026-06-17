import React from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import { getPageRoute } from "./pageRouter";
import "./styles.css";

const loadRoot = async () => {
    const route = getPageRoute(window.location.pathname);
    if (route === "admin-campaign") {
        const { AdminCampaignScreen } = await import("./screens/AdminCampaignScreen");
        return AdminCampaignScreen;
    }
    if (route === "admin") {
        const { AdminScreen } = await import("./screens/AdminScreen");
        return AdminScreen;
    }
    if (route === "not-found") {
        const { NotFoundScreen } = await import("./screens/NotFoundScreen");
        return NotFoundScreen;
    }
    const { App } = await import("./App");
    return App;
};

void loadRoot().then((Root) => {
    createRoot(document.getElementById("root")!).render(
        <React.StrictMode>
            <Root />
        </React.StrictMode>,
    );
});
