import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./fonts.css";
import "@fontsource/righteous/400.css";
import { App } from "./App";
import "./styles.css";
import "./typography.css";
import "./accessibility.css";
import "./today-system.css";
import "./unified-system.css";
import "./navigation.css";
import "./brand-system.css";
import "./guidance.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/yange-sw.js", { scope: "/" });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
