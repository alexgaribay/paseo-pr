import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PaseoAgent, PaseoWorkspace } from "@getpaseo/client";
import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { listActiveWorkspaces } from "../shared/workspace-from-pr";
import { prWorkspaceReviewAction, prWorkspaceReviews } from "../shared/workspace-reviews";
import { listResolvedGithubProjects, type ResolvedGithubProject } from "./projects";
import { loadStoredExcludedProjectIds } from "./settings";
import { runCommand } from "./run-command";
import { createWorkspacePullRequestObserver, type WorkspacePullRequestObserver } from "./workspace-review-github";
import { completeReviewTurn, initialReviewState, reviewReasons, reviewToken, workspaceReviewStateSchema } from "./workspace-review-state";

const stateSchema = z.object({
  version: z.literal(1),
  workspaces: z.record(z.string(), workspaceReviewStateSchema),
  turns: z.record(z.string(), z.object({ workspaceId: z.string(), turnId: z.string().nullable(), startedAt: z.string() })),
});
type State = z.infer<typeof stateSchema>;
type ReviewList = z.infer<typeof prWorkspaceReviews.output>;
interface ReviewSources {
  projects: Map<string, ResolvedGithubProject>;
  excluded: Set<string>;
  observe: WorkspacePullRequestObserver;
}

export function registerWorkspaceReviews(server: PluginServerContext): () => void {
  const filePath = join(process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo"), "plugin-data", "paseo-pr", "workspace-reviews.json");
  let state: State | undefined;
  let queue: Promise<void> = Promise.resolve();
  let cached: { until: number; result: ReviewList } | undefined;
  let stopped = false;

  const serialize = <T,>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(async () => {
      if (stopped) throw new Error("Workspace review monitoring has stopped.");
      if (!state) {
        try {
          state = stateSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
        } catch (error) {
          if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
          state = { version: 1, workspaces: {}, turns: {} };
        }
      }
      return await work();
    });
    queue = next.then(() => {}, () => {});
    return next;
  };
  const persist = async () => {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(`${filePath}.tmp`, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(`${filePath}.tmp`, filePath);
    cached = undefined;
  };
  const inspect = async (workspace: PaseoWorkspace, sources: ReviewSources, baselineAt?: string) => {
    if (!state) throw new Error("Workspace review state is unavailable.");
    if (workspace.archivingAt != null) return null;
    if (sources.excluded.has(workspace.projectId)) return null;
    const project = sources.projects.get(workspace.projectId);
    if (!project) return null;
    const current = await sources.observe(workspace, project);
    if (!current) return null;
    let entry = state.workspaces[workspace.id];
    if (!entry || entry.pullRequestKey !== current.observation.pullRequestKey) {
      entry = initialReviewState(current.observation, await readLocalHead(workspace.workspaceDirectory), baselineAt);
      state.workspaces[workspace.id] = entry;
      await persist();
    }
    return { ...current, entry };
  };
  const loadReviews = async (context: PluginHandlerContext): Promise<ReviewList> => {
    if (cached && cached.until > Date.now()) return cached.result;
    const [workspaces, agents, sources] = await Promise.all([
      listActiveWorkspaces(context.paseo),
      listAgents(context),
      reviewSources(context),
    ]);
    const result: ReviewList = { reviews: [], approvedWorkspaces: [], errors: [] };
    for (const workspace of workspaces) {
      try {
        const current = await inspect(workspace, sources);
        if (!current) continue;
        if (current.pullRequest.reviewDecision === "APPROVED" && !current.pullRequest.isDraft) {
          result.approvedWorkspaces.push({
            workspaceId: workspace.id,
            number: current.pullRequest.number,
            title: current.pullRequest.title,
            url: current.pullRequest.url,
          });
        }
        const reasons = reviewReasons(current.entry, current.observation);
        if (reasons.length === 0) continue;
        result.reviews.push({
          workspaceId: workspace.id,
          workspaceTitle: workspace.title ?? workspace.name,
          number: current.pullRequest.number,
          url: current.pullRequest.url,
          title: current.pullRequest.title,
          headOid: current.observation.headOid,
          baselineHeadOid: current.entry.baselineHeadOid,
          token: reviewToken(current.observation),
          reasons,
          agents: agents.filter((agent) => agent.workspaceId === workspace.id).map((agent) => ({
            id: agent.id,
            title: agent.title ?? "Untitled agent",
            busy: isBusy(agent),
          })),
        });
      } catch (error) {
        result.errors.push({ workspaceId: workspace.id, message: error instanceof Error ? error.message : String(error) });
      }
    }
    cached = { until: Date.now() + 60_000, result };
    return result;
  };

  server.handle(prWorkspaceReviews, (input, context) => serialize(async () => {
    if (input.refresh) cached = undefined;
    return await loadReviews(context);
  }));
  server.handle(prWorkspaceReviewAction, (input, context) => serialize(async () => {
    cached = undefined;
    try {
      const workspace = await context.paseo.workspaces.ref(input.workspaceId).refresh();
      if (!workspace) throw new Error("This workspace is no longer available.");
      const current = await inspect(workspace, await reviewSources(context));
      if (!current || reviewToken(current.observation) !== input.token) throw new Error("The PR changed. Refresh this prompt before continuing.");
      const entry = current.entry;
      if (entry.dismissedToken === input.token) return { kind: "ok" as const };
      if (reviewReasons(entry, current.observation).length === 0) throw new Error("This PR no longer needs a re-review prompt.");
      if (input.action === "dismiss") {
        entry.dismissedToken = input.token;
        entry.delivery = null;
        await persist();
        return { kind: "ok" as const };
      }
      if (entry.delivery?.token === input.token && entry.delivery.agentId !== input.agentId) {
        throw new Error("A previous send has an uncertain outcome. Retry with the same agent or dismiss this prompt before continuing.");
      }
      const agent = context.paseo.agents.ref(input.agentId);
      const snapshot = await agent.refresh();
      if (!snapshot || snapshot.agent.workspaceId !== workspace.id || snapshot.agent.archivedAt || snapshot.agent.internal) {
        throw new Error("Choose an existing, unarchived agent in this workspace.");
      }
      if (isBusy(snapshot.agent)) throw new Error("This agent is busy or waiting for permission. Finish its current turn first.");
      if (entry.delivery?.token !== input.token) entry.delivery = null;
      entry.delivery ??= {
        token: input.token,
        agentId: input.agentId,
        messageId: randomUUID(),
        prompt: [
          `Fetch safely and re-review ${current.pullRequest.url}. The PR head when I accepted this request was ${current.observation.headOid}.`,
          `The checkout at the previous turn or initial observation was ${entry.baselineHeadOid}. Use the earlier review and conversation as context, or read the PR review history if needed.`,
          "First inspect the working tree, branch, and uncommitted or untracked changes. Fetch the PR's latest commits. Never reset, clean, overwrite, force-checkout, or discard local changes. Do not stash, rebase, merge, or switch a dirty or divergent checkout without asking me. If it cannot be updated with a safe fast-forward, stop and ask how to proceed. Verify the checked-out commit against the latest PR head before reviewing.",
          "Review the latest code and any new review request even if the head is unchanged. Check whether previous findings are resolved, identify new regressions, and summarize the updated recommendation. Do not submit a GitHub review or post comments unless I separately authorize it.",
        ].join("\n\n"),
      };
      await persist();
      await agent.send(entry.delivery.prompt, { messageId: entry.delivery.messageId, activeTurnBehavior: "steer" });
      entry.dismissedToken = input.token;
      entry.delivery = null;
      await persist();
      return { kind: "ok" as const };
    } catch (error) {
      return { kind: "error" as const, message: error instanceof Error ? error.message : String(error) };
    }
  }));

  const before = server.addHook("agent.turn.before", async (event, context) => {
    if (!event.agent.workspaceId || event.agent.parentAgentId) return;
    const workspaceId = event.agent.workspaceId;
    const startedAt = new Date().toISOString();
    await serialize(async () => {
      if (!state) return;
      state.turns[event.agent.id] = { workspaceId, turnId: event.turnId, startedAt };
      await persist();
      const workspace = await context.paseo.workspaces.ref(workspaceId).refresh();
      if (workspace) await inspect(workspace, await reviewSources(context), startedAt);
    }).catch(logHookError);
  });
  const after = server.addHook("agent.turn.after", async (event, context) => {
    if (!event.agent.workspaceId || event.agent.parentAgentId) return;
    const localHead = event.outcome.kind === "completed"
      ? await readLocalHead(event.agent.cwd).catch((error) => { logHookError(error); return null; })
      : null;
    await serialize(async () => {
      if (!state) return;
      const turn = state.turns[event.agent.id];
      if (!turn || turn.turnId !== event.turnId) return;
      delete state.turns[event.agent.id];
      await persist();
      if (!localHead) return;
      const workspace = await context.paseo.workspaces.ref(turn.workspaceId).refresh();
      if (!workspace) return;
      const current = await inspect(workspace, await reviewSources(context), turn.startedAt);
      if (!current) return;
      state.workspaces[workspace.id] = completeReviewTurn(current.entry, current.observation, localHead, turn.startedAt);
      await persist();
    }).catch(logHookError);
  });

  return () => {
    stopped = true;
    before();
    after();
  };
}

async function readLocalHead(cwd: string): Promise<string> {
  const result = await runCommand({ command: "git", args: ["-C", cwd, "rev-parse", "--verify", "HEAD"] });
  const head = result.stdout.trim();
  if (result.code !== 0 || !/^[a-f\d]{40,64}$/i.test(head)) throw new Error("Could not read the checkout's current commit.");
  return head;
}

async function listAgents(context: PluginHandlerContext): Promise<PaseoAgent[]> {
  const agents: PaseoAgent[] = [];
  let cursor: string | undefined;
  do {
    const result = await context.paseo.agents.list({
      filter: { includeArchived: false, includeInternal: false },
      sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit: 100, ...(cursor ? { cursor } : {}) },
    });
    for (const entry of result.entries) {
      if (!entry.agent.archivedAt && !entry.agent.internal) agents.push(entry.agent);
    }
    if (!result.pageInfo.hasMore) break;
    const next = result.pageInfo.nextCursor;
    if (!next || next === cursor) throw new Error("Paseo returned an incomplete agent list.");
    cursor = next;
  } while (cursor);
  return agents;
}

function isBusy(agent: PaseoAgent): boolean {
  return agent.status === "running" || agent.status === "initializing" || !!agent.activeTurn || agent.pendingPermissions.length > 0;
}

function logHookError(error: unknown): void {
  console.error("[paseo-pr] Could not record the workspace review turn:", error);
}

async function reviewSources(context: PluginHandlerContext): Promise<ReviewSources> {
  const [projects, excluded] = await Promise.all([
    listResolvedGithubProjects(context),
    loadStoredExcludedProjectIds(),
  ]);
  return {
    projects: new Map(projects.map((project) => [project.projectId, project])),
    excluded: new Set(excluded),
    observe: createWorkspacePullRequestObserver(),
  };
}
