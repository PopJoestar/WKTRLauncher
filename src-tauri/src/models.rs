use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInfo {
    pub path: String,
    pub name: String,
    pub is_valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub is_main: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptInfo {
    pub name: String,
    pub command: String,
    pub package_manager: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptRunRequest {
    pub worktree_path: String,
    pub script_name: String,
    pub package_manager: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptRunStatus {
    pub run_id: String,
    pub run_key: String,
    pub status: String,
    pub exit_code: Option<i32>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptFinishedEvent {
    pub run_id: String,
    pub run_key: String,
    pub worktree_path: String,
    pub script_name: String,
    pub exit_code: Option<i32>,
    pub finished_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptRunEvent {
    pub run_id: String,
    pub worktree_path: String,
    pub script_name: String,
    pub stream: String,
    pub line: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub last_repository_path: Option<String>,
    pub recent_repositories: Vec<String>,
    pub preferred_package_manager: Option<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            last_repository_path: None,
            recent_repositories: Vec::new(),
            preferred_package_manager: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub code: String,
    pub message: String,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResponse<T> {
    pub data: Option<T>,
    pub error: Option<ErrorPayload>,
}

impl<T> CommandResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            data: Some(data),
            error: None,
        }
    }

    pub fn err(code: &str, message: &str) -> Self {
        Self {
            data: None,
            error: Some(ErrorPayload {
                code: code.to_owned(),
                message: message.to_owned(),
                details: None,
            }),
        }
    }
}
