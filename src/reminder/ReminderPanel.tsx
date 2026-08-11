import type { PetAlert } from "../types/event";

interface ReminderPanelProps {
  alert: PetAlert;
  onClose: () => void;
  onRestartPomodoro: () => void;
}

export function ReminderPanel({ alert, onClose, onRestartPomodoro }: ReminderPanelProps) {
  return (
    <div className="reminder-panel">
      <strong>{alert.title}</strong>
      <p>{alert.message}</p>
      <div className="reminder-actions">
        {alert.type === "pomodoro" && <button onClick={onRestartPomodoro}>再来一轮</button>}
        <button onClick={onClose}>关闭提醒</button>
      </div>
    </div>
  );
}
