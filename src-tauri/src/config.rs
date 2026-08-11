use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherEntry {
    pub id: String,
    pub name: String,
    pub executable_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub title: String,
    pub trigger_time: i64,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Memo {
    pub id: String,
    pub content: String,
    pub created_at: i64,
    pub reminder_time: Option<i64>,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PomodoroState {
    pub running: bool,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
    pub duration_minutes: u32,
    pub visible: bool,
    pub event_id: Option<String>,
}

impl Default for PomodoroState {
    fn default() -> Self {
        Self {
            running: false,
            start_time: None,
            end_time: None,
            duration_minutes: 25,
            visible: true,
            event_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetAlert {
    pub id: String,
    pub event_id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub title: String,
    pub message: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub scale: f64,
    pub always_on_top: bool,
    pub autostart: bool,
    pub lock_position: bool,
    pub idle_animation_enabled: bool,
    pub idle_interval_seconds: u64,
    pub launchers: Vec<LauncherEntry>,
    pub memo_text: String,
    pub memo_visible: bool,
    pub memos: Vec<Memo>,
    pub active_memo_id: Option<String>,
    pub events: Vec<PetEvent>,
    pub pomodoro: PomodoroState,
    pub alerts: Vec<PetAlert>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            x: None,
            y: None,
            scale: 1.0,
            always_on_top: true,
            autostart: false,
            lock_position: false,
            idle_animation_enabled: true,
            idle_interval_seconds: 30,
            launchers: Vec::new(),
            memo_text: String::new(),
            memo_visible: false,
            memos: Vec::new(),
            active_memo_id: None,
            events: Vec::new(),
            pomodoro: PomodoroState::default(),
            alerts: Vec::new(),
        }
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join("config.json"))
        .map_err(|error| format!("无法确定配置目录：{error}"))
}

pub fn load(app: &AppHandle) -> Result<AppConfig, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let text = fs::read_to_string(&path).map_err(|error| format!("无法读取配置：{error}"))?;
    let config: AppConfig =
        serde_json::from_str(&text).map_err(|error| format!("配置文件格式无效：{error}"))?;
    Ok(migrate_legacy(config))
}

fn migrate_legacy(mut config: AppConfig) -> AppConfig {
    if config.memos.is_empty() && !config.memo_text.trim().is_empty() {
        let id = "legacy-memo".to_string();
        config.memos.push(Memo {
            id: id.clone(),
            content: config.memo_text.clone(),
            created_at: 0,
            reminder_time: None,
            completed: false,
        });
        config.active_memo_id = Some(id);
    }
    config
}

pub fn save(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let parent = path.parent().ok_or_else(|| "配置路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建配置目录：{error}"))?;
    let json =
        serde_json::to_string_pretty(config).map_err(|error| format!("无法序列化配置：{error}"))?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, json).map_err(|error| format!("无法写入配置：{error}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("无法更新配置：{error}"))?;
    }
    fs::rename(temporary, path).map_err(|error| format!("无法保存配置：{error}"))
}

pub fn normalize(mut config: AppConfig) -> AppConfig {
    const SCALES: [f64; 5] = [0.5, 0.75, 1.0, 1.25, 1.5];
    const INTERVALS: [u64; 4] = [10, 30, 60, 120];
    if !SCALES.contains(&config.scale) {
        config.scale = 1.0;
    }
    if !INTERVALS.contains(&config.idle_interval_seconds) {
        config.idle_interval_seconds = 30;
    }
    config.memo_text.truncate(1000);
    config.pomodoro.duration_minutes = config.pomodoro.duration_minutes.clamp(1, 24 * 60);
    config
        .memos
        .retain(|memo| !memo.id.trim().is_empty() && !memo.content.trim().is_empty());
    for memo in &mut config.memos {
        memo.content.truncate(1000);
    }
    config.events.retain(|event| {
        !event.id.trim().is_empty()
            && matches!(event.event_type.as_str(), "pomodoro" | "memoReminder")
    });
    config.alerts.retain(|alert| {
        !alert.id.trim().is_empty()
            && matches!(alert.event_type.as_str(), "pomodoro" | "memoReminder")
    });
    if config.alerts.len() > 20 {
        config.alerts = config.alerts.split_off(config.alerts.len() - 20);
    }
    config.launchers.retain(|item| {
        !item.id.trim().is_empty()
            && !item.name.trim().is_empty()
            && !item.executable_path.trim().is_empty()
    });
    config
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_memo_is_migrated_without_data_loss() {
        let legacy = r#"{"memoText":"下午写报告","memoVisible":true}"#;
        let config: AppConfig = serde_json::from_str(legacy).expect("legacy config must parse");
        let migrated = migrate_legacy(config);
        assert_eq!(migrated.memos.len(), 1);
        assert_eq!(migrated.memos[0].content, "下午写报告");
        assert_eq!(migrated.active_memo_id.as_deref(), Some("legacy-memo"));
    }

    #[test]
    fn running_timer_and_events_survive_json_round_trip() {
        let mut config = AppConfig::default();
        config.pomodoro.running = true;
        config.pomodoro.start_time = Some(1_000);
        config.pomodoro.end_time = Some(1_501_000);
        config.pomodoro.event_id = Some("timer-event".into());
        config.events.push(PetEvent {
            id: "timer-event".into(),
            event_type: "pomodoro".into(),
            title: "25 分钟专注".into(),
            trigger_time: 1_501_000,
            completed: false,
        });

        let json = serde_json::to_string(&config).expect("config must serialize");
        let restored: AppConfig = serde_json::from_str(&json).expect("config must deserialize");
        assert!(restored.pomodoro.running);
        assert_eq!(restored.pomodoro.end_time, Some(1_501_000));
        assert_eq!(restored.events.len(), 1);
        assert!(!restored.events[0].completed);
    }
}
