import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { applyTheme, readTheme } from "./theme";

// Apply persisted theme BEFORE the first paint — otherwise dark-mode
// users would see a one-frame light flash on app open.
applyTheme(readTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
