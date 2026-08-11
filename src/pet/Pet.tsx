import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { LogicalSize, PhysicalPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { PetAnimationManager } from "./PetAnimation";
import { loadConfig, onConfigChanged, saveConfig } from "../services/configService";
import { launchExecutable } from "../services/launcherService";
import { saveCurrentPetPosition, showWindow, syncMemoPosition } from "../services/windowService";
import type { AppConfig } from "../types/config";
import { DEFAULT_CONFIG } from "../types/config";
import { eventScheduler } from "../services/eventScheduler";
import "./pet.css";

const idleModules = import.meta.glob<string>("/src/assets/pet/idle/*.{png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});
const selectedModules = import.meta.glob<string>("/src/assets/pet/selected.{png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

const idleImages = Object.entries(idleModules)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, url]) => url);
const selectedImage = Object.values(selectedModules)[0] ?? idleImages[0] ?? "";

// Start decoding every frame as soon as the pet webview loads, so later swaps use the cache.
for (const source of [...idleImages, selectedImage].filter(Boolean)) {
  const image = new Image();
  image.src = source;
  void image.decode().catch(() => undefined);
}

function reportError(error: unknown): void {
  void invoke("show_error", { message: error instanceof Error ? error.message : String(error) });
}

export function Pet() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [imageSource, setImageSource] = useState(idleImages[0] ?? "");
  const [interactionMode, setInteractionMode] = useState(false);
  const [baseSize, setBaseSize] = useState({ width: 320, height: 320 });
  const animationRef = useRef<PetAnimationManager | null>(null);
  const dragStarted = useRef(false);
  const appWindow = useMemo(() => getCurrentWindow(), []);

  const applySize = useCallback(async (scale: number, size = baseSize) => {
    await appWindow.setSize(new LogicalSize(
      Math.max(1, Math.round(size.width * scale)),
      Math.max(1, Math.round(size.height * scale)),
    ));
    await syncMemoPosition();
  }, [appWindow, baseSize]);

  useEffect(() => {
    let disposed = false;
    let unlistenConfig: (() => void) | undefined;
    let unlistenMenu: (() => void) | undefined;
    void (async () => {
      const loaded = await loadConfig();
      if (disposed) return;
      setConfig(loaded);
      await appWindow.setAlwaysOnTop(loaded.alwaysOnTop);
      unlistenConfig = await onConfigChanged((next) => {
        setConfig(next);
        void appWindow.setAlwaysOnTop(next.alwaysOnTop);
      });
      unlistenMenu = await listen<string>("pet-menu-action", async ({ payload }) => {
        try {
          if (payload === "hide") await appWindow.hide();
          else if (payload === "show-memo") await invoke("set_memo_visibility", { visible: true });
          else if (payload === "add-memo") await showWindow("memo");
          else if (payload === "settings") await showWindow("settings");
          else if (payload === "pomodoro-start") {
            const current = await loadConfig();
            await eventScheduler.startPomodoro(current.pomodoro.durationMinutes);
          }
          else if (payload === "pomodoro-settings") await showWindow("timer");
          else if (payload === "pomodoro-stop") await eventScheduler.stopPomodoro();
          else if (payload === "pomodoro-toggle-display") await eventScheduler.togglePomodoroVisibility();
          else if (payload === "view-reminders") {
            await showWindow("settings");
            await emit("show-reminders");
          }
          else if (payload === "close-reminders") await eventScheduler.dismissAlert();
          else if (payload.startsWith("delete-reminder:")) {
            await eventScheduler.deleteEvent(payload.slice("delete-reminder:".length));
          }
          else if (payload === "toggle-lock") {
            const current = await loadConfig();
            await saveConfig({ ...current, lockPosition: !current.lockPosition });
          } else if (payload.startsWith("launch:")) {
            await launchExecutable(payload.slice("launch:".length));
          }
        } catch (error) {
          reportError(error);
        }
      });
    })().catch(reportError);
    return () => {
      disposed = true;
      unlistenConfig?.();
      unlistenMenu?.();
    };
  }, [appWindow]);

  useEffect(() => {
    eventScheduler.start();
    return () => eventScheduler.stop();
  }, []);

  useEffect(() => {
    const manager = new PetAnimationManager(idleImages, config.idleIntervalSeconds, setImageSource);
    animationRef.current = manager;
    if (config.alerts.length > 0) setImageSource(selectedImage || idleImages[0] || "");
    else if (config.idleAnimationEnabled && !interactionMode) manager.start();
    else if (!interactionMode && idleImages[0]) setImageSource(idleImages[0]);
    return () => manager.stop();
  }, [config.alerts.length, config.idleAnimationEnabled, config.idleIntervalSeconds, interactionMode]);

  useEffect(() => {
    if (baseSize.width > 0) void applySize(config.scale);
  }, [applySize, baseSize.width, config.scale]);

  useEffect(() => {
    if (!interactionMode) return;
    const onKeyDown = async (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInteractionMode(false);
        return;
      }
      const movement: Record<string, [number, number]> = {
        ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      };
      const direction = movement[event.key];
      if (!direction || config.lockPosition) return;
      event.preventDefault();
      const step = event.shiftKey ? 50 : 10;
      const current = await appWindow.outerPosition();
      await appWindow.setPosition(new PhysicalPosition(
        current.x + direction[0] * step,
        current.y + direction[1] * step,
      ));
      await saveCurrentPetPosition();
      await syncMemoPosition();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appWindow, config.lockPosition, interactionMode]);

  const onImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    if (baseSize.width !== 320 || baseSize.height !== 320) return;
    const image = event.currentTarget;
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const ratio = largestSide > 0 ? 320 / largestSide : 1;
    const next = {
      width: Math.max(1, Math.round(image.naturalWidth * ratio)),
      height: Math.max(1, Math.round(image.naturalHeight * ratio)),
    };
    setBaseSize(next);
    void applySize(config.scale, next).catch(reportError);
  };

  const onMouseDown = async (event: React.MouseEvent) => {
    if (event.button !== 0 || config.lockPosition) return;
    dragStarted.current = true;
    try {
      await appWindow.startDragging();
      await saveCurrentPetPosition();
      await syncMemoPosition();
    } catch (error) {
      reportError(error);
    } finally {
      dragStarted.current = false;
    }
  };

  const enterInteractionMode = async () => {
    setInteractionMode(true);
    setImageSource(selectedImage || idleImages[0] || "");
    await appWindow.setFocus();
  };

  if (!imageSource) {
    return <div className="pet-missing">请在 src/assets/pet/idle/ 放入 idle_01.png</div>;
  }

  return (
    <main
      className={`pet-root${interactionMode ? " interaction" : ""}`}
      onMouseDown={(event) => void onMouseDown(event)}
      onDoubleClick={() => void enterInteractionMode().catch(reportError)}
      onContextMenu={(event) => {
        event.preventDefault();
        void invoke("show_pet_context_menu").catch(reportError);
      }}
    >
      <img
        className="pet-image"
        src={imageSource}
        alt="桌面宠物"
        draggable={false}
        onLoad={onImageLoad}
      />
      {interactionMode && <div className="interaction-indicator">方向键移动 · Esc 退出</div>}
    </main>
  );
}
