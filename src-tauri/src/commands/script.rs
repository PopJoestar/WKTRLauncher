use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::{BufRead, BufReader},
    path::Path,
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Emitter, State};

use crate::models::{
    CommandResponse, ScriptInfo, ScriptRunEvent, ScriptRunRequest, ScriptRunStatus,
};

pub struct ScriptRunStore(pub Mutex<HashSet<String>>);

impl Default for ScriptRunStore {
    fn default() -> Self {
        Self(Mutex::new(HashSet::new()))
    }
}

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
pub fn run_script(
    app: AppHandle,
    request: ScriptRunRequest,
    run_store: State<'_, ScriptRunStore>,
) -> CommandResponse<ScriptRunStatus> {
    let start = now_string();

    let worktree_path = request.worktree_path.trim();
    let script_name = request.script_name.trim();

    if worktree_path.is_empty() || script_name.is_empty() {
        return CommandResponse::err(
            "INVALID_REQUEST",
            "worktreePath and scriptName are required to start a script run.",
        );
    }

    let root = Path::new(worktree_path);
    if !root.exists() || !root.is_dir() {
        return CommandResponse::err("PATH_NOT_FOUND", "Worktree path does not exist or is not a directory.");
    }

    let normalized_path = fs::canonicalize(root)
        .unwrap_or_else(|_| root.to_path_buf())
        .to_string_lossy()
        .to_string();
    let run_key = format!("{normalized_path}::{script_name}");

    {
        let mut guard = match run_store.0.lock() {
            Ok(value) => value,
            Err(_) => {
                return CommandResponse::err(
                    "RUN_STATE_UNAVAILABLE",
                    "Run state is unavailable. Please retry.",
                )
            }
        };

        if guard.contains(&run_key) {
            return CommandResponse::err(
                "RUN_ALREADY_ACTIVE",
                "This script is already running for the selected worktree.",
            );
        }
        guard.insert(run_key.clone());
    }

    let run_id = format!("run-{start}");
    let manager = request
        .package_manager
        .unwrap_or_else(|| detect_package_manager(root).to_string());

    let (command_name, command_args) = command_for(&manager, script_name);

    let mut command = Command::new(command_name);
    command
        .args(command_args)
        .current_dir(root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match command.spawn() {
        Ok(value) => value,
        Err(_) => {
            remove_active_run(&run_store, &run_key);
            return CommandResponse::err("SPAWN_FAILED", "Failed to launch script process.");
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_for_stdout = app.clone();
    let app_for_stderr = app.clone();
    let run_id_for_stdout = run_id.clone();
    let run_id_for_stderr = run_id.clone();
    let path_for_stdout = normalized_path.clone();
    let path_for_stderr = normalized_path.clone();
    let script_for_stdout = script_name.to_string();
    let script_for_stderr = script_name.to_string();

    let stdout_thread = stdout.map(|stream| {
        thread::spawn(move || {
            let reader = BufReader::new(stream);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app_for_stdout.emit(
                    "script-run-output",
                    ScriptRunEvent {
                        run_id: run_id_for_stdout.clone(),
                        worktree_path: path_for_stdout.clone(),
                        script_name: script_for_stdout.clone(),
                        stream: "stdout".to_string(),
                        line,
                        timestamp: now_string(),
                    },
                );
            }
        })
    });

    let stderr_thread = stderr.map(|stream| {
        thread::spawn(move || {
            let reader = BufReader::new(stream);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app_for_stderr.emit(
                    "script-run-output",
                    ScriptRunEvent {
                        run_id: run_id_for_stderr.clone(),
                        worktree_path: path_for_stderr.clone(),
                        script_name: script_for_stderr.clone(),
                        stream: "stderr".to_string(),
                        line,
                        timestamp: now_string(),
                    },
                );
            }
        })
    });

    let status = child.wait();

    if let Some(handle) = stdout_thread {
        let _ = handle.join();
    }
    if let Some(handle) = stderr_thread {
        let _ = handle.join();
    }

    remove_active_run(&run_store, &run_key);

    let finish = now_string();
    match status {
        Ok(exit_status) if exit_status.success() => CommandResponse::ok(ScriptRunStatus {
            run_id,
            status: "completed".to_string(),
            exit_code: exit_status.code(),
            started_at: start,
            finished_at: Some(finish),
        }),
        Ok(exit_status) => CommandResponse::ok(ScriptRunStatus {
            run_id,
            status: "failed".to_string(),
            exit_code: exit_status.code(),
            started_at: start,
            finished_at: Some(finish),
        }),
        Err(_) => CommandResponse::err("EXECUTION_FAILED", "Script process failed to execute."),
    }
}

fn command_for(manager: &str, script_name: &str) -> (&'static str, Vec<String>) {
    match manager {
        "pnpm" => ("pnpm", vec!["run".to_string(), script_name.to_string()]),
        "yarn" => ("yarn", vec!["run".to_string(), script_name.to_string()]),
        "npm" => ("npm", vec!["run".to_string(), script_name.to_string()]),
        _ => ("npm", vec!["run".to_string(), script_name.to_string()]),
    }
}

fn remove_active_run(run_store: &State<'_, ScriptRunStore>, run_key: &str) {
    if let Ok(mut guard) = run_store.0.lock() {
        guard.remove(run_key);
    }
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

fn now_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}
