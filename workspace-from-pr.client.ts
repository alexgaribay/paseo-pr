import { usePaseo } from "@getpaseo/plugin";
import type { PullRequest } from "./pr.shared";

type Paseo = ReturnType<typeof usePaseo>;
type Workspace = Awaited<ReturnType<Paseo["workspaces"]["list"]>>["entries"][number];

export function pullRequestWorkspaceKey(pullRequest: Pick<PullRequest, "projectId" | "number">): string {
  return `${pullRequest.projectId}:${pullRequest.number}`;
}

export async function createPullRequestWorkspace(input: {
  paseo: Paseo;
  rootPath: string;
  number: number;
  title: string;
  onCreated?: (workspaceId: string) => Promise<void>;
}): Promise<{ workspaceId: string; labelsError: string | null }> {
  const workspace = await input.paseo.workspaces.create({
    title: `#${input.number} ${input.title}`,
    source: {
      kind: "worktree",
      cwd: input.rootPath,
      action: "checkout",
      checkoutSource: {
        kind: "change_request",
        forge: "github",
        number: input.number,
      },
    },
  });
  return await finishCreatedWorkspace(workspace.id, input.onCreated);
}

export async function createRepoWorkspace(input: {
  paseo: Paseo;
  rootPath: string;
  title: string;
  onCreated?: (workspaceId: string) => Promise<void>;
}): Promise<{ workspaceId: string; labelsError: string | null }> {
  const workspace = await input.paseo.workspaces.create({
    title: input.title,
    source: {
      kind: "worktree",
      cwd: input.rootPath,
      action: "branch-off",
      baseBranch: "origin/HEAD",
    },
  });
  return await finishCreatedWorkspace(workspace.id, input.onCreated);
}

async function finishCreatedWorkspace(
  workspaceId: string,
  onCreated?: (workspaceId: string) => Promise<void>,
): Promise<{ workspaceId: string; labelsError: string | null }> {
  if (!onCreated) return { workspaceId, labelsError: null };
  try {
    await onCreated(workspaceId);
    return { workspaceId, labelsError: null };
  } catch (error) {
    return {
      workspaceId,
      labelsError:
        error instanceof Error ? error.message : "Could not apply workspace labels.",
    };
  }
}

export async function listActiveWorkspaces(paseo: Paseo): Promise<Workspace[]> {
  const entries: Workspace[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await paseo.workspaces.list({
      page: cursor ? { limit: 100, cursor } : { limit: 100 },
    });
    for (const workspace of result.entries) {
      if (isActiveWorkspace(workspace)) entries.push(workspace);
    }
    if (!result.pageInfo.hasMore || result.pageInfo.nextCursor == null) break;
    cursor = result.pageInfo.nextCursor;
  }
  return entries;
}

export function indexWorkspacesByPullRequest(
  workspaces: readonly Workspace[],
  pullRequests: readonly PullRequest[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const pullRequest of pullRequests) {
    const workspace = findWorkspaceForPullRequest(workspaces, pullRequest);
    if (workspace) index.set(pullRequestWorkspaceKey(pullRequest), workspace.id);
  }
  return index;
}

export function findWorkspaceForPullRequest(
  workspaces: readonly Workspace[],
  pullRequest: PullRequest,
): Workspace | null {
  let best: Workspace | null = null;
  let bestScore = 0;
  for (const workspace of workspaces) {
    const score = workspaceMatchScore(workspace, pullRequest);
    if (score <= 0) continue;
    if (score > bestScore || (score === bestScore && isNewerWorkspace(workspace, best))) {
      best = workspace;
      bestScore = score;
    }
  }
  return best;
}

function isActiveWorkspace(workspace: Workspace): boolean {
  return workspace.archivingAt == null;
}

function workspaceMatchScore(workspace: Workspace, pullRequest: PullRequest): number {
  if (!sameProject(workspace, pullRequest)) return 0;
  const githubNumber = githubPullRequestNumber(workspace);
  if (githubNumber !== null) return githubNumber === pullRequest.number ? 3 : 0;
  if (titleLooksLikePullRequest(workspace.title ?? workspace.name, pullRequest.number)) return 2;
  if (branchLooksLikePullRequest(workspace, pullRequest)) return 1;
  return 0;
}

function sameProject(workspace: Workspace, pullRequest: PullRequest): boolean {
  if (workspace.projectId === pullRequest.projectId) return true;
  const runtime = workspace.githubRuntime?.pullRequest;
  const owner = runtime?.repoOwner?.trim().toLowerCase();
  const repo = runtime?.repoName?.trim().toLowerCase();
  if (!owner || !repo) return false;
  return owner === pullRequest.owner.toLowerCase() && repo === pullRequest.repo.toLowerCase();
}

function githubPullRequestNumber(workspace: Workspace): number | null {
  const number = workspace.githubRuntime?.pullRequest?.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) return null;
  return number;
}

function titleLooksLikePullRequest(title: string, number: number): boolean {
  const prefix = `#${number}`;
  return title === prefix || title.startsWith(`${prefix} `);
}

function branchLooksLikePullRequest(workspace: Workspace, pullRequest: PullRequest): boolean {
  const branch = workspace.gitRuntime?.currentBranch?.trim();
  if (!branch) return false;
  if (branch === `pr/${pullRequest.number}`) return true;
  const head = pullRequest.headRefName?.trim();
  if (!head) return false;
  return branch === head || branch.endsWith(`/${head}`);
}

function isNewerWorkspace(workspace: Workspace, other: Workspace | null): boolean {
  if (!other) return true;
  return (workspace.activityAt ?? "") > (other.activityAt ?? "");
}
