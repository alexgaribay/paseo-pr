import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { getGhStatus, listRepoPullRequests, viewRepoPullRequest } from "./gh.server";
import { findGithubProject, listResolvedGithubProjects } from "./projects.server";
import type {
  ListPullRequestsInput,
  ListPullRequestsOutput,
  PullRequest,
  PullRequestState,
  ViewPullRequestOutput,
} from "./pr.shared";

export async function handlePrStatus(_input: Record<string, never>) {
  return await getGhStatus();
}

export async function handlePrProjects(_input: Record<string, never>, context: PluginHandlerContext) {
  const projects = await listResolvedGithubProjects(context);
  return {
    projects: projects.map(({ github: _github, ...project }) => project),
  };
}

export async function handlePrList(
  input: ListPullRequestsInput,
  context: PluginHandlerContext,
): Promise<ListPullRequestsOutput> {
  const projects = await listResolvedGithubProjects(context);
  const selected = selectProjects(projects, input.projectIds);

  if (input.projectIds && input.projectIds.length > 0 && selected.length === 0) {
    return { kind: "error", message: "That project is not a GitHub remote." };
  }

  const listState = githubListState(input.states);
  const pullRequests: PullRequest[] = [];
  for (const project of selected) {
    const result = await listRepoPullRequests({
      projectId: project.projectId,
      repo: project.github,
      state: listState,
      author: input.author,
      search: input.search,
      limit: input.limit,
    });
    if (result.kind !== "ok") return result;
    pullRequests.push(...result.pullRequests.filter((pullRequest) => matchesStates(pullRequest, input.states)));
  }

  pullRequests.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { kind: "ok", pullRequests };
}

export async function handlePrView(
  input: { projectId: string; number: number },
  context: PluginHandlerContext,
): Promise<ViewPullRequestOutput> {
  const project = await findGithubProject(context, input.projectId);
  if (!project) {
    return { kind: "error", message: "That project is not a GitHub remote." };
  }
  return await viewRepoPullRequest({
    projectId: project.projectId,
    repo: project.github,
    number: input.number,
  });
}

function selectProjects<T extends { projectId: string }>(projects: T[], projectIds: string[] | undefined): T[] {
  if (!projectIds || projectIds.length === 0) return projects;
  const wanted = new Set(projectIds);
  return projects.filter((project) => wanted.has(project.projectId));
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
