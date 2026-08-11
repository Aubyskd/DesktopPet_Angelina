export const PET_SCALES = [0.5, 0.75, 1, 1.25, 1.5] as const;
export const IDLE_INTERVALS = [10, 30, 60, 120] as const;

export interface LauncherEntry {
  id: string;
  name: string;
  executablePath: string;
}

export interface AppConfig {
  x: number | null;
  y: number | null;
  scale: number;
  alwaysOnTop: boolean;
  autostart: boolean;
  lockPosition: boolean;
  idleAnimationEnabled: boolean;
  idleIntervalSeconds: number;
  launchers: LauncherEntry[];
  memoText: string;
  memoVisible: boolean;
  memos: Memo[];
  activeMemoId: string | null;
  events: PetEvent[];
  pomodoro: PomodoroState;
  alerts: PetAlert[];
}

export const DEFAULT_CONFIG: AppConfig = {
  x: null,
  y: null,
  scale: 1,
  alwaysOnTop: true,
  autostart: false,
  lockPosition: false,
  idleAnimationEnabled: true,
  idleIntervalSeconds: 30,
  launchers: [],
  memoText: "",
  memoVisible: false,
  memos: [],
  activeMemoId: null,
  events: [],
  pomodoro: DEFAULT_POMODORO,
  alerts: [],
};
import type { PetAlert, PetEvent } from "./event";
import type { Memo } from "./memo";
import { DEFAULT_POMODORO, type PomodoroState } from "./timer";
