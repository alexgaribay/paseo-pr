import type { PaseoWorkspace } from "@getpaseo/client";
import { z } from "zod";
import { ghRepoFlag } from "../shared/github-remote";
import { findWorkspaceForPullRequest } from "../shared/workspace-from-pr";
import type { ResolvedGithubProject } from "./projects";
import { runCommand } from "./run-command";
import type { ReviewObservation } from "./workspace-review-state";
import { activeReviewRequests, reviewRequestEventSchema } from "./workspace-review-requests";

const pullRequestSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  headRefName: z.string(),
  headRefOid: z.string().min(1),
  isDraft: z.boolean(),
  reviewDecision: z.string().nullable(),
  timelineItems: z.object({
    nodes: z.array(reviewRequestEventSchema.nullable()),
    pageInfo: z.object({ hasPreviousPage: z.boolean(), startCursor: z.string().nullable() }),
  }),
});
const responseSchema = z.object({
  data: z.object({
    viewer: z.object({ login: z.string() }),
    repository: z.object({ pullRequest: pullRequestSchema.nullable() }).nullable(),
  }),
});
export type ObservedPullRequest = {
  pullRequest: Omit<z.infer<typeof pullRequestSchema>, "timelineItems">;
  observation: ReviewObservation;
};

export type WorkspacePullRequestObserver = (
  workspace: PaseoWorkspace,
  project: ResolvedGithubProject,
) => Promise<ObservedPullRequest | null>;

export function createWorkspacePullRequestObserver(): WorkspacePullRequestObserver {
  const requests = new Map<string, Promise<ObservedPullRequest | null>>();
  const branches = new Map<string, Promise<number | null>>();
  const memberships = new Map<string, Promise<boolean>>();

  return async (workspace: PaseoWorkspace, project: ResolvedGithubProject): Promise<ObservedPullRequest | null> => {
    const branch = workspace.gitRuntime?.currentBranch?.trim();
    let number = workspace.githubRuntime?.pullRequest?.number
      ?? Number(/^#(\d+)(?:\s|$)/.exec(workspace.title ?? workspace.name)?.[1] ?? /^pr\/(\d+)$/.exec(branch ?? "")?.[1] ?? 0);
    const repository = [project.host.toLowerCase(), project.owner.toLowerCase(), project.repo.toLowerCase()];
    if (!(number > 0)) {
      if (!branch) return null;
      const branchKey = JSON.stringify([...repository, branch]);
      let pending = branches.get(branchKey);
      if (!pending) {
        pending = findBranchPullRequest(project, branch);
        branches.set(branchKey, pending);
      }
      number = await pending ?? 0;
      if (number === 0) return null;
    }
    const key = JSON.stringify([...repository, number]);
    let pending = requests.get(key);
    if (!pending) {
      pending = readPullRequest(project, number, key, memberships);
      requests.set(key, pending);
    }
    const current = await pending;
    if (!current || !findWorkspaceForPullRequest([workspace], {
      projectId: project.projectId,
      owner: project.owner,
      repo: project.repo,
      number,
      headRefName: current.pullRequest.headRefName,
    })) return null;
    return current;
  };
}

async function findBranchPullRequest(project: ResolvedGithubProject, branch: string): Promise<number | null> {
  const result = await runCommand({
    command: "gh",
    args: ["pr", "list", "--repo", ghRepoFlag(project.github), "--state", "open", "--head", branch, "--limit", "2", "--json", "number"],
  });
  if (result.code !== 0) throw new Error(result.stderr.trim() || "Could not match this checkout to a PR.");
  const matches = z.array(z.object({ number: z.number().int().positive() })).parse(JSON.parse(result.stdout));
  if (matches.length > 1) throw new Error("More than one open PR matches this checkout. Give the workspace a #PR-number title to choose one.");
  return matches[0]?.number ?? null;
}

async function readPullRequest(
  project: ResolvedGithubProject,
  number: number,
  pullRequestKey: string,
  memberships: Map<string, Promise<boolean>>,
): Promise<ObservedPullRequest | null> {
  let before: string | null = null;
  const seenReviewers = new Set<string>();
  for (;;) {
    const query = `query WorkspaceReview($owner: String!, $repo: String!, $number: Int!, $before: String) {
      viewer { login }
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          number title url state headRefName headRefOid isDraft reviewDecision
          timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT, REVIEW_REQUEST_REMOVED_EVENT], last: 100, before: $before) {
            nodes {
              __typename
              ... on ReviewRequestedEvent { id createdAt requestedReviewer {
                ... on User { login }
                ... on Team { slug organization { login } }
              } }
              ... on ReviewRequestRemovedEvent { id createdAt requestedReviewer {
                ... on User { login }
                ... on Team { slug organization { login } }
              } }
            }
            pageInfo { hasPreviousPage startCursor }
          }
        }
      }
    }`;
    const result = await runCommand({
      command: "gh",
      args: [
        "api", "graphql", "--hostname", project.host,
        "-f", `query=${query}`, "-f", `owner=${project.owner}`, "-f", `repo=${project.repo}`,
        "-F", `number=${number}`, ...(before ? ["-f", `before=${before}`] : []),
      ],
      timeoutMs: 45_000,
    });
    if (result.code !== 0) throw new Error(result.stderr.trim() || "Could not check PR review status.");
    const parsed = responseSchema.parse(JSON.parse(result.stdout));
    const remote = parsed.data.repository?.pullRequest;
    if (!remote || remote.state !== "OPEN") return null;
    const viewer = parsed.data.viewer.login.toLowerCase();
    let request: ReviewObservation["request"] = null;
    for (const event of activeReviewRequests(remote.timelineItems.nodes, seenReviewers)) {
      const reviewer = event?.requestedReviewer;
      if (!event || !reviewer) continue;
      let forViewer = reviewer.login?.toLowerCase() === viewer;
      if (!forViewer && reviewer.organization && reviewer.slug) {
        const key = JSON.stringify([project.host, reviewer.organization.login, reviewer.slug, viewer]);
        let membership = memberships.get(key);
        if (!membership) {
          membership = isViewerOnTeam(project.host, reviewer.organization.login, reviewer.slug, viewer);
          memberships.set(key, membership);
        }
        forViewer = await membership;
      }
      if (forViewer) {
        request = { id: event.id, createdAt: event.createdAt };
        break;
      }
    }
    if (request || !remote.timelineItems.pageInfo.hasPreviousPage) {
      const { timelineItems: _timeline, ...pullRequest } = remote;
      return { pullRequest, observation: { pullRequestKey, headOid: remote.headRefOid, request } };
    }
    const cursor = remote.timelineItems.pageInfo.startCursor;
    if (!cursor || cursor === before) throw new Error("GitHub returned an incomplete review request history.");
    before = cursor;
  }
}

async function isViewerOnTeam(host: string, organization: string, team: string, viewer: string): Promise<boolean> {
  const endpoint = `orgs/${encodeURIComponent(organization)}/teams/${encodeURIComponent(team)}/memberships/${encodeURIComponent(viewer)}`;
  const result = await runCommand({ command: "gh", args: ["api", "--hostname", host, endpoint] });
  if (result.code !== 0 && !result.stderr.includes("HTTP 404")) {
    throw new Error(result.stderr.trim() || "Could not check whether a team review request is for you.");
  }
  return result.code === 0 && z.object({ state: z.string() }).parse(JSON.parse(result.stdout)).state === "active";
}
