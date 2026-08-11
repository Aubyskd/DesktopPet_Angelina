import { invoke } from "@tauri-apps/api/core";

/** Plays the current Windows system notification sound without bundling audio assets. */
export async function playReminderSound(): Promise<void> {
  await invoke("play_reminder_sound");
}
