/**
 * Shared GitHub Actions transport for modules 5 and 8 (schedule health, backup freshness).
 *
 * Default transport shells out to the `gh` CLI (`gh api <path>`), which is already authenticated in
 * this environment (confirmed live: `gh auth status` / `gh api repos/.../actions/workflows`
 * succeeded against the real repo during development of this module) -- so these two modules are
 * genuinely live, not fixture-only. A fetch-based fallback using GITHUB_TOKEN/GH_TOKEN is provided
 * for environments where the `gh` CLI isn't available but a token is, and every unit test injects a
 * fixture transport so none of this package's test suite depends on network or `gh` being present.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { fetchJson, type FetchLike } from "./http";

const execFile = promisify(execFileCb);

export interface GithubActionsTransport {
  /** GETs a GitHub REST API path (e.g. "repos/owner/repo/actions/workflows") and returns the parsed JSON body. */
  getJson<T = unknown>(path: string): Promise<T>;
}

/** Raised when the transport itself could not even attempt the call (CLI missing/unauthenticated, no token configured). */
export class GithubActionsBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubActionsBlockedError";
  }
}

/** Raised for any other transport failure (HTTP error, network error, malformed body). */
export class GithubActionsFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubActionsFailedError";
  }
}

const NOT_AUTHENTICATED_PATTERNS = [/not logged into any github hosts/i, /gh: command not found/i, /ENOENT/i, /could not find.*gh/i];

export function createGhCliTransport(opts: { timeoutMs?: number } = {}): GithubActionsTransport {
  return {
    async getJson<T>(path: string): Promise<T> {
      try {
        const { stdout } = await execFile("gh", ["api", path], { timeout: opts.timeoutMs ?? 15_000, maxBuffer: 20 * 1024 * 1024 });
        try {
          return JSON.parse(stdout) as T;
        } catch (err) {
          throw new GithubActionsFailedError(`gh api ${path} returned non-JSON output: ${String((err as Error)?.message ?? err)}`);
        }
      } catch (err) {
        if (err instanceof GithubActionsFailedError) throw err;
        const message = String((err as { stderr?: string; message?: string })?.stderr ?? (err as Error)?.message ?? err);
        if (NOT_AUTHENTICATED_PATTERNS.some((p) => p.test(message))) {
          throw new GithubActionsBlockedError(`gh CLI is not available/authenticated: ${message.trim()}`);
        }
        throw new GithubActionsFailedError(`gh api ${path} failed: ${message.trim()}`);
      }
    },
  };
}

export function createGithubTokenFetchTransport(opts: { token?: string; fetchImpl?: FetchLike; timeoutMs?: number; apiBase?: string } = {}): GithubActionsTransport {
  const apiBase = opts.apiBase ?? "https://api.github.com";
  return {
    async getJson<T>(path: string): Promise<T> {
      if (!opts.token) {
        throw new GithubActionsBlockedError("no GITHUB_TOKEN/GH_TOKEN configured and gh CLI transport unavailable");
      }
      const res = await fetchJson<T>({
        url: `${apiBase}/${path}`,
        init: { headers: { Authorization: `Bearer ${opts.token}`, Accept: "application/vnd.github+json" } },
        fetchImpl: opts.fetchImpl,
        timeoutMs: opts.timeoutMs,
      }).catch((err) => {
        throw new GithubActionsFailedError(String((err as Error)?.message ?? err));
      });
      if (!res.ok) throw new GithubActionsFailedError(`GitHub API returned HTTP ${res.status} for ${path}`);
      if (res.parseError || res.json === null) throw new GithubActionsFailedError(`GitHub API response for ${path} could not be parsed: ${res.parseError ?? "empty body"}`);
      return res.json;
    },
  };
}

export interface GhWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

export interface GhRun {
  id: number;
  status: string | null;
  conclusion: string | null;
  created_at: string;
  run_started_at?: string;
  head_branch?: string;
  name?: string;
}

export interface GithubActionsClient {
  listWorkflows(): Promise<GhWorkflow[]>;
  listRuns(workflowFileNameOrId: string | number, perPage?: number): Promise<GhRun[]>;
}

export function createGithubActionsClient(opts: { owner: string; repo: string; transport: GithubActionsTransport }): GithubActionsClient {
  const base = `repos/${opts.owner}/${opts.repo}`;
  return {
    async listWorkflows() {
      const body = await opts.transport.getJson<{ workflows?: GhWorkflow[] }>(`${base}/actions/workflows`);
      return body.workflows ?? [];
    },
    async listRuns(workflowFileNameOrId, perPage = 10) {
      const body = await opts.transport.getJson<{ workflow_runs?: GhRun[] }>(`${base}/actions/workflows/${workflowFileNameOrId}/runs?per_page=${perPage}`);
      return body.workflow_runs ?? [];
    },
  };
}
