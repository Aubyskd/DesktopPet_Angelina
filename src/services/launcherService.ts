import { invoke } from "@tauri-apps/api/core";

export async function launchExecutable(id: string): Promise<void> {
  await invoke("launch_executable", { id });
}
