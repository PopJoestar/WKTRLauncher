use std::{
    collections::BTreeMap,
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::models::{CommandResponse, ScriptInfo, ScriptRunRequest, ScriptRunStatus};

#[tauri::command]
pub fn list_scripts(worktree_path: String) -> CommandResponse<Vec<ScriptInfo>> {
    let trimmed = worktree_path.trim();
    if trimmed.is_empty() {
        return CommandResponse::err("INVALID_PATH", "Worktree path is required.");
    }

    let root = Path::new(trimmed);
    if !root.exists() || !root.is_dir() {
        return CommandResponse::err("PATH_NOT_FOUND", "Worktree path does not exist or is not a directory.");
    }

    let package_json = root.join("package.json");
    if !package_json.exists() {
        return CommandResponse::ok(Vec::new());
    }

    let content = match fs::read_to_string(&package_json) {
        Ok(value) => value,
        Err(_) => return CommandResponse::err("READ_FAILED", "Failed to read package.json."),
    };

    let parsed: serde_json::Value = match serde_json::from_str(&content) {
        Ok(value) => value,
        Err(_) => return CommandResponse::err("INVALID_PACKAGE_JSON", "package.json is not valid JSON."),
    };

    let scripts = parsed
        .get("scripts")
        .and_then(|value| value.as_object())
        .map(|object| {
            object
                .iter()
                .filter_map(|(name, command)| command.as_str().map(|cmd| (name.to_string(), cmd.to_string())))
                .collect::<BTreeMap<String, String>>()
        })
        .unwrap_or_default();

    let manager = detect_package_manager(root).to_string();

    let result = scripts
        .into_iter()
        .map(|(name, command)| ScriptInfo {
            name,
            command,
            package_manager: Some(manager.clone()),
        })
        .collect();

    CommandResponse::ok(result)
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

    // Process execution and log streaming land in issue #6.
    CommandResponse::ok(ScriptRunStatus {
        run_id: format!("stub-{now}"),
        status: "notImplemented".to_string(),
        exit_code: None,
        started_at: now,
        finished_at: None,
    })
}

fn detect_package_manager(root: &Path) -> &'static str {
    if root.join("pnpm-lock.yaml").exists() {
        "pnpm"
    } else if root.join("yarn.lock").exists() {
        "yarn"
    } else if root.join("package-lock.json").exists() {
        "npm"
    } else {
        "npm"
    }
}
