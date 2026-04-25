use std::{
    fs,
    path::Path,
    process::Command,
};

use crate::models::{CommandResponse, WorktreeInfo};

#[tauri::command]
pub fn list_worktrees(repository_path: String) -> CommandResponse<Vec<WorktreeInfo>> {
    let trimmed = repository_path.trim();
    if trimmed.is_empty() {
        return CommandResponse::err("INVALID_PATH", "Repository path is required.");
    }

    let repo = Path::new(trimmed);
    if !repo.exists() || !repo.is_dir() {
        return CommandResponse::err("PATH_NOT_FOUND", "Repository path does not exist or is not a directory.");
    }

    let output = match Command::new("git")
        .args(["-C", trimmed, "worktree", "list", "--porcelain"])
        .output()
    {
        Ok(value) => value,
        Err(_) => {
            return CommandResponse::err(
                "GIT_UNAVAILABLE",
                "Failed to run Git. Ensure git is installed and available in PATH.",
            );
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let message = if stderr.is_empty() {
            "Git worktree listing failed for the selected repository.".to_string()
        } else {
            format!("Git worktree listing failed: {stderr}")
        };
        return CommandResponse::err("WORKTREE_LIST_FAILED", &message);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();

    for block in stdout.split("\n\n") {
        let mut path = None;
        let mut branch = "(detached)".to_string();

        for line in block.lines().map(str::trim).filter(|line| !line.is_empty()) {
            if let Some(value) = line.strip_prefix("worktree ") {
                path = Some(value.to_string());
            } else if let Some(value) = line.strip_prefix("branch ") {
                branch = value
                    .strip_prefix("refs/heads/")
                    .unwrap_or(value)
                    .to_string();
            } else if line == "detached" {
                branch = "(detached)".to_string();
            }
        }

        if let Some(path) = path {
            worktrees.push(WorktreeInfo {
                path,
                branch,
                is_main: false,
            });
        }
    }

    if worktrees.is_empty() {
        return CommandResponse::ok(worktrees);
    }

    let canonical_repo = fs::canonicalize(repo)
        .unwrap_or_else(|_| repo.to_path_buf())
        .to_string_lossy()
        .to_string();

    let mut has_main = false;
    for worktree in &mut worktrees {
        let canonical_worktree = fs::canonicalize(&worktree.path)
            .unwrap_or_else(|_| Path::new(&worktree.path).to_path_buf())
            .to_string_lossy()
            .to_string();

        if canonical_worktree == canonical_repo {
            worktree.is_main = true;
            has_main = true;
        }
    }

    if !has_main {
        if let Some(first) = worktrees.first_mut() {
            first.is_main = true;
        }
    }

    CommandResponse::ok(worktrees)
}
