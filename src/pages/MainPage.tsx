import { FormEvent, useState } from "react";
import { tauriClient } from "../lib/tauriClient";
import type { RepositoryInfo } from "../models/domain";

function MainPage() {
  const [path, setPath] = useState("");
  const [repository, setRepository] = useState<RepositoryInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  async function handleValidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRepository(null);
    setIsChecking(true);

    try {
      const result = await tauriClient.validateRepository(path.trim());
      setRepository(result);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Unknown validation error");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <section className="panel">
      <h2>Repository Setup</h2>
      <p className="panel-copy">
        Enter a repository path to verify command wiring. Worktree and script execution screens will plug into
        this contract in issues #3 to #5.
      </p>

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
    </section>
  );
}

export default MainPage;
