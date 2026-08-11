import { useEffect, useState } from "react";
import type { PomodoroState } from "../types/timer";

function formatRemaining(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutesPart = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secondsPart = (seconds % 60).toString().padStart(2, "0");
  return `${minutesPart}:${secondsPart}`;
}

export function TimerPanel({ timer }: { timer: PomodoroState }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="timer-panel">
      <strong>专注中</strong>
      <time>{formatRemaining((timer.endTime ?? now) - now)}</time>
    </div>
  );
}
