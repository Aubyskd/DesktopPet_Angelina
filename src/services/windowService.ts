import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type AppWindowLabel = "pet" | "settings" | "memo" | "memo-display" | "timer";
export type MemoSide = "left" | "right" | "top" | "bottom";

export function showWindow(label: AppWindowLabel): Promise<void> {
  return invoke("show_app_window", { label });
}

export async function saveCurrentPetPosition(): Promise<void> {
  const position = await getCurrentWindow().outerPosition();
  await invoke("save_pet_position", { x: position.x, y: position.y });
}

export function syncMemoPosition(): Promise<MemoSide> {
  return invoke<MemoSide>("sync_memo_position");
}
