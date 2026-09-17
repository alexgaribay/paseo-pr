import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { getGhStatus, listRepoPullRequests, viewRepoPullRequest } from "./gh";
import { findGithubProject, listResolvedGithubProjects, ProjectDiscoveryUnavailableError } from "./projects";
import { loadStoredExcludedProjectIds } from "./settings";
import type {
  AttentionOutput,
  ListPullRequestsInput,
  ListPullRequestsOutput,
  PullRequest,
  PullRequestState,
  ViewPullRequestOutput,
} from "../shared/pr";

export async function handlePrStatus(_input: Record<string, never>) {
  return await getGhStatus();
}

export async function handlePrProjects(
  input: { includeExcluded?: boolean },
  context: PluginHandlerContext,
) {
  try {
    const projects = await listVisibleProjects(context, input.includeExcluded === true);
    return {
      kind: "ok" as const,
      projects: projects.map((project) => ({
        projectId: project.projectId,
        displayName: project.displayName,
        host: project.host,
        owner: project.owner,
        repo: project.repo,
        rootPath: project.rootPath,
      })),
    };
  } catch (error) {
    return { kind: "error" as const, message: projectDiscoveryMessage(error) };
  }
}

export async function handlePrList(
  input: ListPullRequestsInput,
  context: PluginHandlerContext,
): Promise<ListPullRequestsOutput> {
  let allProjects;
  try {
    allProjects = await listResolvedGithubProjects(context);
  } catch (error) {
    return { kind: "error", message: projectDiscoveryMessage(error) };
  }
  const excludedProjectIds = new Set(await loadStoredExcludedProjectIds());
  const visibleProjects = allProjects.filter((project) => !excludedProjectIds.has(project.projectId));
  const selected = selectProjects(visibleProjects, input.projectIds);

  if (input.projectIds && input.projectIds.length > 0 && selected.length === 0) {
    const wanted = new Set(input.projectIds);
    const excludedOnly = allProjects.some(
      (project) => wanted.has(project.projectId) && excludedProjectIds.has(project.projectId),
    );
    return {
      kind: "error",
      message: excludedOnly
        ? "That project is excluded in plugin settings."
        : "That project is not a GitHub remote.",
    };
  }

  const listState = githubListState(input.states);
  const results = await Promise.all(
    selected.map((project) =>
      listRepoPullRequests({
        projectId: project.projectId,
        repo: project.github,
        state: listState,
        author: input.author,
        assignee: input.assignee,
        waiting: input.waiting,
        search: input.search,
        limit: input.limit,
      }),
    ),
  );

  const pullRequests: PullRequest[] = [];
  for (const [index, result] of results.entries()) {
    if (result.kind === "ok") {
      pullRequests.push(...result.pullRequests.filter((pullRequest) => matchesStates(pullRequest, input.states)));
      continue;
    }
    if (result.kind === "unavailable") return result;
    const project = selected[index];
    console.error(`[paseo-pr] skipped ${project.github.owner}/${project.github.repo}: ${result.message}`);
  }

  pullRequests.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { kind: "ok", pullRequests };
}

export async function handlePrView(
  input: { projectId: string; number: number },
  context: PluginHandlerContext,
): Promise<ViewPullRequestOutput> {
  let project;
  try {
    project = await findGithubProject(context, input.projectId);
  } catch (error) {
    return { kind: "error", message: projectDiscoveryMessage(error) };
  }
  if (!project) {
    return { kind: "error", message: "That project is not a GitHub remote." };
  }
  return await viewRepoPullRequest({
    projectId: project.projectId,
    repo: project.github,
    number: input.number,
  });
}

export async function handlePrAttention(
  _input: Record<string, never>,
  context: PluginHandlerContext,
): Promise<AttentionOutput> {
  const status = await getGhStatus();
  if (status.kind !== "ok") return status;

  let projects;
  try {
    projects = await listVisibleProjects(context);
  } catch (error) {
    return { kind: "error", message: projectDiscoveryMessage(error) };
  }
  const results = await Promise.all(
    projects.map((project) =>
      listRepoPullRequests({
        projectId: project.projectId,
        repo: project.github,
        state: "open",
        author: "anyone",
        assignee: "anyone",
        waiting: "me",
        limit: 100,
      }),
    ),
  );

  const seen = new Set<string>();
  const pullRequests: PullRequest[] = [];
  for (const [index, result] of results.entries()) {
    if (result.kind === "unavailable") return result;
    if (result.kind !== "ok") {
      const project = projects[index];
      console.error(`[paseo-pr] skipped ${project.github.owner}/${project.github.repo}: ${result.message}`);
      continue;
    }
    for (const pullRequest of result.pullRequests) {
      const key = `${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pullRequests.push(pullRequest);
    }
  }
  pullRequests.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { kind: "ok", count: pullRequests.length, pullRequests };
}

async function listVisibleProjects(context: PluginHandlerContext, includeExcluded = false) {
  const projects = await listResolvedGithubProjects(context);
  if (includeExcluded) return projects;
  const excludedProjectIds = new Set(await loadStoredExcludedProjectIds());
  return projects.filter((project) => !excludedProjectIds.has(project.projectId));
}

function selectProjects<T extends { projectId: string }>(projects: T[], projectIds: string[] | undefined): T[] {
  if (!projectIds || projectIds.length === 0) return projects;
  const wanted = new Set(projectIds);
  return projects.filter((project) => wanted.has(project.projectId));
}

function projectDiscoveryMessage(error: unknown): string {
  if (error instanceof ProjectDiscoveryUnavailableError) return error.message;
  return "Could not discover Paseo projects.";
}

function githubListState(states: PullRequestState[]): "open" | "closed" | "merged" | "all" {
  if (states.length === 1) return states[0];
  return "all";
}

function matchesStates(pullRequest: PullRequest, states: PullRequestState[]): boolean {
  if (states.length === 0 || states.length === 3) return true;
  return isPullRequestState(pullRequest.state) && states.includes(pullRequest.state);
}

function isPullRequestState(value: string): value is PullRequestState {
  return value === "open" || value === "closed" || value === "merged";
}
