import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AdminScreen } from "./screens/AdminScreen";
import "katex/dist/katex.min.css";
import "./styles.css";

const Root = window.location.pathname === "/admin" ? AdminScreen : App;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
