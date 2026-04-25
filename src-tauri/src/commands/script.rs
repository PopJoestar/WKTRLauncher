use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    io::{BufRead, BufReader},
    os::unix::process::CommandExt,
    path::Path,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Emitter, State};

use crate::models::{
    CommandResponse, ScriptFinishedEvent, ScriptInfo, ScriptRunEvent, ScriptRunRequest,
    ScriptRunStatus,
};

#[derive(Clone, Default)]
pub struct ScriptRunStore(pub Arc<Mutex<HashSet<String>>>);

#[derive(Clone, Default)]
pub struct ChildStore(pub Arc<Mutex<HashMap<String, u32>>>);

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
    child_store: State<'_, ChildStore>,
) -> CommandResponse<ScriptRunStatus> {
    let start = now_string();

    let worktree_path = request.worktree_path.trim().to_string();
    let script_name = request.script_name.trim().to_string();

    if worktree_path.is_empty() || script_name.is_empty() {
        return CommandResponse::err(
            "INVALID_REQUEST",
            "worktreePath and scriptName are required to start a script run.",
        );
    }

    let root = Path::new(&worktree_path);
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

    let (command_name, command_args) = command_for(&manager, &script_name);

    let mut command = Command::new(command_name);
    command
        .args(command_args)
        .current_dir(root)
        .env("PATH", resolved_path())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0);

    let mut child = match command.spawn() {
        Ok(value) => value,
        Err(_) => {
            run_store.0.lock().ok().map(|mut g| g.remove(&run_key));
            return CommandResponse::err("SPAWN_FAILED", "Failed to launch script process.");
        }
    };

    let pid = child.id();
    {
        let mut guard = child_store.0.lock().unwrap_or_else(|e| e.into_inner());
        guard.insert(run_key.clone(), pid);
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_stdout = app.clone();
    let app_stderr = app.clone();
    let app_wait = app.clone();
    let run_id_stdout = run_id.clone();
    let run_id_stderr = run_id.clone();
    let run_id_wait = run_id.clone();
    let path_stdout = normalized_path.clone();
    let path_stderr = normalized_path.clone();
    let path_wait = normalized_path.clone();
    let script_stdout = script_name.clone();
    let script_stderr = script_name.clone();
    let script_wait = script_name.clone();
    let run_key_wait = run_key.clone();
    let run_store_wait = run_store.0.clone();
    let child_store_wait = child_store.0.clone();

    let stdout_thread = stdout.map(|stream| {
        thread::spawn(move || {
            let reader = BufReader::new(stream);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app_stdout.emit(
                    "script-run-output",
                    ScriptRunEvent {
                        run_id: run_id_stdout.clone(),
                        worktree_path: path_stdout.clone(),
                        script_name: script_stdout.clone(),
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
                let _ = app_stderr.emit(
                    "script-run-output",
                    ScriptRunEvent {
                        run_id: run_id_stderr.clone(),
                        worktree_path: path_stderr.clone(),
                        script_name: script_stderr.clone(),
                        stream: "stderr".to_string(),
                        line,
                        timestamp: now_string(),
                    },
                );
            }
        })
    });

    thread::spawn(move || {
        let exit_status = child.wait().ok();
        let exit_code = exit_status.and_then(|s| s.code());

        if let Some(handle) = stdout_thread {
            let _ = handle.join();
        }
        if let Some(handle) = stderr_thread {
            let _ = handle.join();
        }

        run_store_wait.lock().ok().map(|mut g| g.remove(&run_key_wait));
        child_store_wait.lock().ok().map(|mut g| g.remove(&run_key_wait));

        let _ = app_wait.emit(
            "script-run-finished",
            ScriptFinishedEvent {
                run_id: run_id_wait,
                run_key: run_key_wait,
                worktree_path: path_wait,
                script_name: script_wait,
                exit_code,
                finished_at: now_string(),
            },
        );
    });

    CommandResponse::ok(ScriptRunStatus {
        run_id,
        run_key,
        status: "running".to_string(),
        exit_code: None,
        started_at: start,
        finished_at: None,
    })
}

#[tauri::command]
pub fn stop_script(
    run_key: String,
    child_store: State<'_, ChildStore>,
) -> CommandResponse<()> {
    let pid = {
        let guard = match child_store.0.lock() {
            Ok(g) => g,
            Err(_) => return CommandResponse::err("CHILD_STATE_UNAVAILABLE", "Child state is unavailable."),
        };
        guard.get(&run_key).copied()
    };

    if let Some(pid) = pid {
        let _ = Command::new("kill")
            .args(["-9", &format!("-{pid}")])
            .spawn();
        CommandResponse::ok(())
    } else {
        CommandResponse::err("NOT_RUNNING", "No active script found for this run key.")
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

fn resolved_path() -> String {
    let prefixes = [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/local/sbin",
    ];
    let existing = std::env::var("PATH")
        .unwrap_or_else(|_| "/usr/bin:/bin:/usr/sbin:/sbin".to_string());
    format!("{}:{existing}", prefixes.join(":"))
}

fn now_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}
