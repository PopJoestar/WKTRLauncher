import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import MainPage from "./pages/MainPage";
import SettingsPage from "./pages/SettingsPage";
import "./App.css";

function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">WKTRLauncher</p>
          <h1>Worktree Script Launcher</h1>
        </div>
        <nav className="nav-tabs" aria-label="Main navigation">
          <NavLink to="/main" className={({ isActive }) => (isActive ? "tab active" : "tab")}>
            Main
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? "tab active" : "tab")}>
            Settings
          </NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Navigate replace to="/main" />} />
        <Route path="/main" element={<MainPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </main>
  );
}

export default App;
