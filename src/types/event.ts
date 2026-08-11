export type PetEventType = "pomodoro" | "memoReminder";

export interface PetEvent {
  id: string;
  type: PetEventType;
  title: string;
  triggerTime: number;
  completed: boolean;
}

export interface PetAlert {
  id: string;
  eventId: string;
  type: PetEventType;
  title: string;
  message: string;
  createdAt: number;
}
