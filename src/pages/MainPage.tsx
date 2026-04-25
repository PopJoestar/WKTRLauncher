import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  APP_STATE_UPDATED_EVENT,
  RUN_CACHE_CLEARED_EVENT,
  RUN_LOG_CACHE_KEY,
  RUN_SUMMARY_CACHE_KEY,
} from "../lib/cacheKeys";
import { tauriClient } from "../lib/tauriClient";
import type { AppState, RepositoryInfo, ScriptFinishedEvent, ScriptInfo, ScriptRunEvent, WorktreeInfo } from "../models/domain";

const EMPTY_STATE: AppState = {
  recentRepositories: [],
};

const RISK_PATTERNS = [/clean/i, /reset/i, /migrate/i, /drop/i, /destroy/i];

type RunSummary = {
  runId: string;
  scriptName: string;
  worktreePath: string;
  status: string;
  exitCode?: number;
  finishedAt?: string;
};

type PendingConfirmation = {
  script: ScriptInfo;
  effectiveManager: string;
};

function MainPage() {
  const [path, setPath] = useState("");
  const [repository, setRepository] = useState<RepositoryInfo | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [selectedWorktreePath, setSelectedWorktreePath] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [appState, setAppState] = useState<AppState>(EMPTY_STATE);
  const [error, setError] = useState<string | null>(null);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const [runLogs, setRunLogs] = useState<string[]>([]);
  const [runSummaries, setRunSummaries] = useState<RunSummary[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isRefreshingWorktrees, setIsRefreshingWorktrees] = useState(false);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);
  const [runningRunKey, setRunningRunKey] = useState<string | null>(null);

  const selectedWorktree = useMemo(
    () => worktrees.find((worktree) => worktree.path === selectedWorktreePath) ?? null,
    [selectedWorktreePath, worktrees],
  );

  useEffect(() => {
    try {
      const rawLogs = localStorage.getItem(RUN_LOG_CACHE_KEY);
      if (rawLogs) setRunLogs(JSON.parse(rawLogs) as string[]);
      const rawSummary = localStorage.getItem(RUN_SUMMARY_CACHE_KEY);
      if (rawSummary) setRunSummaries(JSON.parse(rawSummary) as RunSummary[]);
    } catch {
      setRunLogs([]);
      setRunSummaries([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(RUN_LOG_CACHE_KEY, JSON.stringify(runLogs.slice(-250)));
  }, [runLogs]);

  useEffect(() => {
    localStorage.setItem(RUN_SUMMARY_CACHE_KEY, JSON.stringify(runSummaries.slice(0, 12)));
  }, [runSummaries]);

  useEffect(() => {
    function handleRunCacheCleared() {
      setRunLogs([]);
      setRunSummaries([]);
      setLaunchMessage("Run cache was cleared from Settings.");
    }

    function handleStateUpdated() {
      void tauriClient.getAppState().then(setAppState);
    }

    window.addEventListener(RUN_CACHE_CLEARED_EVENT, handleRunCacheCleared);
    window.addEventListener(APP_STATE_UPDATED_EVENT, handleStateUpdated);

    return () => {
      window.removeEventListener(RUN_CACHE_CLEARED_EVENT, handleRunCacheCleared);
      window.removeEventListener(APP_STATE_UPDATED_EVENT, handleStateUpdated);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | null = null;

    void tauriClient
      .onScriptRunOutput((event: ScriptRunEvent) => {
        if (!active) return;
        const line = `[${event.stream}] ${event.line}`;
        setRunLogs((previous) => [...previous.slice(-249), line]);
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
        setRunningRunKey((current) => (current === event.runKey ? null : current));
        const exitInfo = event.exitCode !== undefined ? ` (exit: ${event.exitCode})` : "";
        setLaunchMessage(`Script "${event.scriptName}" finished${exitInfo}.`);
        const summary: RunSummary = {
          runId: event.runId,
          scriptName: event.scriptName,
          worktreePath: event.worktreePath,
          status: event.exitCode === 0 ? "completed" : "failed",
          exitCode: event.exitCode,
          finishedAt: event.finishedAt,
        };
        setRunSummaries((previous) => [summary, ...previous].slice(0, 12));
      })
      .then((unlisten) => {
        cleanup = unlisten;
      });

    return () => {
      active = false;
      if (cleanup) cleanup();
    };
  }, []);

  async function loadScripts(worktreePath: string) {
    setScriptError(null);
    setLaunchMessage(null);
    setIsLoadingScripts(true);

    try {
      const items = await tauriClient.listScripts(worktreePath);
      setScripts(items);
    } catch (loadError) {
      setScripts([]);
      setScriptError(toFriendlyMessage(loadError));
    } finally {
      setIsLoadingScripts(false);
    }
  }

  async function refreshWorktrees(repositoryPath: string) {
    setWorktreeError(null);
    setIsRefreshingWorktrees(true);

    try {
      const items = await tauriClient.listWorktrees(repositoryPath);
      setWorktrees(items);
      setLastRefresh(new Date().toLocaleTimeString());

      if (items.length === 0) {
        setSelectedWorktreePath(null);
        setScripts([]);
        return;
      }

      const retained = items.find((item) => item.path === selectedWorktreePath);
      const nextSelected = retained?.path ?? items[0].path;
      setSelectedWorktreePath(nextSelected);
      await loadScripts(nextSelected);
    } catch (refreshError) {
      setWorktrees([]);
      setScripts([]);
      setSelectedWorktreePath(null);
      setWorktreeError(toFriendlyMessage(refreshError));
    } finally {
      setIsRefreshingWorktrees(false);
    }
  }

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
        if (isMounted) {
          setError("Could not restore previous repository state.");
        }
      }
    }

    void restoreState();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function handleWindowFocus() {
      if (repository) {
        void refreshWorktrees(repository.path);
      }
    }

    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, [repository, selectedWorktreePath]);

  async function persistRepositoryState(selectedPath: string, current: AppState): Promise<AppState> {
    const deduped = [selectedPath, ...current.recentRepositories.filter((value) => value !== selectedPath)].slice(0, 8);

    const nextState: AppState = {
      ...current,
      lastRepositoryPath: selectedPath,
      recentRepositories: deduped,
    };

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
      setScripts([]);
      setSelectedWorktreePath(null);
      return;
    }

    setError(null);
    setRepository(null);
    setWorktrees([]);
    setScripts([]);
    setSelectedWorktreePath(null);
    setPendingConfirmation(null);
    setIsChecking(true);

    try {
      const result = await tauriClient.validateRepository(trimmedPath);
      setRepository(result);
      setPath(result.path);
      await refreshWorktrees(result.path);

      if (shouldPersist) {
        await persistRepositoryState(result.path, currentState ?? appState);
      }
    } catch (validationError) {
      setRepository(null);
      setWorktrees([]);
      setScripts([]);
      setSelectedWorktreePath(null);
      setError(toFriendlyMessage(validationError));
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

  async function handleValidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await validateAndPersist(path);
  }

  async function executeScriptLaunch(script: ScriptInfo, effectiveManager: string) {
    if (!selectedWorktree) return;

    setLaunchMessage(null);
    setRunLogs([]);

    try {
      const result = await tauriClient.runScript({
        worktreePath: selectedWorktree.path,
        scriptName: script.name,
        packageManager: effectiveManager,
      });

      setRunningRunKey(result.runKey);
      setLaunchMessage(`Script "${script.name}" started.`);
    } catch (runError) {
      setRunningRunKey(null);
      setLaunchMessage(toFriendlyMessage(runError));
    }
  }

  async function handleStopScript() {
    if (!runningRunKey) return;
    try {
      await tauriClient.stopScript(runningRunKey);
    } catch {
      setLaunchMessage("Failed to stop the script.");
    }
  }

  function handleLaunchRequest(script: ScriptInfo) {
    if (!selectedWorktree) return;
    const effectiveManager = appState.preferredPackageManager ?? script.packageManager ?? "npm";

    if (isRiskyScript(script.name)) {
      setPendingConfirmation({ script, effectiveManager });
      return;
    }

    void executeScriptLaunch(script, effectiveManager);
  }

  return (
    <section className="panel">
      <h2>Repository Setup</h2>
      <p className="panel-copy">Pick your project folder and run scripts without terminal commands.</p>

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
          onChange={(event) => setPath(event.currentTarget.value)}
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
            {worktrees.map((worktree) => (
              <li
                key={worktree.path}
                className={worktree.path === selectedWorktreePath ? "worktree-card selected" : "worktree-card"}
              >
                <button
                  type="button"
                  className="worktree-select"
                  onClick={() => {
                    setSelectedWorktreePath(worktree.path);
                    setPendingConfirmation(null);
                    void loadScripts(worktree.path);
                  }}
                >
                  <p>
                    <strong>{worktree.isMain ? "Main" : "Additional"}</strong>
                  </p>
                  <p>
                    <span className="subtle">Branch:</span> {worktree.branch}
                  </p>
                  <p>
                    <span className="subtle">Path:</span> {worktree.path}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedWorktree && (
        <div className="script-block">
          <div className="worktree-header">
            <h3>Scripts</h3>
            <span className="subtle">{selectedWorktree.path}</span>
          </div>

          {isLoadingScripts && <p className="subtle">Loading scripts...</p>}

          {!isLoadingScripts && scriptError && (
            <div className="status-card error" role="alert">
              <h3>Could Not Load Scripts</h3>
              <p>{scriptError}</p>
            </div>
          )}

          {!isLoadingScripts && !scriptError && scripts.length === 0 && (
            <p className="subtle">No scripts found in this worktree's package.json.</p>
          )}

          {!isLoadingScripts && !scriptError && scripts.length > 0 && (
            <ul className="script-list">
              {scripts.map((script) => {
                const effectiveManager = appState.preferredPackageManager ?? script.packageManager ?? "npm";
                return (
                  <li key={script.name} className="script-card">
                    <div>
                      <p>
                        <strong>{script.name}</strong>
                      </p>
                      <p className="subtle">{script.command}</p>
                      <p className="subtle">Runner: {effectiveManager}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLaunchRequest(script)}
                      disabled={runningRunKey !== null}
                    >
                      {runningRunKey?.endsWith(`::${script.name}`) ? "Running..." : "Run Script"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {pendingConfirmation && selectedWorktree && (
            <div className="status-card warning" role="alert">
              <h3>Confirm Risky Script</h3>
              <p>This script name looks potentially destructive. Confirm before running.</p>
              <p>
                <strong>Script:</strong> {pendingConfirmation.script.name}
              </p>
              <p>
                <strong>Command:</strong> {pendingConfirmation.script.command}
              </p>
              <p>
                <strong>Worktree:</strong> {selectedWorktree.path}
              </p>
              <p>
                <strong>Branch:</strong> {selectedWorktree.branch}
              </p>
              <p>
                <strong>Runner:</strong> {pendingConfirmation.effectiveManager}
              </p>
              <div className="confirm-actions">
                <button
                  type="button"
                  onClick={() => {
                    void executeScriptLaunch(pendingConfirmation.script, pendingConfirmation.effectiveManager);
                    setPendingConfirmation(null);
                  }}
                >
                  Confirm Run
                </button>
                <button type="button" className="secondary" onClick={() => setPendingConfirmation(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {runningRunKey && (
            <button type="button" className="secondary" onClick={() => void handleStopScript()}>
              Stop Script
            </button>
          )}

          {launchMessage && <p className="subtle">{launchMessage}</p>}

          {runLogs.length > 0 && (
            <div className="console-block">
              <h4>Run Console</h4>
              <pre>{runLogs.join("\n")}</pre>
            </div>
          )}

          {runSummaries.length > 0 && (
            <div className="summary-block">
              <h4>Recent Runs</h4>
              <ul>
                {runSummaries.map((summary) => (
                  <li key={summary.runId}>
                    <strong>{summary.scriptName}</strong> - {summary.status}
                    {summary.exitCode !== undefined ? ` (exit: ${summary.exitCode})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function isRiskyScript(scriptName: string): boolean {
  return RISK_PATTERNS.some((pattern) => pattern.test(scriptName));
}

function toFriendlyMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "An unexpected error happened. Please try again.";
  }

  const message = error.message;

  if (message.includes("INVALID_PATH") || message.includes("PATH_NOT_FOUND")) {
    return "That folder path is not valid. Select a folder that exists on disk.";
  }

  if (message.includes("NOT_A_GIT_REPOSITORY")) {
    return "This folder is not a Git repository. Pick the project root containing .git.";
  }

  if (message.includes("GIT_UNAVAILABLE")) {
    return "Git is not available on this machine. Install Git and reopen the app.";
  }

  if (message.includes("RUN_ALREADY_ACTIVE")) {
    return "This script is already running for this worktree.";
  }

  if (message.includes("SPAWN_FAILED") || message.includes("EXECUTION_FAILED")) {
    return "Could not start the script. Verify Node and your package manager are installed.";
  }

  return message;
}

export default MainPage;
