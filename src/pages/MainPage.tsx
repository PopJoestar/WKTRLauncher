import { FormEvent, useEffect, useState } from "react";
import { tauriClient } from "../lib/tauriClient";
import type { AppState, RepositoryInfo, WorktreeInfo } from "../models/domain";

const EMPTY_STATE: AppState = {
  recentRepositories: [],
};

function MainPage() {
  const [path, setPath] = useState("");
  const [repository, setRepository] = useState<RepositoryInfo | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [appState, setAppState] = useState<AppState>(EMPTY_STATE);
  const [error, setError] = useState<string | null>(null);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isRefreshingWorktrees, setIsRefreshingWorktrees] = useState(false);

  async function refreshWorktrees(repositoryPath: string) {
    setWorktreeError(null);
    setIsRefreshingWorktrees(true);

    try {
      const items = await tauriClient.listWorktrees(repositoryPath);
      setWorktrees(items);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (refreshError) {
      setWorktrees([]);
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
  }, [repository]);

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
    } catch (validationError) {
      setRepository(null);
      setWorktrees([]);
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
              <li key={worktree.path} className="worktree-card">
                <p>
                  <strong>{worktree.isMain ? "Main" : "Additional"}</strong>
                </p>
                <p>
                  <span className="subtle">Branch:</span> {worktree.branch}
                </p>
                <p>
                  <span className="subtle">Path:</span> {worktree.path}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default MainPage;
