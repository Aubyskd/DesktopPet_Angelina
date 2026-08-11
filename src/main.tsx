import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Pet } from "./pet/Pet";
import { Settings } from "./settings/Settings";
import { MemoEditor } from "./memo/MemoEditor";
import { MemoPanel } from "./memo/MemoPanel";
import { TimerSetup } from "./timer/TimerSetup";

const label = getCurrentWindow().label;
const isTransparentWindow = label === "pet" || label === "memo-display";

document.documentElement.dataset.window = label;
document.body.dataset.window = label;
if (isTransparentWindow) {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

const content = label === "settings"
  ? <Settings />
  : label === "timer"
    ? <TimerSetup />
  : label === "memo"
    ? <MemoEditor />
    : label === "memo-display"
      ? <MemoPanel />
      : <Pet />;

createRoot(document.getElementById("root")!).render(<StrictMode>{content}</StrictMode>);
