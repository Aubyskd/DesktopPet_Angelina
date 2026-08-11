import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { ReminderPanel } from "../reminder/ReminderPanel";
import { eventScheduler } from "../services/eventScheduler";
import { loadConfig, onConfigChanged } from "../services/configService";
import { syncMemoPosition, type MemoSide } from "../services/windowService";
import { TimerPanel } from "../timer/TimerPanel";
import type { AppConfig } from "../types/config";
import { DEFAULT_CONFIG } from "../types/config";
import "./memo.css";

const MIN_WIDTH = 150;
const MAX_WIDTH = 390;
const MIN_HEIGHT = 66;
const MAX_HEIGHT = 300;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function MemoPanel() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [side, setSide] = useState<MemoSide>("left");
  const measurerRef = useRef<HTMLParagraphElement>(null);
  const alert = config.alerts[0];
  const showTimer = !alert && config.pomodoro.running && config.pomodoro.visible;
  const activeMemo = config.memos.find((memo) => memo.id === config.activeMemoId && !memo.completed)
    ?? [...config.memos].reverse().find((memo) => !memo.completed);
  const memoContent = activeMemo?.content ?? config.memoText;
  const displayText = alert
    ? `${alert.title}\n${alert.message}`
    : showTimer
      ? "专注中\n00:00"
      : memoContent;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void loadConfig().then(setConfig);
    void onConfigChanged(setConfig).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  useLayoutEffect(() => {
    const measurer = measurerRef.current;
    if (!measurer || !displayText) return;

    let cancelled = false;
    const resize = async () => {
      const bounds = measurer.getBoundingClientRect();
      const extraHeight = alert ? 72 : showTimer ? 28 : 0;
      const width = clamp(Math.ceil(bounds.width) + 58, showTimer ? 170 : MIN_WIDTH, MAX_WIDTH);
      const height = clamp(Math.ceil(bounds.height) + 42 + extraHeight, MIN_HEIGHT, MAX_HEIGHT);
      await getCurrentWindow().setSize(new LogicalSize(width, height));
      const nextSide = await syncMemoPosition();
      if (!cancelled) setSide(nextSide);
    };

    void resize();
    return () => { cancelled = true; };
  }, [alert, displayText, showTimer]);

  const closeCurrent = async () => {
    if (alert) await eventScheduler.dismissAlert(alert.id);
    else if (showTimer) await eventScheduler.togglePomodoroVisibility();
    else await invoke("set_memo_visibility", { visible: false });
  };

  const restartPomodoro = async () => {
    if (alert) await eventScheduler.dismissAlert(alert.id);
    await eventScheduler.startPomodoro(config.pomodoro.durationMinutes);
  };

  return (
    <>
      <p ref={measurerRef} className="memo-measurer" aria-hidden="true">{displayText}</p>
      <aside className={`memo-panel${alert ? " alert-bubble" : ""}`} data-side={side}>
        <button className="bubble-close" aria-label="关闭当前气泡" title="关闭" onClick={() => void closeCurrent()}>×</button>
        {alert
          ? <ReminderPanel alert={alert} onClose={() => void closeCurrent()} onRestartPomodoro={() => void restartPomodoro()} />
          : showTimer
            ? <TimerPanel timer={config.pomodoro} />
            : <p>{memoContent}</p>}
      </aside>
    </>
  );
}
