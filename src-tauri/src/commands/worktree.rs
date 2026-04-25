use crate::models::{CommandResponse, WorktreeInfo};

#[tauri::command]
pub fn list_worktrees(repository_path: String) -> CommandResponse<Vec<WorktreeInfo>> {
    if repository_path.trim().is_empty() {
        return CommandResponse::err("INVALID_PATH", "Repository path is required.");
    }

    // Full Git worktree discovery is implemented in issue #3.
    CommandResponse::ok(vec![WorktreeInfo {
        path: repository_path,
        branch: "main".to_string(),
        is_main: true,
    }])
}
