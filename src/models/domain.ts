export interface RepositoryInfo {
  path: string;
  name: string;
  isValid: boolean;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
}

export interface ScriptInfo {
  name: string;
  command: string;
  packageManager?: string;
}

export interface ScriptRunRequest {
  worktreePath: string;
  scriptName: string;
  packageManager?: string;
}

export interface ScriptRunStatus {
  runId: string;
  runKey: string;
  status: "idle" | "running" | "completed" | "failed" | "notImplemented";
  exitCode?: number;
  startedAt: string;
  finishedAt?: string;
}

export interface ScriptFinishedEvent {
  runId: string;
  runKey: string;
  worktreePath: string;
  scriptName: string;
  exitCode?: number;
  finishedAt: string;
}

export interface AppState {
  lastRepositoryPath?: string;
  recentRepositories: string[];
  preferredPackageManager?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: string;
}

export interface CommandResponse<T> {
  data?: T;
  error?: ErrorPayload;
}

export interface ScriptRunEvent {
  runId: string;
  worktreePath: string;
  scriptName: string;
  stream: "stdout" | "stderr";
  line: string;
  timestamp: string;
}
