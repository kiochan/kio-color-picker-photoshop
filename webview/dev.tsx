import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { installPreviewHost } from "./preview.js";
import "./styles.css";

installPreviewHost();
const root = document.getElementById("root");
if (!root) throw new Error("Missing React root");
createRoot(root).render(<App />);
new EventSource("/esbuild").addEventListener("change", () => location.reload());
