import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppState,
  CommandResponse,
  RepositoryInfo,
  ScriptInfo,
  ScriptRunEvent,
  ScriptRunRequest,
  ScriptRunStatus,
  WorktreeInfo,
} from "../models/domain";

const SCRIPT_RUN_EVENT = "script-run-output";

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const response = await invoke<CommandResponse<T>>(command, args);

  if (response.error) {
    throw new Error(`${response.error.code}: ${response.error.message}`);
  }

  if (response.data === undefined) {
    throw new Error(`Command ${command} returned no data.`);
  }

  return response.data;
}

export const tauriClient = {
  validateRepository(path: string): Promise<RepositoryInfo> {
    return invokeCommand("validate_repository", { path });
  },

  listWorktrees(repositoryPath: string): Promise<WorktreeInfo[]> {
    return invokeCommand("list_worktrees", { repositoryPath });
  },

  listScripts(worktreePath: string): Promise<ScriptInfo[]> {
    return invokeCommand("list_scripts", { worktreePath });
  },

  runScript(request: ScriptRunRequest): Promise<ScriptRunStatus> {
    return invokeCommand("run_script", { request });
  },

  getAppState(): Promise<AppState> {
    return invokeCommand("get_app_state");
  },

  saveAppState(state: AppState): Promise<AppState> {
    return invokeCommand("save_app_state", { state });
  },

  onScriptRunOutput(handler: (event: ScriptRunEvent) => void): Promise<UnlistenFn> {
    return listen<ScriptRunEvent>(SCRIPT_RUN_EVENT, ({ payload }) => handler(payload));
  },
};
