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
  "assignees",
  "isDraft",
  "updatedAt",
  "reviewDecision",
  "reviewRequests",
  "headRefName",
] as const;

const MISSING_GH_MESSAGE =
  "Install the GitHub CLI (`gh`). Paseo looks on PATH plus Homebrew (`/opt/homebrew/bin`) and `~/.local/bin`.";
const UNAUTHENTICATED_GH_MESSAGE = "Run `gh auth login` on this machine, then reload the plugin.";

const WAITING_SEARCHES = ["review-requested:@me", "author:@me review:changes_requested"] as const;

interface GhPullRequestJson {
  number: unknown;
  title: unknown;
  url: unknown;
  state: unknown;
  author: unknown;
  assignees: unknown;
  isDraft: unknown;
  updatedAt: unknown;
  reviewDecision: unknown;
  reviewRequests: unknown;
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
  assignee: "anyone" | "me";
  waiting: "anyone" | "me";
  search?: string;
  limit: number;
}): Promise<{ kind: "ok"; pullRequests: PullRequest[] } | { kind: "error"; message: string } | GhUnavailable> {
  const status = await getGhStatus();
  if (status.kind !== "ok") return status;

  const searches = listSearchQueries(input);
  const pages: PullRequest[][] = [];
  for (const search of searches) {
    const result = await fetchRepoPullRequestPage({
      projectId: input.projectId,
      repo: input.repo,
      state: input.state,
      author: input.waiting === "me" ? "anyone" : input.author,
      assignee: input.waiting === "me" ? "anyone" : input.assignee,
      search,
      limit: input.limit,
    });
    if (result.kind !== "ok") return result;
    pages.push(result.pullRequests);
  }
  return { kind: "ok", pullRequests: mergePullRequests(pages, input.limit) };
}

export async function countRepoWaitingPullRequests(input: {
  repo: GithubRepo;
}): Promise<{ kind: "ok"; keys: string[] } | { kind: "error"; message: string } | GhUnavailable> {
  const listed = await listRepoPullRequests({
    projectId: "attention",
    repo: input.repo,
    state: "open",
    author: "anyone",
    assignee: "anyone",
    waiting: "me",
    limit: 100,
  });
  if (listed.kind !== "ok") return listed;
  return {
    kind: "ok",
    keys: listed.pullRequests.map((pullRequest) => `${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`),
  };
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
    viewer: await viewerLogin(),
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

async function fetchRepoPullRequestPage(input: {
  projectId: string;
  repo: GithubRepo;
  state: "open" | "closed" | "merged" | "all";
  author: "anyone" | "me";
  assignee: "anyone" | "me";
  search?: string;
  limit: number;
}): Promise<{ kind: "ok"; pullRequests: PullRequest[] } | { kind: "error"; message: string } | GhUnavailable> {
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
  if (input.author === "me") args.push("--author", "@me");
  if (input.assignee === "me") args.push("--assignee", "@me");
  if (input.search && input.search.trim().length > 0) args.push("--search", input.search.trim());

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

  const viewer = await viewerLogin();
  const pullRequests: PullRequest[] = [];
  for (const item of parsed) {
    const pullRequest = mapPullRequest({
      projectId: input.projectId,
      repo: input.repo,
      value: item,
      viewer,
    });
    if (pullRequest) pullRequests.push(pullRequest);
  }
  return { kind: "ok", pullRequests };
}

function listSearchQueries(input: {
  waiting: "anyone" | "me";
  author: "anyone" | "me";
  assignee: "anyone" | "me";
  search?: string;
}): Array<string | undefined> {
  const userSearch = input.search?.trim() ?? "";
  if (input.waiting !== "me") {
    return [userSearch.length > 0 ? userSearch : undefined];
  }

  return WAITING_SEARCHES.map((query) => {
    const parts: string[] = [query];
    if (input.author === "me" && !query.includes("author:@me")) parts.push("author:@me");
    if (input.assignee === "me") parts.push("assignee:@me");
    if (userSearch.length > 0) parts.push(userSearch);
    return parts.join(" ");
  });
}

function mergePullRequests(pages: PullRequest[][], limit: number): PullRequest[] {
  const seen = new Set<string>();
  const merged: PullRequest[] = [];
  for (const page of pages) {
    for (const pullRequest of page) {
      const key = `${pullRequest.projectId}:${pullRequest.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(pullRequest);
    }
  }
  merged.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return merged.slice(0, limit);
}

function mapPullRequest(input: {
  projectId: string;
  repo: GithubRepo;
  value: unknown;
  viewer: string | null;
}): PullRequest | null {
  if (!input.value || typeof input.value !== "object") return null;
  const row = toPullRequestJson(input.value);
  if (!row) return null;
  if (typeof row.number !== "number" || !Number.isInteger(row.number) || row.number <= 0) return null;
  if (typeof row.title !== "string" || typeof row.url !== "string" || typeof row.state !== "string") {
    return null;
  }
  if (typeof row.updatedAt !== "string") return null;

  const author = readAuthor(row.author);
  const assignees = readLogins(row.assignees);
  const reviewDecision = typeof row.reviewDecision === "string" ? row.reviewDecision : null;

  return {
    projectId: input.projectId,
    host: input.repo.host,
    owner: input.repo.owner,
    repo: input.repo.repo,
    number: row.number,
    title: row.title,
    url: row.url,
    state: row.state.toLowerCase(),
    author,
    assignees,
    isDraft: row.isDraft === true,
    updatedAt: row.updatedAt,
    reviewDecision,
    headRefName: typeof row.headRefName === "string" ? row.headRefName : null,
    waitingOnViewer: isWaitingOnViewer({
      viewer: input.viewer,
      author,
      reviewDecision,
      reviewRequests: readLogins(row.reviewRequests),
    }),
  };
}

function toPullRequestJson(value: object): GhPullRequestJson | null {
  if (!("number" in value) || !("title" in value) || !("url" in value) || !("state" in value) || !("updatedAt" in value)) {
    return null;
  }
  return {
    number: Reflect.get(value, "number"),
    title: Reflect.get(value, "title"),
    url: Reflect.get(value, "url"),
    state: Reflect.get(value, "state"),
    author: Reflect.get(value, "author"),
    assignees: Reflect.get(value, "assignees"),
    isDraft: Reflect.get(value, "isDraft"),
    updatedAt: Reflect.get(value, "updatedAt"),
    reviewDecision: Reflect.get(value, "reviewDecision"),
    reviewRequests: Reflect.get(value, "reviewRequests"),
    headRefName: Reflect.get(value, "headRefName"),
  };
}

function isWaitingOnViewer(input: {
  viewer: string | null;
  author: string;
  reviewDecision: string | null;
  reviewRequests: string[];
}): boolean {
  if (!input.viewer) return false;
  const viewer = input.viewer.toLowerCase();
  if (input.reviewRequests.some((login) => login.toLowerCase() === viewer)) return true;
  return input.author.toLowerCase() === viewer && input.reviewDecision === "CHANGES_REQUESTED";
}

let cachedViewerLogin: string | null | undefined;

async function viewerLogin(): Promise<string | null> {
  if (cachedViewerLogin !== undefined) return cachedViewerLogin;
  const result = await runCommand({ command: "gh", args: ["api", "user", "--jq", ".login"] });
  if (result.code !== 0) {
    cachedViewerLogin = null;
    return null;
  }
  const login = result.stdout.trim();
  cachedViewerLogin = login.length > 0 ? login : null;
  return cachedViewerLogin;
}

function readLogins(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const logins: string[] = [];
  for (const item of value) {
    const login = readAuthor(item);
    if (login !== "unknown") logins.push(login);
  }
  return logins;
}

function readAuthor(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "login" in value) {
    const login = Reflect.get(value, "login");
    if (typeof login === "string" && login.length > 0) return login;
  }
  return "unknown";
}

function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return null;
  }
}

function ghErrorMessage(stderr: string, stdout: string): string {
  const text = (stderr.trim() || stdout.trim()).replace(/\s+/gu, " ");
  return text.length > 0 ? text : "GitHub CLI failed.";
}
