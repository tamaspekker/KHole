mod analysis;
mod audio;
mod commands;
mod error;
mod fileops;
mod finder;
mod library;
mod menu;
mod store;

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// `~/Library/Application Support/<identifier>/khole.db`
pub(crate) fn db_path(app: &AppHandle) -> error::Result<PathBuf> {
    Ok(app.path().app_data_dir()?.join("khole.db"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(commands::Scans::default())
        .manage(audio::PeakRequests::default())
        .manage(library::watch::Watcher::default())
        .menu(menu::build)
        .on_menu_event(|app, event| menu::on_event(app, event.id().as_ref()))
        .setup(|app| {
            let store = store::Store::open(&db_path(app.handle())?)?;
            app.manage(store);
            app.manage(analysis::queue::Analyzer::new(app.handle().clone()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::app_info,
            commands::analyzer_info,
            commands::analyze_session,
            commands::stop_analysis,
            commands::pick_folder,
            commands::open_session,
            commands::recent_sessions,
            commands::forget_session,
            commands::locate_session,
            commands::set_sort,
            commands::set_folder,
            commands::list_tracks,
            commands::scan_session,
            commands::track_peaks,
            commands::set_start_at,
            commands::set_target_bpm,
            commands::set_current_track,
            commands::set_mode,
            commands::set_auto_next,
            commands::set_bpm_range,
            commands::list_destinations,
            commands::add_destination,
            commands::remove_destination,
            commands::set_destination_hotkey,
            commands::decide,
            commands::undo,
            commands::undo_session,
            commands::session_stats,
            commands::open_destination,
            commands::get_setting,
            commands::set_setting,
            commands::watch_session,
            commands::unwatch_session,
            commands::reveal_track,
            commands::track_apps,
            commands::open_track,
            commands::edit_track,
            menu::open_support,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
