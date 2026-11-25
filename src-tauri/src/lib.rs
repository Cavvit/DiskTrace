mod models;
mod scanner;
mod storage;

use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::Utc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

use crate::models::{
    AppSettings, DriveInfo, FilteredFilesResult, SnapshotComparison, SnapshotDetail,
    SnapshotSummary,
};
use crate::storage::Storage;

struct AppState {
    storage: Arc<Storage>,
    scanning: Arc<AtomicBool>,
    quitting: Arc<AtomicBool>,
    settings: Arc<Mutex<AppSettings>>,
}

fn apply_windows_autostart(enabled: bool) {
    let exe = match std::env::current_exe() {
        Ok(p) => p.to_string_lossy().to_string(),
        Err(_) => return,
    };
    let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    if enabled {
        let _ = Command::new("reg")
            .args(["add", key, "/v", "DiskTrace", "/t", "REG_SZ", "/d", &format!("\"{}\"", exe), "/f"])
            .output();
    } else {
        let _ = Command::new("reg")
            .args(["delete", key, "/v", "DiskTrace", "/f"])
            .output();
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

async fn run_drive_scan(
    app: AppHandle,
    storage: Arc<Storage>,
    scanning: Arc<AtomicBool>,
    drive: String,
) -> Result<SnapshotSummary, String> {
    if scanning
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Şu anda başka bir tarama devam ediyor.".to_string());
    }

    let app_clone = app.clone();
    let storage_clone = storage.clone();
    let scanning_clone = scanning.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let res = scanner::scan_drive(&drive, |progress| {
            let _ = app_clone.emit("scan-progress", progress);
        });
        let final_res = match res {
            Ok(detail) => {
                if let Err(e) = storage_clone.save_snapshot(&detail) {
                    Err(e)
                } else {
                    let _ = app_clone.emit("snapshot-created", &detail.summary);
                    Ok(detail.summary)
                }
            }
            Err(e) => Err(e),
        };
        scanning_clone.store(false, Ordering::SeqCst);
        final_res
    })
    .await
    .map_err(|e| format!("Tarama görevi başarısız: {}", e))?;

    result
}

#[tauri::command]
fn get_drives() -> Vec<DriveInfo> {
    scanner::list_drives()
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> AppSettings {
    state
        .settings
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn save_settings(state: State<'_, AppState>, settings: AppSettings) -> Result<AppSettings, String> {
    let mut sanitized = settings;
    if sanitized.scan_interval_minutes < 5 {
        sanitized.scan_interval_minutes = 5;
    }
    if sanitized.monitored_drives.is_empty() {
        sanitized.monitored_drives = vec!["C:\\".to_string()];
    }
    state.storage.save_settings(&sanitized)?;
    apply_windows_autostart(sanitized.autostart);
    if let Ok(mut guard) = state.settings.lock() {
        *guard = sanitized.clone();
    }
    Ok(sanitized)
}

#[tauri::command]
fn list_snapshots(
    state: State<'_, AppState>,
    drive: Option<String>,
) -> Result<Vec<SnapshotSummary>, String> {
    state.storage.list_summaries(drive.as_deref())
}

#[tauri::command]
fn get_snapshot_detail(
    state: State<'_, AppState>,
    id: String,
) -> Result<SnapshotDetail, String> {
    state.storage.load_detail(&id)
}

#[tauri::command]
fn compare_snapshots(
    state: State<'_, AppState>,
    from_id: String,
    to_id: String,
) -> Result<SnapshotComparison, String> {
    state.storage.compare_snapshots(&from_id, &to_id)
}

#[tauri::command]
fn delete_snapshot(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.storage.delete_snapshot(&id)
}

#[tauri::command]
fn is_scanning(state: State<'_, AppState>) -> bool {
    state.scanning.load(Ordering::SeqCst)
}

#[tauri::command]
async fn trigger_scan(
    app: AppHandle,
    state: State<'_, AppState>,
    drive: String,
) -> Result<SnapshotSummary, String> {
    run_drive_scan(
        app,
        state.storage.clone(),
        state.scanning.clone(),
        drive,
    )
    .await
}

#[tauri::command]
async fn list_files_by_filter(
    drive: String,
    category: Option<String>,
    extension: Option<String>,
    limit: Option<usize>,
) -> Result<FilteredFilesResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        scanner::list_files_by_filter(
            &drive,
            category.as_deref(),
            extension.as_deref(),
            limit.unwrap_or(250),
        )
    })
    .await
    .map_err(|e| format!("Dosya listeleme başarısız: {}", e))?
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("Yol artık mevcut değil.".to_string());
    }
    if p.is_file() {
        Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| format!("Gezgin açılamadı: {}", e))?;
    } else {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Gezgin açılamadı: {}", e))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let storage = Arc::new(Storage::new().expect("DiskTrace veri dizini başlatılamadı"));
    let initial_settings = storage.load_settings();
    let settings = Arc::new(Mutex::new(initial_settings));
    let scanning = Arc::new(AtomicBool::new(false));
    let quitting = Arc::new(AtomicBool::new(false));

    let state = AppState {
        storage: storage.clone(),
        scanning: scanning.clone(),
        quitting: quitting.clone(),
        settings: settings.clone(),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .manage(state)
        .setup(move |app| {
            // System Tray setup
            let open_item = MenuItem::with_id(app, "open", "DiskTrace'i Aç", true, None::<&str>)?;
            let scan_item = MenuItem::with_id(app, "scan_now", "Şimdi Tara", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &scan_item, &quit_item])?;

            let tray_storage = storage.clone();
            let tray_scanning = scanning.clone();
            let tray_quitting = quitting.clone();
            let tray_settings = settings.clone();

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("DiskTrace — Disk Takibi Aktif")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                show_main_window(app);
                            }
                        }
                    }
                })
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "scan_now" => {
                        let app_handle = app.clone();
                        let st = tray_storage.clone();
                        let sc = tray_scanning.clone();
                        let drives = tray_settings
                            .lock()
                            .map(|s| s.monitored_drives.clone())
                            .unwrap_or_else(|_| vec!["C:\\".to_string()]);
                        tauri::async_runtime::spawn(async move {
                            for d in drives {
                                let _ = run_drive_scan(app_handle.clone(), st.clone(), sc.clone(), d).await;
                            }
                        });
                    }
                    "quit" => {
                        tray_quitting.store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    _ => {}
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            tray_builder.build(app)?;

            // Background periodic snapshot scheduler
            let bg_app = app.handle().clone();
            let bg_storage = storage.clone();
            let bg_scanning = scanning.clone();
            let bg_settings = settings.clone();

            tauri::async_runtime::spawn(async move {
                let mut ticker = tokio::time::interval(Duration::from_secs(60));
                ticker.tick().await; // skip immediate tick on startup
                loop {
                    ticker.tick().await;
                    let cfg = bg_settings
                        .lock()
                        .map(|s| s.clone())
                        .unwrap_or_default();
                    let interval_ms = (cfg.scan_interval_minutes.max(5) * 60 * 1000) as i64;
                    let now_ms = Utc::now().timestamp_millis();

                    for drive in cfg.monitored_drives {
                        let should_scan = match bg_storage.list_summaries(Some(&drive)) {
                            Ok(list) => list
                                .last()
                                .map(|last| now_ms - last.timestamp >= interval_ms)
                                .unwrap_or(true),
                            Err(_) => false,
                        };
                        if should_scan && !bg_scanning.load(Ordering::SeqCst) {
                            let _ = run_drive_scan(
                                bg_app.clone(),
                                bg_storage.clone(),
                                bg_scanning.clone(),
                                drive,
                            )
                            .await;
                        }
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if !state.quitting.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_drives,
            get_settings,
            save_settings,
            list_snapshots,
            get_snapshot_detail,
            compare_snapshots,
            delete_snapshot,
            is_scanning,
            trigger_scan,
            list_files_by_filter,
            open_in_explorer,
        ])
        .run(tauri::generate_context!())
        .expect("DiskTrace çalıştırılırken hata oluştu");
}
