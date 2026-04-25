import { useEffect, useState } from "react";
import {
  APP_STATE_UPDATED_EVENT,
  RUN_CACHE_CLEARED_EVENT,
  RUN_LOG_CACHE_KEY,
  RUN_SUMMARY_CACHE_KEY,
} from "../lib/cacheKeys";
import { tauriClient } from "../lib/tauriClient";
import type { AppState } from "../models/domain";

type ManagerOption = "auto" | "pnpm" | "npm" | "yarn";

const EMPTY_STATE: AppState = {
  recentRepositories: [],
};

function SettingsPage() {
  const [appState, setAppState] = useState<AppState>(EMPTY_STATE);
  const [preferredManager, setPreferredManager] = useState<ManagerOption>("auto");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadState();
  }, []);

  async function loadState() {
    const state = await tauriClient.getAppState();
    setAppState(state);
    const manager = state.preferredPackageManager;
    if (manager === "pnpm" || manager === "npm" || manager === "yarn") {
      setPreferredManager(manager);
    } else {
      setPreferredManager("auto");
    }
  }

  async function saveManagerPreference() {
    const updated: AppState = {
      ...appState,
      preferredPackageManager: preferredManager === "auto" ? undefined : preferredManager,
    };
    const saved = await tauriClient.saveAppState(updated);
    setAppState(saved);
    setMessage("Saved package manager preference.");
    window.dispatchEvent(new Event(APP_STATE_UPDATED_EVENT));
  }

  async function clearRepositoryHistory() {
    const updated: AppState = {
      ...appState,
      lastRepositoryPath: undefined,
      recentRepositories: [],
    };
    const saved = await tauriClient.saveAppState(updated);
    setAppState(saved);
    setMessage("Cleared repository history.");
    window.dispatchEvent(new Event(APP_STATE_UPDATED_EVENT));
  }

  function clearRunCache() {
    localStorage.removeItem(RUN_LOG_CACHE_KEY);
    localStorage.removeItem(RUN_SUMMARY_CACHE_KEY);
    setMessage("Cleared run log cache.");
    window.dispatchEvent(new Event(RUN_CACHE_CLEARED_EVENT));
  }

  return (
    <section className="panel">
      <h2>Settings</h2>
      <p className="panel-copy">Manage defaults and clear local app data.</p>

      <div className="settings-group">
        <h3>Preferred Package Manager</h3>
        <p className="subtle">Use this value when scripts do not explicitly force a manager.</p>
        <select value={preferredManager} onChange={(event) => setPreferredManager(event.currentTarget.value as ManagerOption)}>
          <option value="auto">Auto detect from lockfiles</option>
          <option value="pnpm">pnpm</option>
          <option value="npm">npm</option>
          <option value="yarn">yarn</option>
        </select>
        <button type="button" onClick={() => void saveManagerPreference()}>
          Save Preference
        </button>
      </div>

      <div className="settings-group">
        <h3>Maintenance</h3>
        <p className="subtle">These actions only clear local app state on this machine.</p>
        <button type="button" className="secondary" onClick={() => void clearRepositoryHistory()}>
          Clear Repository History
        </button>
        <button type="button" className="secondary" onClick={clearRunCache}>
          Clear Run Log Cache
        </button>
      </div>

      {message && <p className="subtle">{message}</p>}
    </section>
  );
}

export default SettingsPage;
