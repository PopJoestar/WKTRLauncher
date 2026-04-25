import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MainPage from "./MainPage";
import { tauriClient } from "../lib/tauriClient";
import type { AppState, RepositoryInfo, ScriptInfo, ScriptRunStatus, WorktreeInfo } from "../models/domain";
import { vi } from "vitest";

vi.mock("../lib/tauriClient", () => ({
  tauriClient: {
    selectRepository: vi.fn(),
    validateRepository: vi.fn(),
    listWorktrees: vi.fn(),
    listScripts: vi.fn(),
    runScript: vi.fn(),
    getAppState: vi.fn(),
    saveAppState: vi.fn(),
    onScriptRunOutput: vi.fn(),
  },
}));

const mockedClient = vi.mocked(tauriClient);

const emptyState: AppState = { recentRepositories: [] };
const repo: RepositoryInfo = {
  path: "/tmp/repo",
  name: "repo",
  isValid: true,
};
const worktrees: WorktreeInfo[] = [
  { path: "/tmp/repo", branch: "main", isMain: true },
  { path: "/tmp/repo-feature", branch: "feature/test", isMain: false },
];
const scripts: ScriptInfo[] = [
  { name: "dev", command: "vite", packageManager: "pnpm" },
  { name: "clean", command: "rimraf dist", packageManager: "pnpm" },
];

function mockCommon() {
  mockedClient.getAppState.mockResolvedValue(emptyState);
  mockedClient.saveAppState.mockResolvedValue(emptyState);
  mockedClient.onScriptRunOutput.mockResolvedValue(() => undefined);
  mockedClient.listWorktrees.mockResolvedValue(worktrees);
  mockedClient.listScripts.mockImplementation(async (path: string) => {
    if (path === "/tmp/repo" || path === "/tmp/repo-feature") {
      return scripts;
    }
    return [];
  });
}

describe("MainPage integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockCommon();
  });

  it("covers repository validation, worktree selection, script discovery, and script run path", async () => {
    const runResult: ScriptRunStatus = {
      runId: "run-1",
      status: "completed",
      startedAt: "1",
      finishedAt: "2",
      exitCode: 0,
    };

    mockedClient.validateRepository.mockResolvedValue(repo);
    mockedClient.runScript.mockResolvedValue(runResult);

    render(<MainPage />);

    await userEvent.type(screen.getByLabelText(/Repository path/i), repo.path);
    await userEvent.click(screen.getByRole("button", { name: /Validate Repository/i }));

    await waitFor(() => expect(screen.getByText(/Repository Ready/i)).toBeInTheDocument());
    await waitFor(() => expect(mockedClient.listWorktrees).toHaveBeenCalledWith(repo.path));

    await userEvent.click(screen.getByRole("button", { name: /Additional/i }));
    await waitFor(() => expect(mockedClient.listScripts).toHaveBeenCalledWith("/tmp/repo-feature"));

    const runButtons = screen.getAllByRole("button", { name: "Run Script" });
    await userEvent.click(runButtons[0]);

    await waitFor(() =>
      expect(mockedClient.runScript).toHaveBeenCalledWith(
        expect.objectContaining({
          worktreePath: "/tmp/repo-feature",
          scriptName: "dev",
        }),
      ),
    );

    expect(screen.getByText(/Run status for "dev": completed/i)).toBeInTheDocument();
  });

  it("shows friendly message for invalid repository", async () => {
    mockedClient.validateRepository.mockRejectedValue(new Error("NOT_A_GIT_REPOSITORY: missing .git"));

    render(<MainPage />);

    await userEvent.type(screen.getByLabelText(/Repository path/i), "/tmp/not-repo");
    await userEvent.click(screen.getByRole("button", { name: /Validate Repository/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/This folder is not a Git repository. Pick the project root containing .git./i),
      ).toBeInTheDocument(),
    );
  });

  it("shows friendly message when script launch fails from missing runtime", async () => {
    mockedClient.validateRepository.mockResolvedValue(repo);
    mockedClient.runScript.mockRejectedValue(new Error("SPAWN_FAILED: command not found"));

    render(<MainPage />);

    await userEvent.type(screen.getByLabelText(/Repository path/i), repo.path);
    await userEvent.click(screen.getByRole("button", { name: /Validate Repository/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /^Scripts$/i })).toBeInTheDocument());

    const runButtons = screen.getAllByRole("button", { name: "Run Script" });
    await userEvent.click(runButtons[0]);

    await waitFor(() =>
      expect(
        screen.getByText(/Could not start the script. Verify Node and your package manager are installed./i),
      ).toBeInTheDocument(),
    );
  });

  it("shows failed execution summary with non-zero exit code", async () => {
    mockedClient.validateRepository.mockResolvedValue(repo);
    mockedClient.runScript.mockResolvedValue({
      runId: "run-2",
      status: "failed",
      startedAt: "1",
      finishedAt: "2",
      exitCode: 1,
    });

    render(<MainPage />);

    await userEvent.type(screen.getByLabelText(/Repository path/i), repo.path);
    await userEvent.click(screen.getByRole("button", { name: /Validate Repository/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /^Scripts$/i })).toBeInTheDocument());

    const runButtons = screen.getAllByRole("button", { name: "Run Script" });
    await userEvent.click(runButtons[0]);

    await waitFor(() => expect(screen.getByText(/Run status for "dev": failed/i)).toBeInTheDocument());
    expect(screen.getByText(/failed \(exit: 1\)/i)).toBeInTheDocument();
  });

  it("requires confirmation for risky scripts before running", async () => {
    mockedClient.validateRepository.mockResolvedValue(repo);
    mockedClient.runScript.mockResolvedValue({
      runId: "run-3",
      status: "completed",
      startedAt: "1",
      finishedAt: "2",
      exitCode: 0,
    });

    render(<MainPage />);

    await userEvent.type(screen.getByLabelText(/Repository path/i), repo.path);
    await userEvent.click(screen.getByRole("button", { name: /Validate Repository/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /^Scripts$/i })).toBeInTheDocument());

    const runButtons = screen.getAllByRole("button", { name: "Run Script" });
    await userEvent.click(runButtons[1]);

    await waitFor(() => expect(screen.getByText(/Confirm Risky Script/i)).toBeInTheDocument());
    expect(mockedClient.runScript).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /Confirm Run/i }));
    await waitFor(() => expect(mockedClient.runScript).toHaveBeenCalledTimes(1));
  });
});
