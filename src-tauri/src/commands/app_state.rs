use std::sync::Mutex;

use tauri::State;

use crate::models::{AppState, CommandResponse};

pub struct AppStateStore(pub Mutex<AppState>);

impl Default for AppStateStore {
    fn default() -> Self {
        Self(Mutex::new(AppState::default()))
    }
}

#[tauri::command]
pub fn get_app_state(state: State<'_, AppStateStore>) -> CommandResponse<AppState> {
    match state.0.lock() {
        Ok(guard) => CommandResponse::ok(guard.clone()),
        Err(_) => CommandResponse::err("STATE_UNAVAILABLE", "Application state lock is unavailable."),
    }
}

#[tauri::command]
pub fn save_app_state(state: AppState, store: State<'_, AppStateStore>) -> CommandResponse<AppState> {
    match store.0.lock() {
        Ok(mut guard) => {
            *guard = state.clone();
            CommandResponse::ok(state)
        }
        Err(_) => CommandResponse::err("STATE_UNAVAILABLE", "Application state lock is unavailable."),
    }
}
