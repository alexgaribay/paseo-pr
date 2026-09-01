import { ghRepoFlag, type GithubRepo } from "./github-remote.shared";
import { type GhStatus, type PullRequest, type PullRequestComment, type PullRequestDetail } from "./pr.shared";
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

const GH_DETAIL_JSON_FIELDS = [
  ...GH_JSON_FIELDS,
  "body",
  "comments",
  "reviews",
  "labels",
  "additions",
  "deletions",
  "changedFiles",
  "createdAt",
  "baseRefName",
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
  | { kind: "ok"; pullRequest: PullRequestDetail }
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
      GH_DETAIL_JSON_FIELDS.join(","),
    ],
    timeoutMs: 45_000,
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

  const parsed = parseJson(result.stdout);
  const viewer = await viewerLogin();
  const lineComments = await listPullLineComments({ repo: input.repo, number: input.number });
  const pullRequest = mapPullRequestDetail({
    projectId: input.projectId,
    repo: input.repo,
    value: parsed,
    viewer,
    lineComments,
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

function mapPullRequestDetail(input: {
  projectId: string;
  repo: GithubRepo;
  value: unknown;
  viewer: string | null;
  lineComments: PullRequestComment[];
}): PullRequestDetail | null {
  const pullRequest = mapPullRequest(input);
  if (!pullRequest || !input.value || typeof input.value !== "object") return null;

  const bodyValue = Reflect.get(input.value, "body");
  const createdAtValue = Reflect.get(input.value, "createdAt");
  const comments = [
    ...readIssueComments(Reflect.get(input.value, "comments")),
    ...readReviews(Reflect.get(input.value, "reviews")),
    ...input.lineComments,
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return {
    ...pullRequest,
    body: typeof bodyValue === "string" ? bodyValue : "",
    createdAt: typeof createdAtValue === "string" ? createdAtValue : pullRequest.updatedAt,
    labels: readNames(Reflect.get(input.value, "labels")),
    additions: readNonNegativeInt(Reflect.get(input.value, "additions")),
    deletions: readNonNegativeInt(Reflect.get(input.value, "deletions")),
    changedFiles: readNonNegativeInt(Reflect.get(input.value, "changedFiles")),
    baseRefName: readOptionalString(Reflect.get(input.value, "baseRefName")),
    comments,
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

async function listPullLineComments(input: {
  repo: GithubRepo;
  number: number;
}): Promise<PullRequestComment[]> {
  const args = ["api", `repos/${input.repo.owner}/${input.repo.repo}/pulls/${input.number}/comments?per_page=100`];
  if (input.repo.host !== "github.com") {
    args.splice(1, 0, "--hostname", input.repo.host);
  }
  const result = await runCommand({ command: "gh", args, timeoutMs: 30_000 });
  if (result.code !== 0) return [];
  const parsed = parseJson(result.stdout);
  if (!Array.isArray(parsed)) return [];
  const comments: PullRequestComment[] = [];
  for (const item of parsed) {
    const comment = mapLineComment(item);
    if (comment) comments.push(comment);
  }
  return comments;
}

function readIssueComments(value: unknown): PullRequestComment[] {
  if (!Array.isArray(value)) return [];
  const comments: PullRequestComment[] = [];
  for (const item of value) {
    const comment = mapIssueComment(item);
    if (comment) comments.push(comment);
  }
  return comments;
}

function readReviews(value: unknown): PullRequestComment[] {
  if (!Array.isArray(value)) return [];
  const comments: PullRequestComment[] = [];
  for (const item of value) {
    const comment = mapReview(item);
    if (comment) comments.push(comment);
  }
  return comments;
}

function mapIssueComment(value: unknown): PullRequestComment | null {
  if (!value || typeof value !== "object") return null;
  if (Reflect.get(value, "isMinimized") === true) return null;
  const createdAt = readOptionalString(Reflect.get(value, "createdAt"));
  if (!createdAt) return null;
  const author = readAuthor(Reflect.get(value, "author"));
  const bodyValue = Reflect.get(value, "body");
  const body = typeof bodyValue === "string" ? bodyValue : "";
  return {
    id: readId(Reflect.get(value, "id")) ?? `comment:${createdAt}:${author}`,
    author,
    body,
    createdAt,
    url: readOptionalString(Reflect.get(value, "url")),
    kind: "comment",
    reviewState: null,
    path: null,
  };
}

function mapReview(value: unknown): PullRequestComment | null {
  if (!value || typeof value !== "object") return null;
  const createdAt =
    readOptionalString(Reflect.get(value, "submittedAt")) ?? readOptionalString(Reflect.get(value, "createdAt"));
  if (!createdAt) return null;
  const bodyValue = Reflect.get(value, "body");
  const body = typeof bodyValue === "string" ? bodyValue : "";
  const reviewState = readOptionalString(Reflect.get(value, "state"));
  if (body.trim().length === 0 && reviewState !== "APPROVED" && reviewState !== "CHANGES_REQUESTED") {
    return null;
  }
  const author = readAuthor(Reflect.get(value, "author"));
  return {
    id: readId(Reflect.get(value, "id")) ?? `review:${createdAt}:${author}`,
    author,
    body,
    createdAt,
    url: readOptionalString(Reflect.get(value, "url")),
    kind: "review",
    reviewState,
    path: null,
  };
}

function mapLineComment(value: unknown): PullRequestComment | null {
  if (!value || typeof value !== "object") return null;
  const createdAt = readOptionalString(Reflect.get(value, "created_at"));
  if (!createdAt) return null;
  const bodyValue = Reflect.get(value, "body");
  const body = typeof bodyValue === "string" ? bodyValue : "";
  const author = readAuthor(Reflect.get(value, "user"));
  return {
    id: readId(Reflect.get(value, "id")) ?? `line:${createdAt}:${author}`,
    author,
    body,
    createdAt,
    url: readOptionalString(Reflect.get(value, "html_url")),
    kind: "line",
    reviewState: null,
    path: readOptionalString(Reflect.get(value, "path")),
  };
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

function readNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length > 0) {
      names.push(item);
      continue;
    }
    if (item && typeof item === "object" && "name" in item) {
      const name = Reflect.get(item, "name");
      if (typeof name === "string" && name.length > 0) names.push(name);
    }
  }
  return names;
}

function readAuthor(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "login" in value) {
    const login = Reflect.get(value, "login");
    if (typeof login === "string" && login.length > 0) return login;
  }
  return "unknown";
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function readId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return null;
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
