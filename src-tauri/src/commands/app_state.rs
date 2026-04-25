use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
};

use tauri::{AppHandle, Manager, State};

use crate::models::{AppState, CommandResponse};

pub struct AppStateStore {
    pub state: Mutex<AppState>,
    path: PathBuf,
}

impl AppStateStore {
    pub fn load(app: &AppHandle) -> Self {
        let path = resolve_state_path(app);
        let state = fs::read_to_string(&path)
            .ok()
            .and_then(|content| serde_json::from_str::<AppState>(&content).ok())
            .unwrap_or_default();

        Self {
            state: Mutex::new(state),
            path,
        }
    }

    fn persist(&self, state: &AppState) -> Result<(), String> {
        let json = serde_json::to_string_pretty(state)
            .map_err(|_| "Failed to serialize app state.".to_string())?;

        fs::write(&self.path, json).map_err(|_| "Failed to write app state on disk.".to_string())
    }
}

fn resolve_state_path(app: &AppHandle) -> PathBuf {
    let mut base = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("wktrlauncher"));
    let _ = fs::create_dir_all(&base);
    base.push("app-state.json");
    base
}

#[tauri::command]
pub fn get_app_state(store: State<'_, AppStateStore>) -> CommandResponse<AppState> {
    match store.state.lock() {
        Ok(guard) => CommandResponse::ok(guard.clone()),
        Err(_) => CommandResponse::err("STATE_UNAVAILABLE", "Application state lock is unavailable."),
    }
}

#[tauri::command]
pub fn save_app_state(state: AppState, store: State<'_, AppStateStore>) -> CommandResponse<AppState> {
    match store.state.lock() {
        Ok(mut guard) => {
            *guard = state.clone();
            match store.persist(&state) {
                Ok(_) => CommandResponse::ok(state),
                Err(message) => CommandResponse::err("STATE_PERSISTENCE_FAILED", &message),
            }
        }
        Err(_) => CommandResponse::err("STATE_UNAVAILABLE", "Application state lock is unavailable."),
    }
}
