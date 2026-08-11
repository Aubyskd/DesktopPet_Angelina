export interface PomodoroState {
  running: boolean;
  startTime: number | null;
  endTime: number | null;
  durationMinutes: number;
  visible: boolean;
  eventId: string | null;
}

export const DEFAULT_POMODORO: PomodoroState = {
  running: false,
  startTime: null,
  endTime: null,
  durationMinutes: 25,
  visible: true,
  eventId: null,
};
