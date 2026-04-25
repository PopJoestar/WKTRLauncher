use std::path::Path;

use crate::models::{CommandResponse, RepositoryInfo};

#[tauri::command]
pub fn validate_repository(path: String) -> CommandResponse<RepositoryInfo> {
    let trimmed = path.trim();

    if trimmed.is_empty() {
        return CommandResponse::err("INVALID_PATH", "Repository path is required.");
    }

    let repo_path = Path::new(trimmed);
    let git_path = repo_path.join(".git");
    let is_valid = git_path.exists();

    if !is_valid {
        return CommandResponse::err(
            "NOT_A_GIT_REPOSITORY",
            "The selected path does not contain a .git directory.",
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
