import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "../types/config";

const CONFIG_CHANGED = "app-config-changed";

export async function loadConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("load_config");
}

export async function saveConfig(config: AppConfig): Promise<AppConfig> {
  const saved = await invoke<AppConfig>("save_config", { config });
  await emit(CONFIG_CHANGED, saved);
  return saved;
}

export function onConfigChanged(
  callback: (config: AppConfig) => void,
): Promise<UnlistenFn> {
  return listen<AppConfig>(CONFIG_CHANGED, (event) => callback(event.payload));
}

export async function updateConfig(
  mutate: (config: AppConfig) => AppConfig,
): Promise<AppConfig> {
  return saveConfig(mutate(await loadConfig()));
}
