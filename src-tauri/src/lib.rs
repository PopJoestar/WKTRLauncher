use tauri::Manager;
mod commands;
mod models;

use commands::app_state::{get_app_state, save_app_state, AppStateStore};
use commands::repository::{select_repository, validate_repository};
use commands::script::{list_scripts, run_script, stop_script, ChildStore, ScriptRunStore};
use commands::worktree::list_worktrees;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(AppStateStore::load(app.handle()));
            app.manage(ScriptRunStore::default());
            app.manage(ChildStore::default());
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            select_repository,
            validate_repository,
            list_worktrees,
            list_scripts,
            run_script,
            stop_script,
            get_app_state,
            save_app_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
