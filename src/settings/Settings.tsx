import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { loadConfig, onConfigChanged, saveConfig } from "../services/configService";
import type { AppConfig, LauncherEntry } from "../types/config";
import { DEFAULT_CONFIG, IDLE_INTERVALS, PET_SCALES } from "../types/config";
import { eventScheduler } from "../services/eventScheduler";
import { showWindow } from "../services/windowService";
import { listen } from "@tauri-apps/api/event";
import "./settings.css";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatReminderTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export function Settings() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [status, setStatus] = useState("");
  const futureReminders = eventScheduler.getFutureEvents(config, "memoReminder");

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unlistenReminderNavigation: (() => void) | undefined;
    void loadConfig().then(setConfig).catch((error) => setStatus(errorText(error)));
    void onConfigChanged(setConfig).then((fn) => { unlisten = fn; });
    void listen("show-reminders", () => {
      document.getElementById("reminders")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }).then((fn) => { unlistenReminderNavigation = fn; });
    return () => {
      unlisten?.();
      unlistenReminderNavigation?.();
    };
  }, []);

  const persist = async (next: AppConfig) => {
    try {
      setStatus("");
      setConfig(await saveConfig(next));
    } catch (error) {
      setStatus(errorText(error));
    }
  };

  const chooseExe = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Windows 程序", extensions: ["exe"] }],
    });
    if (typeof selected === "string") setPath(selected);
  };

  const addLauncher = async () => {
    if (!name.trim() || !path.trim()) {
      setStatus("请填写软件名称并选择 exe 文件。");
      return;
    }
    const launcher: LauncherEntry = {
      id: crypto.randomUUID(),
      name: name.trim(),
      executablePath: path.trim(),
    };
    try {
      await invoke("validate_executable", { path: launcher.executablePath });
      await persist({ ...config, launchers: [...config.launchers, launcher] });
      setName("");
      setPath("");
    } catch (error) {
      setStatus(errorText(error));
    }
  };

  return (
    <main className="settings-page">
      <h1>桌宠设置</h1>
      <section>
        <h2>桌宠</h2>
        <label>
          <span>大小</span>
          <select value={config.scale} onChange={(e) => void persist({ ...config, scale: Number(e.target.value) })}>
            {PET_SCALES.map((scale) => <option key={scale} value={scale}>{scale * 100}%</option>)}
          </select>
        </label>
        <label className="switch"><span>始终置顶</span><input type="checkbox" checked={config.alwaysOnTop} onChange={(e) => void persist({ ...config, alwaysOnTop: e.target.checked })} /></label>
        <label className="switch"><span>开机启动</span><input type="checkbox" checked={config.autostart} onChange={(e) => void persist({ ...config, autostart: e.target.checked })} /></label>
        <label className="switch"><span>锁定位置</span><input type="checkbox" checked={config.lockPosition} onChange={(e) => void persist({ ...config, lockPosition: e.target.checked })} /></label>
      </section>

      <section>
        <h2>待机图片</h2>
        <label>
          <span>切换间隔</span>
          <select value={config.idleIntervalSeconds} onChange={(e) => void persist({ ...config, idleIntervalSeconds: Number(e.target.value) })}>
            {IDLE_INTERVALS.map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}
          </select>
        </label>
        <label className="switch"><span>自动切换</span><input type="checkbox" checked={config.idleAnimationEnabled} onChange={(e) => void persist({ ...config, idleAnimationEnabled: e.target.checked })} /></label>
      </section>

      <section>
        <h2>快捷启动</h2>
        <div className="launcher-form">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="软件名称" maxLength={60} />
          <div className="path-row">
            <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="exe 路径" />
            <button type="button" onClick={() => void chooseExe()}>浏览…</button>
          </div>
          <button className="primary" type="button" onClick={() => void addLauncher()}>添加软件</button>
        </div>
        <ul className="launcher-list">
          {config.launchers.map((launcher) => (
            <li key={launcher.id}>
              <div><strong>{launcher.name}</strong><small>{launcher.executablePath}</small></div>
              <button type="button" onClick={() => void persist({ ...config, launchers: config.launchers.filter((item) => item.id !== launcher.id) })}>删除</button>
            </li>
          ))}
          {config.launchers.length === 0 && <li className="empty">尚未添加软件</li>}
        </ul>
      </section>

      <section id="reminders">
        <h2>未来提醒</h2>
        <ul className="reminder-list">
          {futureReminders.map((event) => (
            <li key={event.id}>
              <div>
                <time>{formatReminderTime(event.triggerTime)}</time>
                <strong>{event.title}</strong>
              </div>
              <button type="button" onClick={() => void eventScheduler.deleteEvent(event.id).then(setConfig).catch((error) => setStatus(errorText(error)))}>删除提醒</button>
            </li>
          ))}
          {futureReminders.length === 0 && <li className="empty">没有未来提醒</li>}
        </ul>
      </section>

      <section>
        <h2>番茄钟</h2>
        <div className="timer-setting-row">
          <span>{config.pomodoro.running ? "番茄钟正在运行" : `默认 ${config.pomodoro.durationMinutes} 分钟`}</span>
          <button type="button" onClick={() => void showWindow("timer")}>设置专注时间</button>
        </div>
      </section>
      {status && <p className="status" role="alert">{status}</p>}
    </main>
  );
}
