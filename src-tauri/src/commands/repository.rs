use std::path::Path;

use crate::models::{CommandResponse, RepositoryInfo};

#[tauri::command]
pub fn select_repository() -> CommandResponse<Option<String>> {
    let selected = rfd::FileDialog::new()
        .set_title("Select Git Repository")
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string());

    CommandResponse::ok(selected)
}

#[tauri::command]
pub fn validate_repository(path: String) -> CommandResponse<RepositoryInfo> {
    let trimmed = path.trim();

    if trimmed.is_empty() {
        return CommandResponse::err("INVALID_PATH", "Repository path is required.");
    }

    let repo_path = Path::new(trimmed);
    if !repo_path.exists() {
        return CommandResponse::err("PATH_NOT_FOUND", "The selected path does not exist.");
    }

    if !repo_path.is_dir() {
        return CommandResponse::err("INVALID_PATH", "The selected path must be a directory.");
    }

    let git_path = repo_path.join(".git");
    let is_valid = git_path.is_dir() || git_path.is_file();

    if !is_valid {
        return CommandResponse::err(
            "NOT_A_GIT_REPOSITORY",
            "The selected folder is not a Git repository root (.git missing).",
        );
    }

    let name = repo_path
        .file_name()
        .and_then(|value| value.to_str())
        .map(std::string::ToString::to_string)
        .unwrap_or_else(|| repo_path.to_string_lossy().to_string());

    CommandResponse::ok(RepositoryInfo {
        path: repo_path.to_string_lossy().to_string(),
        name,
        is_valid,
    })
}
