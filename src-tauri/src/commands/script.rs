use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::{CommandResponse, ScriptInfo, ScriptRunRequest, ScriptRunStatus};

#[tauri::command]
pub fn list_scripts(worktree_path: String) -> CommandResponse<Vec<ScriptInfo>> {
    if worktree_path.trim().is_empty() {
        return CommandResponse::err("INVALID_PATH", "Worktree path is required.");
    }

    // Package.json parsing lands in issue #4.
    CommandResponse::ok(Vec::new())
}

#[tauri::command]
pub fn run_script(request: ScriptRunRequest) -> CommandResponse<ScriptRunStatus> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());

    if request.worktree_path.trim().is_empty() || request.script_name.trim().is_empty() {
        return CommandResponse::err(
            "INVALID_REQUEST",
            "worktreePath and scriptName are required to start a script run.",
        );
    }

    // Process execution and log streaming land in issue #5.
    CommandResponse::ok(ScriptRunStatus {
        run_id: format!("stub-{now}"),
        status: "notImplemented".to_string(),
        exit_code: None,
        started_at: now,
        finished_at: None,
    })
}
