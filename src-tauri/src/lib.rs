mod config;

use config::AppConfig;
use std::{
    path::Path,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, Runtime, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartManagerExt};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn MessageBeep(sound_type: u32) -> i32;
}

#[tauri::command]
fn play_reminder_sound() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // MB_ICONEXCLAMATION uses the user's current Windows sound scheme and volume.
        let played = unsafe { MessageBeep(0x0000_0030) };
        if played == 0 {
            return Err("Windows 无法播放系统提醒音。".to_string());
        }
    }
    Ok(())
}

fn validate_exe_path(path: &str) -> Result<(), String> {
    let candidate = Path::new(path);
    if !candidate.is_absolute() {
        return Err("exe 路径必须是绝对路径。".into());
    }
    let is_exe = candidate
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"));
    if !is_exe {
        return Err("只允许添加 .exe 文件。".into());
    }
    Ok(())
}

fn validate_existing_exe_path(path: &str) -> Result<(), String> {
    validate_exe_path(path)?;
    if !Path::new(path).is_file() {
        return Err("找不到指定的 exe 文件。".into());
    }
    Ok(())
}

fn show_window<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

fn apply_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    if let Some(pet) = app.get_webview_window("pet") {
        pet.set_always_on_top(config.always_on_top)
            .map_err(|error| error.to_string())?;
    }
    if let Some(memo) = app.get_webview_window("memo-display") {
        memo.set_always_on_top(config.always_on_top)
            .map_err(|error| error.to_string())?;
        let has_active_memo = config
            .active_memo_id
            .as_ref()
            .and_then(|id| config.memos.iter().find(|memo| &memo.id == id))
            .is_some_and(|memo| !memo.completed && !memo.content.trim().is_empty())
            || !config.memo_text.trim().is_empty();
        let should_show_bubble = !config.alerts.is_empty()
            || (config.pomodoro.running && config.pomodoro.visible)
            || (config.memo_visible && has_active_memo);
        if should_show_bubble {
            sync_memo_position_impl(app)?;
            memo.show().map_err(|error| error.to_string())?;
        } else {
            memo.hide().map_err(|error| error.to_string())?;
        }
    }
    let autostart = app.autolaunch();
    if config.autostart {
        autostart
            .enable()
            .map_err(|error| format!("无法开启开机启动：{error}"))?;
    } else {
        autostart
            .disable()
            .map_err(|error| format!("无法关闭开机启动：{error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    config::load(&app)
}

#[tauri::command]
fn save_config(app: AppHandle, config: AppConfig) -> Result<AppConfig, String> {
    let config = config::normalize(config);
    for launcher in &config.launchers {
        validate_exe_path(&launcher.executable_path)?;
    }
    apply_config(&app, &config)?;
    config::save(&app, &config)?;
    Ok(config)
}

#[tauri::command]
fn save_pet_position(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    let mut config = config::load(&app)?;
    config.x = Some(x);
    config.y = Some(y);
    config::save(&app, &config)
}

#[tauri::command]
fn validate_executable(path: String) -> Result<(), String> {
    validate_existing_exe_path(&path)
}

#[tauri::command]
fn launch_executable(app: AppHandle, id: String) -> Result<(), String> {
    let config = config::load(&app)?;
    let launcher = config
        .launchers
        .iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| "该快捷启动项不存在。".to_string())?;
    validate_existing_exe_path(&launcher.executable_path)?;
    Command::new(&launcher.executable_path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法启动“{}”：{error}", launcher.name))
}

#[tauri::command]
fn show_app_window(app: AppHandle, label: String) -> Result<(), String> {
    if !["pet", "settings", "memo", "memo-display", "timer"].contains(&label.as_str()) {
        return Err("未知窗口。".into());
    }
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "窗口尚未创建。".to_string())?;
    show_window(&window)
}

fn sync_memo_position_impl(app: &AppHandle) -> Result<String, String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "桌宠窗口不存在。".to_string())?;
    let memo = app
        .get_webview_window("memo-display")
        .ok_or_else(|| "备忘录窗口不存在。".to_string())?;
    let pet_position = pet.outer_position().map_err(|error| error.to_string())?;
    let pet_size = pet.outer_size().map_err(|error| error.to_string())?;
    let memo_size = memo.outer_size().map_err(|error| error.to_string())?;
    let monitor = pet
        .current_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "无法确定桌宠所在的显示器。".to_string())?;
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();

    let gap = 14_i32;
    let screen_margin = 8_i32;
    let memo_width = memo_size.width as i32;
    let memo_height = memo_size.height as i32;
    let pet_width = pet_size.width as i32;
    let pet_height = pet_size.height as i32;
    let monitor_left = monitor_position.x;
    let monitor_top = monitor_position.y;
    let monitor_right = monitor_left.saturating_add(monitor_size.width as i32);
    let monitor_bottom = monitor_top.saturating_add(monitor_size.height as i32);

    let left_x = pet_position
        .x
        .saturating_sub(memo_width)
        .saturating_sub(gap);
    let right_x = pet_position.x.saturating_add(pet_width).saturating_add(gap);
    let fits_left = left_x >= monitor_left.saturating_add(screen_margin);
    let fits_right =
        right_x.saturating_add(memo_width) <= monitor_right.saturating_sub(screen_margin);
    let centered_y = pet_position
        .y
        .saturating_add((pet_height.saturating_sub(memo_height)) / 2);
    let maximum_y = monitor_bottom
        .saturating_sub(memo_height)
        .saturating_sub(screen_margin);
    let side_y = centered_y.clamp(monitor_top.saturating_add(screen_margin), maximum_y);

    let above_y = pet_position
        .y
        .saturating_sub(memo_height)
        .saturating_sub(gap);
    let below_y = pet_position
        .y
        .saturating_add(pet_height)
        .saturating_add(gap);
    let fits_above = above_y >= monitor_top.saturating_add(screen_margin);
    let fits_below =
        below_y.saturating_add(memo_height) <= monitor_bottom.saturating_sub(screen_margin);
    let centered_x = pet_position
        .x
        .saturating_add((pet_width.saturating_sub(memo_width)) / 2);
    let maximum_x = monitor_right
        .saturating_sub(memo_width)
        .saturating_sub(screen_margin);
    let vertical_x = centered_x.clamp(monitor_left.saturating_add(screen_margin), maximum_x);

    let (side, x, y) = if fits_left {
        ("left", left_x, side_y)
    } else if fits_right {
        ("right", right_x, side_y)
    } else if fits_above || !fits_below {
        (
            "top",
            vertical_x,
            above_y.max(monitor_top.saturating_add(screen_margin)),
        )
    } else {
        ("bottom", vertical_x, below_y)
    };
    memo.set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    Ok(side.to_string())
}

#[tauri::command]
fn sync_memo_position(app: AppHandle) -> Result<String, String> {
    sync_memo_position_impl(&app)
}

#[tauri::command]
fn set_memo_visibility(app: AppHandle, visible: bool) -> Result<(), String> {
    let mut config = config::load(&app)?;
    config.memo_visible = visible && !config.memo_text.trim().is_empty();
    config::save(&app, &config)?;
    apply_config(&app, &config)?;
    app.emit("app-config-changed", &config)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn show_error(app: AppHandle, message: String) {
    app.dialog()
        .message(message)
        .title("桌面宠物")
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

#[tauri::command]
fn show_pet_context_menu(app: AppHandle) -> Result<(), String> {
    let config = config::load(&app)?;
    let hide = MenuItem::with_id(&app, "hide", "隐藏桌宠", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let show_memo = MenuItem::with_id(&app, "show-memo", "显示备忘录", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let add_memo = MenuItem::with_id(&app, "add-memo", "添加备忘录", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let pomodoro_start =
        MenuItem::with_id(&app, "pomodoro-start", "开启番茄钟", true, None::<&str>)
            .map_err(|e| e.to_string())?;
    let pomodoro_settings = MenuItem::with_id(
        &app,
        "pomodoro-settings",
        "设置专注时间",
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    let pomodoro_display = MenuItem::with_id(
        &app,
        "pomodoro-toggle-display",
        if config.pomodoro.visible {
            "隐藏倒计时"
        } else {
            "显示倒计时"
        },
        config.pomodoro.running,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    let pomodoro_stop = MenuItem::with_id(
        &app,
        "pomodoro-stop",
        "关闭番茄钟",
        config.pomodoro.running,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    let pomodoro = Submenu::with_id_and_items(
        &app,
        "pomodoro",
        "番茄钟",
        true,
        &[
            &pomodoro_start,
            &pomodoro_settings,
            &pomodoro_display,
            &pomodoro_stop,
        ],
    )
    .map_err(|e| e.to_string())?;

    let view_reminders = MenuItem::with_id(&app, "view-reminders", "查看提醒", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let reminder_events = config
        .events
        .iter()
        .filter(|event| {
            !event.completed && event.event_type == "memoReminder" && event.trigger_time > now
        })
        .collect::<Vec<_>>();
    let reminder_delete_items = reminder_events
        .iter()
        .map(|event| {
            let title = if event.title.chars().count() > 24 {
                format!("{}…", event.title.chars().take(24).collect::<String>())
            } else {
                event.title.clone()
            };
            MenuItem::with_id(
                &app,
                format!("delete-reminder:{}", event.id),
                title,
                true,
                None::<&str>,
            )
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let delete_reminders = Submenu::with_id(
        &app,
        "delete-reminders",
        "删除提醒",
        !reminder_delete_items.is_empty(),
    )
    .map_err(|e| e.to_string())?;
    for item in &reminder_delete_items {
        delete_reminders.append(item).map_err(|e| e.to_string())?;
    }
    let close_reminders = MenuItem::with_id(
        &app,
        "close-reminders",
        "关闭提醒",
        !config.alerts.is_empty(),
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    let settings = MenuItem::with_id(&app, "settings", "设置", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let lock = MenuItem::with_id(
        &app,
        "toggle-lock",
        if config.lock_position {
            "解锁位置"
        } else {
            "锁定位置"
        },
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    let exit =
        MenuItem::with_id(&app, "exit", "退出", true, None::<&str>).map_err(|e| e.to_string())?;
    let separator = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;

    let launch_items = config
        .launchers
        .iter()
        .map(|launcher| {
            MenuItem::with_id(
                &app,
                format!("launch:{}", launcher.id),
                &launcher.name,
                true,
                None::<&str>,
            )
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let launch = Submenu::with_id(&app, "launchers", "快捷启动", !launch_items.is_empty())
        .map_err(|e| e.to_string())?;
    for item in &launch_items {
        launch.append(item).map_err(|e| e.to_string())?;
    }
    let menu = Menu::with_items(
        &app,
        &[
            &hide,
            &show_memo,
            &add_memo,
            &pomodoro,
            &view_reminders,
            &delete_reminders,
            &close_reminders,
            &launch,
            &settings,
            &lock,
            &separator,
            &exit,
        ],
    )
    .map_err(|e| e.to_string())?;
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "桌宠窗口不存在。".to_string())?;
    pet.popup_menu(&menu).map_err(|e| e.to_string())?;
    Ok(())
}

fn update_and_emit<F>(app: &AppHandle, change: F) -> Result<(), String>
where
    F: FnOnce(&mut AppConfig),
{
    let mut config = config::load(app)?;
    change(&mut config);
    apply_config(app, &config)?;
    config::save(app, &config)?;
    app.emit("app-config-changed", config)
        .map_err(|error| error.to_string())
}

fn build_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "tray-show", "显示桌宠", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "tray-hide", "隐藏桌宠", true, None::<&str>)?;
    let config = config::load(app).unwrap_or_default();
    let scale_50 = CheckMenuItem::with_id(
        app,
        "tray-scale-50",
        "50%",
        true,
        config.scale == 0.5,
        None::<&str>,
    )?;
    let scale_75 = CheckMenuItem::with_id(
        app,
        "tray-scale-75",
        "75%",
        true,
        config.scale == 0.75,
        None::<&str>,
    )?;
    let scale_100 = CheckMenuItem::with_id(
        app,
        "tray-scale-100",
        "100%",
        true,
        config.scale == 1.0,
        None::<&str>,
    )?;
    let scale_125 = CheckMenuItem::with_id(
        app,
        "tray-scale-125",
        "125%",
        true,
        config.scale == 1.25,
        None::<&str>,
    )?;
    let scale_150 = CheckMenuItem::with_id(
        app,
        "tray-scale-150",
        "150%",
        true,
        config.scale == 1.5,
        None::<&str>,
    )?;
    let size = Submenu::with_id_and_items(
        app,
        "tray-size",
        "大小",
        true,
        &[&scale_50, &scale_75, &scale_100, &scale_125, &scale_150],
    )?;
    let top = CheckMenuItem::with_id(
        app,
        "tray-top",
        "始终置顶",
        true,
        config.always_on_top,
        None::<&str>,
    )?;
    let autostart = CheckMenuItem::with_id(
        app,
        "tray-autostart",
        "开机启动",
        true,
        config.autostart,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, "tray-settings", "设置", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "tray-exit", "退出", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &show, &hide, &size, &top, &autostart, &settings, &separator, &exit,
        ],
    )?;

    TrayIconBuilder::with_id("desktop-pet-tray")
        .tooltip("桌面宠物")
        .icon(app.default_window_icon().cloned().ok_or("缺少应用图标")?)
        .menu(&menu)
        .on_menu_event(move |app, event| {
            let id = event.id().as_ref();
            let result = match id {
                "tray-show" => app
                    .get_webview_window("pet")
                    .ok_or_else(|| "桌宠窗口不存在。".to_string())
                    .and_then(|window| show_window(&window)),
                "tray-hide" => app
                    .get_webview_window("pet")
                    .ok_or_else(|| "桌宠窗口不存在。".to_string())
                    .and_then(|window| window.hide().map_err(|e| e.to_string())),
                "tray-settings" => app
                    .get_webview_window("settings")
                    .ok_or_else(|| "设置窗口不存在。".to_string())
                    .and_then(|window| show_window(&window)),
                "tray-scale-50" => update_and_emit(app, |config| config.scale = 0.5),
                "tray-scale-75" => update_and_emit(app, |config| config.scale = 0.75),
                "tray-scale-100" => update_and_emit(app, |config| config.scale = 1.0),
                "tray-scale-125" => update_and_emit(app, |config| config.scale = 1.25),
                "tray-scale-150" => update_and_emit(app, |config| config.scale = 1.5),
                "tray-top" => {
                    update_and_emit(app, |config| config.always_on_top = !config.always_on_top)
                }
                "tray-autostart" => {
                    update_and_emit(app, |config| config.autostart = !config.autostart)
                }
                "tray-exit" => {
                    app.exit(0);
                    Ok(())
                }
                _ => Ok(()),
            };
            if let Err(error) = result {
                app.dialog()
                    .message(error)
                    .title("桌面宠物")
                    .kind(MessageDialogKind::Error)
                    .show(|_| {});
            }
        })
        .build(app)?;
    Ok(())
}

fn hide_on_close(window: WebviewWindow) {
    let target = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = target.hide();
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            save_pet_position,
            validate_executable,
            launch_executable,
            show_app_window,
            sync_memo_position,
            set_memo_visibility,
            show_error,
            show_pet_context_menu,
            play_reminder_sound,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let config = config::load(&handle).unwrap_or_default();
            if let Some(pet) = app.get_webview_window("pet") {
                if let (Some(x), Some(y)) = (config.x, config.y) {
                    let _ = pet.set_position(PhysicalPosition::new(x, y));
                }
                pet.set_always_on_top(config.always_on_top)?;
                pet.show()?;
            }
            for label in ["settings", "memo", "memo-display", "timer"] {
                if let Some(window) = app.get_webview_window(label) {
                    hide_on_close(window);
                }
            }
            apply_config(&handle, &config)?;
            build_tray(&handle)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let action = event.id().as_ref();
            if action == "exit" {
                app.exit(0);
            } else if let Some(launcher_id) = action.strip_prefix("launch:") {
                if let Err(error) = launch_executable(app.clone(), launcher_id.to_string()) {
                    app.dialog()
                        .message(error)
                        .title("桌面宠物")
                        .kind(MessageDialogKind::Error)
                        .show(|_| {});
                }
            } else if let Some(pet) = app.get_webview_window("pet") {
                let _ = pet.emit("pet-menu-action", action);
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run desktop pet");
}
