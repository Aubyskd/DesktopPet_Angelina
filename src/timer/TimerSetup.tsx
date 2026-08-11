import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { loadConfig } from "../services/configService";
import { eventScheduler } from "../services/eventScheduler";
import "./timer.css";

const PRESETS = [15, 25, 45, 60] as const;

export function TimerSetup() {
  const [selection, setSelection] = useState<number | "custom">(25);
  const [customMinutes, setCustomMinutes] = useState(30);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadConfig().then((config) => {
      const duration = config.pomodoro.durationMinutes;
      if (PRESETS.includes(duration as (typeof PRESETS)[number])) setSelection(duration);
      else {
        setSelection("custom");
        setCustomMinutes(duration);
      }
    });
  }, []);

  const start = async () => {
    const minutes = selection === "custom" ? customMinutes : selection;
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      setError("自定义时间必须是 1–1440 分钟。");
      return;
    }
    try {
      await eventScheduler.startPomodoro(minutes);
      await getCurrentWindow().hide();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <main className="timer-setup">
      <h1>设置专注时间</h1>
      <div className="timer-presets">
        {PRESETS.map((minutes) => (
          <label key={minutes}>
            <input type="radio" checked={selection === minutes} onChange={() => setSelection(minutes)} />
            <span>{minutes} 分钟</span>
          </label>
        ))}
        <label>
          <input type="radio" checked={selection === "custom"} onChange={() => setSelection("custom")} />
          <span>自定义</span>
        </label>
      </div>
      {selection === "custom" && (
        <label className="custom-minutes">
          <span>分钟数</span>
          <input type="number" min={1} max={1440} value={customMinutes} onChange={(event) => setCustomMinutes(Number(event.target.value))} />
        </label>
      )}
      <div className="timer-buttons">
        <button onClick={() => void getCurrentWindow().hide()}>取消</button>
        <button className="primary" onClick={() => void start()}>开始番茄钟</button>
      </div>
      {error && <p className="timer-error">{error}</p>}
    </main>
  );
}
