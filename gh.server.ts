import { ghRepoFlag, type GithubRepo } from "./github-remote.shared";
import { type GhStatus, type PullRequest } from "./pr.shared";
import { runCommand } from "./run-command.server";
import { loadStoredGhPath } from "./settings.server";
import { expandHome } from "./command-path.server";

type GhUnavailable = Extract<GhStatus, { kind: "unavailable" }>;

const GH_JSON_FIELDS = [
  "number",
  "title",
  "url",
  "state",
  "author",
  "isDraft",
  "updatedAt",
  "reviewDecision",
  "headRefName",
] as const;

const MISSING_GH_MESSAGE =
  "Install the GitHub CLI (`gh`). Paseo looks on PATH plus Homebrew (`/opt/homebrew/bin`) and `~/.local/bin`.";
const UNAUTHENTICATED_GH_MESSAGE = "Run `gh auth login` on this machine, then reload the plugin.";

interface GhPullRequestJson {
  number: unknown;
  title: unknown;
  url: unknown;
  state: unknown;
  author: unknown;
  isDraft: unknown;
  updatedAt: unknown;
  reviewDecision: unknown;
  headRefName: unknown;
}

export async function getGhStatus(): Promise<GhStatus> {
  const configured = (await loadStoredGhPath()).trim();
  const result = await runCommand({ command: "gh", args: ["auth", "status"] });
  if (result.failure === "missing") {
    return {
      kind: "unavailable",
      reason: "missing",
      message: configured
        ? `GitHub CLI is not executable at ${expandHome(configured)}.`
        : MISSING_GH_MESSAGE,
    };
  }
  if (result.failure === "timeout") {
    return { kind: "unavailable", reason: "unauthenticated", message: UNAUTHENTICATED_GH_MESSAGE };
  }
  if (result.code !== 0) {
    return { kind: "unavailable", reason: "unauthenticated", message: UNAUTHENTICATED_GH_MESSAGE };
  }
  return { kind: "ok" };
}

export async function listRepoPullRequests(input: {
  projectId: string;
  repo: GithubRepo;
  state: "open" | "closed" | "merged" | "all";
  author: "anyone" | "me";
  search?: string;
  limit: number;
}): Promise<
  | { kind: "ok"; pullRequests: PullRequest[] }
  | { kind: "error"; message: string }
  | GhUnavailable
> {
  const status = await getGhStatus();
  if (status.kind !== "ok") return status;

  const args = [
    "pr",
    "list",
    "--repo",
    ghRepoFlag(input.repo),
    "--state",
    input.state,
    "--limit",
    String(input.limit),
    "--json",
    GH_JSON_FIELDS.join(","),
  ];
  if (input.author === "me") {
    args.push("--author", "@me");
  }
  if (input.search && input.search.trim().length > 0) {
    args.push("--search", input.search.trim());
  }

  const result = await runCommand({ command: "gh", args });
  if (result.failure === "missing") {
    return { kind: "unavailable", reason: "missing", message: MISSING_GH_MESSAGE };
  }
  if (result.code !== 0) {
    return { kind: "error", message: ghErrorMessage(result.stderr, result.stdout) };
  }

  const parsed = parseJson(result.stdout);
  if (!Array.isArray(parsed)) {
    return { kind: "error", message: "GitHub CLI returned an unexpected PR list." };
  }

  const pullRequests: PullRequest[] = [];
  for (const item of parsed) {
    const pullRequest = mapPullRequest({ projectId: input.projectId, repo: input.repo, value: item });
    if (pullRequest) pullRequests.push(pullRequest);
  }
  return { kind: "ok", pullRequests };
}

export async function viewRepoPullRequest(input: {
  projectId: string;
  repo: GithubRepo;
  number: number;
}): Promise<
  | { kind: "ok"; pullRequest: PullRequest }
  | { kind: "not_found"; message: string }
  | { kind: "error"; message: string }
  | GhUnavailable
> {
  const status = await getGhStatus();
  if (status.kind !== "ok") return status;

  const result = await runCommand({
    command: "gh",
    args: [
      "pr",
      "view",
      String(input.number),
      "--repo",
      ghRepoFlag(input.repo),
      "--json",
      GH_JSON_FIELDS.join(","),
    ],
  });
  if (result.failure === "missing") {
    return { kind: "unavailable", reason: "missing", message: MISSING_GH_MESSAGE };
  }
  if (result.code !== 0) {
    const combined = `${result.stderr}\n${result.stdout}`.toLowerCase();
    if (combined.includes("could not find") || combined.includes("no pull requests found") || combined.includes("not found")) {
      return {
        kind: "not_found",
        message: `No pull request #${input.number} in ${ghRepoFlag(input.repo)}.`,
      };
    }
    return { kind: "error", message: ghErrorMessage(result.stderr, result.stdout) };
  }

  const pullRequest = mapPullRequest({
    projectId: input.projectId,
    repo: input.repo,
    value: parseJson(result.stdout),
  });
  if (!pullRequest) {
    return { kind: "error", message: "GitHub CLI returned an unexpected pull request." };
  }
  return { kind: "ok", pullRequest };
}

export async function readOriginRemoteUrl(rootPath: string): Promise<string | null> {
  const origin = await runCommand({
    command: "git",
    args: ["-C", rootPath, "remote", "get-url", "origin"],
  });
  if (origin.code === 0) {
    const url = origin.stdout.trim();
    return url.length > 0 ? url : null;
  }

  const remotes = await runCommand({
    command: "git",
    args: ["-C", rootPath, "remote", "get-url", "--all", "origin"],
  });
  if (remotes.code !== 0) return null;
  const first = remotes.stdout.split("\n").map((line) => line.trim()).find((line) => line.length > 0);
  return first ?? null;
}

function mapPullRequest(input: {
  projectId: string;
  repo: GithubRepo;
  value: unknown;
}): PullRequest | null {
  if (!input.value || typeof input.value !== "object") return null;
  const row = input.value as GhPullRequestJson;
  if (typeof row.number !== "number" || !Number.isInteger(row.number) || row.number <= 0) return null;
  if (typeof row.title !== "string" || typeof row.url !== "string" || typeof row.state !== "string") {
    return null;
  }
  if (typeof row.updatedAt !== "string") return null;

  return {
    projectId: input.projectId,
    host: input.repo.host,
    owner: input.repo.owner,
    repo: input.repo.repo,
    number: row.number,
    title: row.title,
    url: row.url,
    state: row.state.toLowerCase(),
    author: readAuthor(row.author),
    isDraft: row.isDraft === true,
    updatedAt: row.updatedAt,
    reviewDecision: typeof row.reviewDecision === "string" ? row.reviewDecision : null,
    headRefName: typeof row.headRefName === "string" ? row.headRefName : null,
  };
}

function readAuthor(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "login" in value) {
    const login = value.login;
    if (typeof login === "string" && login.length > 0) return login;
  }
  return "unknown";
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function ghErrorMessage(stderr: string, stdout: string): string {
  const text = (stderr.trim() || stdout.trim()).replace(/\s+/gu, " ");
  return text.length > 0 ? text : "GitHub CLI failed.";
}
