import { FormEvent, useEffect, useMemo, useState } from "react";
import { tauriClient } from "../lib/tauriClient";
import type { AppState, RepositoryInfo, ScriptInfo, ScriptRunEvent, ScriptRunStatus, WorktreeInfo } from "../models/domain";

const EMPTY_STATE: AppState = {
  recentRepositories: [],
};

type RunSummary = {
  runId: string;
  scriptName: string;
  worktreePath: string;
  status: string;
  exitCode?: number;
  finishedAt?: string;
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
    let active = true;
    let cleanup: (() => void) | null = null;

    void tauriClient.onScriptRunOutput((event: ScriptRunEvent) => {
      if (!active) return;
      const line = `[${event.stream}] ${event.line}`;
      setRunLogs((previous) => [...previous.slice(-249), line]);
    }).then((unlisten) => {
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
      setScriptError(loadError instanceof Error ? loadError.message : "Unable to load scripts.");
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
      setWorktreeError(refreshError instanceof Error ? refreshError.message : "Unable to load worktrees.");
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
      setError(validationError instanceof Error ? validationError.message : "Unknown validation error");
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

  async function handleLaunchScript(script: ScriptInfo) {
    if (!selectedWorktree) return;

    setLaunchMessage(null);
    setRunLogs([]);

    const runKey = `${selectedWorktree.path}::${script.name}`;
    setRunningRunKey(runKey);

    try {
      const result: ScriptRunStatus = await tauriClient.runScript({
        worktreePath: selectedWorktree.path,
        scriptName: script.name,
        packageManager: script.packageManager,
      });

      setLaunchMessage(`Run status for \"${script.name}\": ${result.status}`);
      const summary: RunSummary = {
        runId: result.runId,
        scriptName: script.name,
        worktreePath: selectedWorktree.path,
        status: result.status,
        exitCode: result.exitCode,
        finishedAt: result.finishedAt,
      };
      setRunSummaries((previous) => [summary, ...previous].slice(0, 12));
    } catch (runError) {
      setLaunchMessage(runError instanceof Error ? runError.message : "Script launch failed.");
    } finally {
      setRunningRunKey(null);
    }
  }

  return (
    <section className="panel">
      <h2>Repository Setup</h2>
      <p className="panel-copy">
        Choose a repository folder, validate it, and resume quickly from recent selections.
      </p>

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
          {isChecking ? "Validating..." : "Validate repository"}
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
          <h3>Repository Detected</h3>
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
          <h3>Validation Failed</h3>
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
              <h3>Worktree Refresh Failed</h3>
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
            <h3>Scripts for Selected Worktree</h3>
            <span className="subtle">{selectedWorktree.path}</span>
          </div>

          {isLoadingScripts && <p className="subtle">Loading scripts...</p>}

          {!isLoadingScripts && scriptError && (
            <div className="status-card error" role="alert">
              <h3>Script Discovery Failed</h3>
              <p>{scriptError}</p>
            </div>
          )}

          {!isLoadingScripts && !scriptError && scripts.length === 0 && (
            <p className="subtle">This worktree has no package scripts in package.json.</p>
          )}

          {!isLoadingScripts && !scriptError && scripts.length > 0 && (
            <ul className="script-list">
              {scripts.map((script) => (
                <li key={script.name} className="script-card">
                  <div>
                    <p>
                      <strong>{script.name}</strong>
                    </p>
                    <p className="subtle">{script.command}</p>
                    <p className="subtle">Manager: {script.packageManager ?? "npm"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleLaunchScript(script)}
                    disabled={runningRunKey === `${selectedWorktree.path}::${script.name}`}
                  >
                    {runningRunKey === `${selectedWorktree.path}::${script.name}` ? "Running..." : "Run Script"}
                  </button>
                </li>
              ))}
            </ul>
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

export default MainPage;
