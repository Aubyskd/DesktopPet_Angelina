import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { eventScheduler } from "../services/eventScheduler";
import type { Memo } from "../types/memo";
import "./memo.css";

type ReminderMode = "none" | "today18" | "custom";

function todayAt18(): number {
  const date = new Date();
  date.setHours(18, 0, 0, 0);
  return date.getTime();
}

export function MemoEditor() {
  const [text, setText] = useState("");
  const [reminderMode, setReminderMode] = useState<ReminderMode>("none");
  const [customTime, setCustomTime] = useState("");
  const [error, setError] = useState("");

  const resetAndHide = async () => {
    setText("");
    setReminderMode("none");
    setCustomTime("");
    setError("");
    await getCurrentWindow().hide();
  };

  const save = async () => {
    const content = text.trim();
    if (!content) {
      setError("请输入备忘录内容。");
      return;
    }

    let reminderTime: number | undefined;
    if (reminderMode === "today18") reminderTime = todayAt18();
    if (reminderMode === "custom") reminderTime = new Date(customTime).getTime();
    if (reminderMode !== "none" && (!reminderTime || !Number.isFinite(reminderTime) || reminderTime <= Date.now())) {
      setError("提醒时间必须晚于当前时间。");
      return;
    }

    const memo: Memo = {
      id: crypto.randomUUID(),
      content,
      createdAt: Date.now(),
      reminderTime,
      completed: false,
    };
    try {
      await eventScheduler.addMemo(memo);
      await resetAndHide();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <main className="memo-editor">
      <h1>添加备忘录</h1>
      <label className="memo-content-label">
        <span>内容</span>
        <textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} placeholder="输入提醒文字…" />
      </label>
      <fieldset className="reminder-options">
        <legend>提醒</legend>
        <label><input type="radio" checked={reminderMode === "none"} onChange={() => setReminderMode("none")} />不提醒</label>
        <label><input type="radio" checked={reminderMode === "today18"} onChange={() => setReminderMode("today18")} />今天 18:00</label>
        <label><input type="radio" checked={reminderMode === "custom"} onChange={() => setReminderMode("custom")} />自定义时间</label>
        {reminderMode === "custom" && <input type="datetime-local" value={customTime} onChange={(event) => setCustomTime(event.target.value)} />}
      </fieldset>
      <div className="memo-actions">
        <button onClick={() => void resetAndHide()}>取消</button>
        <button className="primary" onClick={() => void save()}>保存并显示</button>
      </div>
      {error && <p className="memo-error">{error}</p>}
    </main>
  );
}
