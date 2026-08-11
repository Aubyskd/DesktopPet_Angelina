import { loadConfig, saveConfig } from "./configService";
import type { AppConfig } from "../types/config";
import type { PetAlert, PetEvent, PetEventType } from "../types/event";
import type { Memo } from "../types/memo";
import { findDueEvents, getFutureEvents, removeScheduledEvent } from "./eventLogic";
import { playReminderSound } from "./notificationService";

const CHECK_INTERVAL_MS = 1_000;

function alertForEvent(event: PetEvent, now: number): PetAlert {
  return event.type === "pomodoro"
    ? {
        id: crypto.randomUUID(),
        eventId: event.id,
        type: event.type,
        title: "专注完成！",
        message: "休息一下吧",
        createdAt: now,
      }
    : {
        id: crypto.randomUUID(),
        eventId: event.id,
        type: event.type,
        title: "提醒",
        message: event.title,
        createdAt: now,
      };
}

export class EventScheduler {
  private intervalId: number | undefined;
  private checking = false;

  start(): void {
    if (this.intervalId !== undefined) return;
    void this.checkDueEvents();
    this.intervalId = window.setInterval(() => void this.checkDueEvents(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId !== undefined) window.clearInterval(this.intervalId);
    this.intervalId = undefined;
  }

  async createEvent(event: PetEvent): Promise<AppConfig> {
    const config = await loadConfig();
    return saveConfig({ ...config, events: [...config.events.filter((item) => item.id !== event.id), event] });
  }

  async deleteEvent(id: string): Promise<AppConfig> {
    const config = await loadConfig();
    return saveConfig(removeScheduledEvent(config, id));
  }

  async startPomodoro(minutes: number): Promise<AppConfig> {
    const durationMinutes = Math.max(1, Math.min(24 * 60, Math.round(minutes)));
    const config = await loadConfig();
    const now = Date.now();
    const eventId = crypto.randomUUID();
    const endTime = now + durationMinutes * 60_000;
    const event: PetEvent = {
      id: eventId,
      type: "pomodoro",
      title: `${durationMinutes} 分钟专注`,
      triggerTime: endTime,
      completed: false,
    };
    return saveConfig({
      ...config,
      events: [
        ...config.events.filter((item) => item.type !== "pomodoro" || item.completed),
        event,
      ],
      pomodoro: {
        running: true,
        startTime: now,
        endTime,
        durationMinutes,
        visible: true,
        eventId,
      },
    });
  }

  async stopPomodoro(): Promise<AppConfig> {
    const config = await loadConfig();
    const eventId = config.pomodoro.eventId;
    return saveConfig({
      ...config,
      events: eventId ? config.events.filter((event) => event.id !== eventId) : config.events,
      pomodoro: {
        ...config.pomodoro,
        running: false,
        startTime: null,
        endTime: null,
        eventId: null,
      },
    });
  }

  async togglePomodoroVisibility(): Promise<AppConfig> {
    const config = await loadConfig();
    return saveConfig({
      ...config,
      pomodoro: { ...config.pomodoro, visible: !config.pomodoro.visible },
    });
  }

  async addMemo(memo: Memo): Promise<AppConfig> {
    const config = await loadConfig();
    const events = memo.reminderTime
      ? [
          ...config.events.filter((event) => event.id !== memo.id),
          {
            id: memo.id,
            type: "memoReminder" as const,
            title: memo.content,
            triggerTime: memo.reminderTime,
            completed: false,
          },
        ]
      : config.events;
    return saveConfig({
      ...config,
      memos: [...config.memos.filter((item) => item.id !== memo.id), memo],
      activeMemoId: memo.id,
      memoText: memo.content,
      memoVisible: true,
      events,
    });
  }

  async dismissAlert(alertId?: string): Promise<AppConfig> {
    const config = await loadConfig();
    return saveConfig({
      ...config,
      alerts: alertId ? config.alerts.filter((alert) => alert.id !== alertId) : [],
    });
  }

  getFutureEvents(config: AppConfig, type?: PetEventType): PetEvent[] {
    return getFutureEvents(config.events, Date.now(), type);
  }

  private async checkDueEvents(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const config = await loadConfig();
      const now = Date.now();
      const due = findDueEvents(config.events, now);
      if (due.length === 0) return;

      const dueIds = new Set(due.map((event) => event.id));
      const alerts = due
        .filter((event) => !config.alerts.some((alert) => alert.eventId === event.id))
        .map((event) => alertForEvent(event, now));
      const pomodoroCompleted = due.some((event) => event.type === "pomodoro");
      await saveConfig({
        ...config,
        events: config.events.map((event) => dueIds.has(event.id) ? { ...event, completed: true } : event),
        pomodoro: pomodoroCompleted
          ? { ...config.pomodoro, running: false, endTime: null, eventId: null }
          : config.pomodoro,
        alerts: [...config.alerts, ...alerts],
      });
      try {
        await playReminderSound();
      } catch (error) {
        // The visual alert remains available even if Windows cannot play its configured sound.
        console.error("Failed to play the Windows reminder sound", error);
      }
    } finally {
      this.checking = false;
    }
  }
}

export const eventScheduler = new EventScheduler();
