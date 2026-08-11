import type { AppConfig } from "../types/config";
import type { PetEvent, PetEventType } from "../types/event";

export function findDueEvents(events: PetEvent[], now: number): PetEvent[] {
  return events.filter((event) => !event.completed && now >= event.triggerTime);
}

export function getFutureEvents(
  events: PetEvent[],
  now: number,
  type?: PetEventType,
): PetEvent[] {
  return events
    .filter((event) => !event.completed && event.triggerTime > now && (!type || event.type === type))
    .sort((a, b) => a.triggerTime - b.triggerTime);
}

export function removeScheduledEvent(config: AppConfig, id: string): AppConfig {
  const memos = config.memos.map((memo) => memo.id === id ? { ...memo, reminderTime: undefined } : memo);
  const pomodoro = config.pomodoro.eventId === id
    ? { ...config.pomodoro, running: false, startTime: null, endTime: null, eventId: null }
    : config.pomodoro;
  return {
    ...config,
    memos,
    pomodoro,
    events: config.events.filter((event) => event.id !== id),
    alerts: config.alerts.filter((alert) => alert.eventId !== id),
  };
}
