import { FormEvent, useEffect, useRef, useState } from "react";
import { APP_STATE_UPDATED_EVENT } from "../lib/cacheKeys";
import { tauriClient } from "../lib/tauriClient";
import type {
  AppState,
  LaunchConfig,
  RepositoryInfo,
  ScriptFinishedEvent,
  ScriptInfo,
  ScriptRunEvent,
  WorktreeInfo,
} from "../models/domain";

type RunningInfo = { runKey: string; runId: string; port: number; branch: string };
type FormDraft = { scriptName: string; port: string };
type Toast = { id: string; branch: string; scriptName: string; exitCode: number };

const EMPTY_STATE: AppState = {
  recentRepositories: [],
  launchConfigs: {},
};

function MainPage() {
  const [path, setPath] = useState("");
  const [repository, setRepository] = useState<RepositoryInfo | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [appState, setAppState] = useState<AppState>(EMPTY_STATE);
  const [error, setError] = useState<string | null>(null);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isRefreshingWorktrees, setIsRefreshingWorktrees] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const [runningWorktrees, setRunningWorktrees] = useState<Record<string, RunningInfo>>({});
  const runningWorktreesRef = useRef<Record<string, RunningInfo>>({});
  const [lastRunIds, setLastRunIds] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [openForms, setOpenForms] = useState<Record<string, boolean>>({});
  const [formDrafts, setFormDrafts] = useState<Record<string, FormDraft>>({});
  const [worktreeScripts, setWorktreeScripts] = useState<Record<string, ScriptInfo[]>>({});
  const [loadingScripts, setLoadingScripts] = useState<Record<string, boolean>>({});
  const [launchErrors, setLaunchErrors] = useState<Record<string, string | null>>({});
  const [worktreeLogs, setWorktreeLogs] = useState<Record<string, string[]>>({});

  useEffect(() => {
    runningWorktreesRef.current = runningWorktrees;
  }, [runningWorktrees]);

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | null = null;

    void tauriClient
      .onScriptRunOutput((event: ScriptRunEvent) => {
        if (!active) return;
        setWorktreeLogs((prev) => ({
          ...prev,
          [event.runId]: [...(prev[event.runId] ?? []).slice(-199), `[${event.stream}] ${event.line}`],
        }));
      })
      .then((unlisten) => {
        cleanup = unlisten;
      });

    return () => {
      active = false;
      if (cleanup) cleanup();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | null = null;

    void tauriClient
      .onScriptRunFinished((event: ScriptFinishedEvent) => {
        if (!active) return;

        let matchedPath: string | null = null;
        let matchedInfo: RunningInfo | null = null;

        for (const [worktreePath, info] of Object.entries(runningWorktreesRef.current)) {
          if (info.runKey === event.runKey) {
            matchedPath = worktreePath;
            matchedInfo = info;
            break;
          }
        }

        if (!matchedPath) return;

        setRunningWorktrees((prev) => {
          const updated = { ...prev };
          delete updated[matchedPath!];
          return updated;
        });

        setLastRunIds((prev) => ({ ...prev, [matchedPath!]: event.runId }));

        const crashed =
          event.exitCode !== null && event.exitCode !== undefined && event.exitCode !== 0;

        if (crashed) {
          setLaunchErrors((prev) => ({
            ...prev,
            [matchedPath!]: `Server exited with code ${event.exitCode}. See "Last run output" below.`,
          }));

          const toastId = `${Date.now()}`;
          setToasts((prev) => [
            ...prev,
            {
              id: toastId,
              branch: matchedInfo!.branch,
              scriptName: event.scriptName,
              exitCode: event.exitCode!,
            },
          ]);
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== toastId));
          }, 10000);
        } else {
          setLaunchErrors((prev) => ({ ...prev, [matchedPath!]: null }));
        }
      })
      .then((unlisten) => {
        cleanup = unlisten;
      });

    return () => {
      active = false;
      if (cleanup) cleanup();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function restoreState() {
      try {
        const savedState = await tauriClient.getAppState();
        if (!isMounted) return;
        setAppState(savedState);
        if (!savedState.lastRepositoryPath) return;
        setPath(savedState.lastRepositoryPath);
        await validateAndPersist(savedState.lastRepositoryPath, savedState, false);
      } catch {
        // silently skip
      }
    }

    void restoreState();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function handleFocus() {
      if (repository) void refreshWorktrees(repository.path);
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [repository]);

  useEffect(() => {
    function handleStateUpdated() {
      void tauriClient.getAppState().then(setAppState);
    }
    window.addEventListener(APP_STATE_UPDATED_EVENT, handleStateUpdated);
    return () => window.removeEventListener(APP_STATE_UPDATED_EVENT, handleStateUpdated);
  }, []);

  async function refreshWorktrees(repositoryPath: string) {
    setWorktreeError(null);
    setIsRefreshingWorktrees(true);
    try {
      const items = await tauriClient.listWorktrees(repositoryPath);
      setWorktrees(items);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err) {
      setWorktrees([]);
      setWorktreeError(toFriendlyMessage(err));
    } finally {
      setIsRefreshingWorktrees(false);
    }
  }

  async function persistRepositoryState(selectedPath: string, current: AppState): Promise<AppState> {
    const deduped = [selectedPath, ...current.recentRepositories.filter((v) => v !== selectedPath)].slice(0, 8);
    const nextState: AppState = { ...current, lastRepositoryPath: selectedPath, recentRepositories: deduped };
    const saved = await tauriClient.saveAppState(nextState);
    setAppState(saved);
    return saved;
  }

  async function validateAndPersist(rawPath: string, currentState?: AppState, shouldPersist = true) {
    const trimmedPath = rawPath.trim();
    if (!trimmedPath) {
      setError("Please choose a repository folder first.");
      setRepository(null);
      setWorktrees([]);
      return;
    }

    setError(null);
    setRepository(null);
    setWorktrees([]);
    setIsChecking(true);

    try {
      const result = await tauriClient.validateRepository(trimmedPath);
      setRepository(result);
      setPath(result.path);
      await refreshWorktrees(result.path);
      if (shouldPersist) {
        await persistRepositoryState(result.path, currentState ?? appState);
      }
    } catch (err) {
      setRepository(null);
      setWorktrees([]);
      setError(toFriendlyMessage(err));
    } finally {
      setIsChecking(false);
    }
  }

  async function handleSelectRepository() {
    setIsPicking(true);
    try {
      const selectedPath = await tauriClient.selectRepository();
      if (!selectedPath) return;
      setPath(selectedPath);
      await validateAndPersist(selectedPath);
    } catch {
      setError("Unable to open folder picker.");
    } finally {
      setIsPicking(false);
    }
  }

  function handleValidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void validateAndPersist(path);
  }

  async function openLaunchForm(worktree: WorktreeInfo) {
    const existing = appState.launchConfigs[worktree.path];
    const suggestedPort = existing?.port ?? suggestNextPort(appState.launchConfigs);

    setOpenForms((prev) => ({ ...prev, [worktree.path]: true }));
    setFormDrafts((prev) => ({
      ...prev,
      [worktree.path]: {
        scriptName: existing?.scriptName ?? "",
        port: String(suggestedPort),
      },
    }));
    setLaunchErrors((prev) => ({ ...prev, [worktree.path]: null }));

    if (!worktreeScripts[worktree.path]) {
      setLoadingScripts((prev) => ({ ...prev, [worktree.path]: true }));
      try {
        const scripts = await tauriClient.listScripts(worktree.path);
        setWorktreeScripts((prev) => ({ ...prev, [worktree.path]: scripts }));
        if (!existing?.scriptName && scripts.length > 0) {
          const devScript = scripts.find((s) => s.name === "dev") ?? scripts[0];
          setFormDrafts((prev) => ({
            ...prev,
            [worktree.path]: { ...prev[worktree.path], scriptName: devScript.name },
          }));
        }
      } catch {
        // user can type manually
      } finally {
        setLoadingScripts((prev) => ({ ...prev, [worktree.path]: false }));
      }
    }
  }

  function closeLaunchForm(worktreePath: string) {
    setOpenForms((prev) => ({ ...prev, [worktreePath]: false }));
  }

  function updateDraft(worktreePath: string, field: Partial<FormDraft>) {
    setFormDrafts((prev) => ({
      ...prev,
      [worktreePath]: { ...prev[worktreePath], ...field },
    }));
  }

  async function handleLaunch(worktree: WorktreeInfo) {
    const draft = formDrafts[worktree.path];
    if (!draft?.scriptName.trim()) {
      setLaunchErrors((prev) => ({ ...prev, [worktree.path]: "Select a script to run." }));
      return;
    }
    const port = parseInt(draft.port, 10);
    if (!port || port < 1024 || port > 65535) {
      setLaunchErrors((prev) => ({ ...prev, [worktree.path]: "Enter a valid port number (1024–65535)." }));
      return;
    }

    setLaunchErrors((prev) => ({ ...prev, [worktree.path]: null }));

    const updatedState: AppState = {
      ...appState,
      launchConfigs: {
        ...appState.launchConfigs,
        [worktree.path]: { scriptName: draft.scriptName, port },
      },
    };
    const saved = await tauriClient.saveAppState(updatedState);
    setAppState(saved);
    setOpenForms((prev) => ({ ...prev, [worktree.path]: false }));

    await launchWorktree(worktree, draft.scriptName, port, saved);
  }

  async function launchWorktree(worktree: WorktreeInfo, scriptName: string, port: number, currentState?: AppState) {
    const state = currentState ?? appState;
    setLaunchErrors((prev) => ({ ...prev, [worktree.path]: null }));
    setLastRunIds((prev) => {
      const updated = { ...prev };
      delete updated[worktree.path];
      return updated;
    });
    try {
      const result = await tauriClient.runScript({
        worktreePath: worktree.path,
        scriptName,
        packageManager: state.preferredPackageManager,
        port,
      });
      setRunningWorktrees((prev) => ({
        ...prev,
        [worktree.path]: { runKey: result.runKey, runId: result.runId, port, branch: worktree.branch },
      }));
    } catch (err) {
      setLaunchErrors((prev) => ({ ...prev, [worktree.path]: toFriendlyMessage(err) }));
    }
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleStop(worktree: WorktreeInfo) {
    const running = runningWorktrees[worktree.path];
    if (!running) return;
    try {
      await tauriClient.stopScript(running.runKey);
    } catch {
      // process cleanup handled by script-run-finished event
    }
  }

  return (
    <>
    <section className="panel">
      <h2>Worktree Launcher</h2>
      <p className="panel-copy">Launch each worktree on its own port and compare your app versions side by side.</p>

      <div className="picker-row">
        <button type="button" className="secondary" onClick={handleSelectRepository} disabled={isPicking || isChecking}>
          {isPicking ? "Opening..." : "Choose Repository Folder"}
        </button>
      </div>

      <form className="path-form" onSubmit={handleValidate}>
        <label htmlFor="repo-path">Repository path</label>
        <input
          id="repo-path"
          value={path}
          onChange={(e) => setPath(e.currentTarget.value)}
          placeholder="/Users/name/projects/your-repo"
        />
        <button type="submit" disabled={isChecking || path.trim().length === 0}>
          {isChecking ? "Checking..." : "Validate Repository"}
        </button>
      </form>

      {appState.recentRepositories.length > 0 && (
        <div className="recent-block">
          <h3>Recent Repositories</h3>
          <ul>
            {appState.recentRepositories.map((entry) => (
              <li key={entry}>
                <button type="button" className="link-button" onClick={() => void validateAndPersist(entry)}>
                  {entry}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {repository && (
        <div className="status-card success" role="status">
          <h3>Repository Ready</h3>
          <p>
            <strong>Name:</strong> {repository.name}
          </p>
          <p>
            <strong>Path:</strong> {repository.path}
          </p>
        </div>
      )}

      {error && (
        <div className="status-card error" role="alert">
          <h3>Could Not Open Repository</h3>
          <p>{error}</p>
        </div>
      )}

      {repository && (
        <div className="worktree-block">
          <div className="worktree-header">
            <h3>Worktrees</h3>
            <div className="worktree-actions">
              {lastRefresh && <span className="subtle">Last refresh: {lastRefresh}</span>}
              <button
                type="button"
                className="secondary"
                onClick={() => void refreshWorktrees(repository.path)}
                disabled={isRefreshingWorktrees}
              >
                {isRefreshingWorktrees ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          {worktreeError && (
            <div className="status-card error" role="alert">
              <h3>Could Not Refresh Worktrees</h3>
              <p>{worktreeError}</p>
            </div>
          )}

          {!worktreeError && worktrees.length === 0 && <p className="subtle">No worktrees found.</p>}

          <ul className="worktree-list">
            {worktrees.filter((w) => w.branch !== "(detached)").map((worktree) => {
              const config = appState.launchConfigs[worktree.path];
              const running = runningWorktrees[worktree.path];
              const formOpen = openForms[worktree.path] ?? false;
              const draft = formDrafts[worktree.path];
              const scripts = worktreeScripts[worktree.path] ?? [];
              const isLoadingScripts = loadingScripts[worktree.path] ?? false;
              const launchError = launchErrors[worktree.path];
              const activeRunId = running?.runId ?? lastRunIds[worktree.path];
              const logs = activeRunId ? (worktreeLogs[activeRunId] ?? []) : [];
              const url = running
                ? `http://localhost:${running.port}`
                : config
                  ? `http://localhost:${config.port}`
                  : null;

              return (
                <li key={worktree.path} className="worktree-card">
                  <div className="worktree-card-main">
                    <div className="worktree-info">
                      <p>
                        <strong>{worktree.isMain ? "Main" : "Worktree"}</strong>
                        {running && (
                          <>
                            {" "}
                            <span className="running-dot" />
                          </>
                        )}
                      </p>
                      <p>
                        <span className="subtle">Branch:</span> {worktree.branch}
                      </p>
                      <p className="subtle" style={{ wordBreak: "break-all" }}>
                        {worktree.path}
                      </p>
                    </div>

                    <div className="launch-controls">
                      {running ? (
                        <div className="launch-status">
                          <span className="running-indicator">
                            <span className="running-dot-pulse" />
                            Running
                          </span>
                          <a
                            className="launch-url"
                            href={url!}
                            onClick={(e) => {
                              e.preventDefault();
                              void tauriClient.openUrl(url!);
                            }}
                          >
                            {url}
                          </a>
                          <div className="launch-actions">
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => void tauriClient.openUrl(url!)}
                            >
                              Open ↗
                            </button>
                            <button type="button" className="secondary" onClick={() => void handleStop(worktree)}>
                              Stop
                            </button>
                          </div>
                        </div>
                      ) : formOpen ? null : config ? (
                        <div className="launch-status">
                          <p className="config-preview">
                            <strong>{config.scriptName}</strong>
                            <span className="subtle"> · port {config.port}</span>
                          </p>
                          <div className="launch-actions">
                            <button
                              type="button"
                              onClick={() => void launchWorktree(worktree, config.scriptName, config.port)}
                            >
                              Launch
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => void openLaunchForm(worktree)}
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => void openLaunchForm(worktree)}>
                          Configure &amp; Launch
                        </button>
                      )}
                    </div>
                  </div>

                  {formOpen && (
                    <div className="launch-form">
                      {isLoadingScripts ? (
                        <p className="subtle">Loading scripts…</p>
                      ) : (
                        <>
                          <div className="launch-form-row">
                            <label htmlFor={`script-${worktree.path}`}>Script to run</label>
                            {scripts.length > 0 ? (
                              <select
                                id={`script-${worktree.path}`}
                                value={draft?.scriptName ?? ""}
                                onChange={(e) => updateDraft(worktree.path, { scriptName: e.currentTarget.value })}
                              >
                                {scripts.map((s) => (
                                  <option key={s.name} value={s.name}>
                                    {s.name} — {s.command}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                id={`script-${worktree.path}`}
                                value={draft?.scriptName ?? ""}
                                onChange={(e) => updateDraft(worktree.path, { scriptName: e.currentTarget.value })}
                                placeholder="dev"
                              />
                            )}
                          </div>

                          <div className="launch-form-row">
                            <label htmlFor={`port-${worktree.path}`}>Port</label>
                            <input
                              id={`port-${worktree.path}`}
                              type="number"
                              min="1024"
                              max="65535"
                              value={draft?.port ?? ""}
                              onChange={(e) => updateDraft(worktree.path, { port: e.currentTarget.value })}
                            />
                          </div>

                          {launchError && <p className="launch-form-error">{launchError}</p>}

                          <div className="launch-form-actions">
                            <button type="button" onClick={() => void handleLaunch(worktree)}>
                              Launch
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => closeLaunchForm(worktree.path)}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {launchError && !formOpen && (
                    <p className="launch-card-error">{launchError}</p>
                  )}

                  {logs.length > 0 && (
                    <div className="worktree-log">
                      <h5>{running ? "Console" : "Last run output"}</h5>
                      <pre ref={(el) => { if (el && running) el.scrollTop = el.scrollHeight; }}>
                        {logs.join("\n")}
                      </pre>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>

    {toasts.length > 0 && (
      <div className="toast-container" role="alert" aria-live="assertive">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast toast-error">
            <div className="toast-body">
              <strong>"{toast.branch}" crashed</strong>
              <span>
                <code>{toast.scriptName}</code> exited with code {toast.exitCode}. Check the output in the card.
              </span>
            </div>
            <button type="button" className="toast-dismiss" onClick={() => dismissToast(toast.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
    )}
    </>
  );
}

function suggestNextPort(configs: Record<string, LaunchConfig>): number {
  const used = new Set(Object.values(configs).map((c) => c.port));
  let port = 3000;
  while (used.has(port)) port++;
  return port;
}

function toFriendlyMessage(error: unknown): string {
  if (!(error instanceof Error)) return "An unexpected error occurred. Please try again.";
  const { message } = error;
  if (message.includes("INVALID_PATH") || message.includes("PATH_NOT_FOUND"))
    return "That folder path is not valid. Select a folder that exists on disk.";
  if (message.includes("NOT_A_GIT_REPOSITORY"))
    return "This folder is not a Git repository. Pick the project root containing .git.";
  if (message.includes("GIT_UNAVAILABLE"))
    return "Git is not available. Install Git and reopen the app.";
  if (message.includes("RUN_ALREADY_ACTIVE"))
    return "This worktree is already running.";
  if (message.includes("SPAWN_FAILED") || message.includes("EXECUTION_FAILED"))
    return "Could not start the server. Verify Node.js and your package manager are installed.";
  return message;
}

export default MainPage;
