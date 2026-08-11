export interface Memo {
  id: string;
  content: string;
  createdAt: number;
  reminderTime?: number;
  completed: boolean;
}
