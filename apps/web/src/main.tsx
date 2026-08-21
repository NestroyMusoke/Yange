import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./fonts.css";
import "@fontsource-variable/spline-sans";
import { App } from "./App";
import "./styles.css";
import "./typography.css";
import "./accessibility.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
