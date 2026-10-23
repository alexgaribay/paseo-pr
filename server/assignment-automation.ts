import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { handlePrList, handlePrProjects } from "./pr";
import { loadStoredAssignmentAutomation, loadStoredWorkspaceLabelNames } from "./settings";
import { applyExistingWorkspaceLabels } from "./workspace-labels";
import { createPullRequestWorkspace, findWorkspaceForPullRequest, listActiveWorkspaces } from "../shared/workspace-from-pr";
import { listPullRequestsInputSchema, pullRequestSchema } from "../shared/pr";
import type { PullRequest } from "../shared/pr";

const POLL_MS = 60_000;
const runSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pending"),
    pullRequest: pullRequestSchema,
    rootPath: z.string(),
    workspaceId: z.string().nullable(),
    agentId: z.string().nullable().default(null),
    messageId: z.string().nullable().default(null),
    reviewedHeads: z.array(z.string()).default([]),
    config: z.object({
      provider: z.string(),
      modeId: z.string().optional(),
      thinkingOptionId: z.string().optional(),
      featureValues: z.record(z.string(), z.unknown()).optional(),
    }).nullable().default(null),
    prompt: z.string(),
    labels: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("completed"),
    workspaceId: z.string(),
    agentId: z.string(),
    reviewedHeads: z.array(z.string()).default([]),
  }),
]);
const stateSchema = z.object({
  initialized: z.boolean(),
  baseline: z.array(z.string()),
  runs: z.record(z.string(), runSchema),
});
type AutomationState = z.infer<typeof stateSchema>;
type PendingRun = Extract<z.infer<typeof runSchema>, { kind: "pending" }>;

/** One coordinator per daemon plugin process; app connections never own review creation. */
export function createAssignmentAutomation() {
  let state: AutomationState | undefined;
  let running: Promise<void> | undefined;
  let pendingWake = false;
  let processCurrentRequested = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let context: PluginHandlerContext | undefined;

  const filePath = join(process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo"), "plugin-data", "paseo-pr", "automation.json");
  const persist = async () => {
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);
  };

  const run = async (currentContext: PluginHandlerContext, processCurrent: boolean) => {
    const settings = await loadStoredAssignmentAutomation();
    if (stopped || !settings.enabled) return;
    if (!settings.profileId.trim() || !settings.prompt.trim()) return;

    if (!state) {
      try {
        state = stateSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
      } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
        state = { initialized: false, baseline: [], runs: {} };
      }
    }

    const [assigned, waiting] = await Promise.all([
      handlePrList(listPullRequestsInputSchema.parse({ assignee: "me", limit: 100 }), currentContext),
      handlePrList(listPullRequestsInputSchema.parse({ waiting: "me", limit: 100 }), currentContext),
    ]);
    if (assigned.kind !== "ok" || waiting.kind !== "ok") throw new Error("Could not load automatic review candidates.");
    const candidates = new Map<string, PullRequest>();
    for (const [index, result] of [assigned, waiting].entries()) {
      for (const pullRequest of result.pullRequests) {
        if (pullRequest.state !== "open" || pullRequest.authoredByViewer !== false) continue;
        if (!settings.includeDrafts && pullRequest.isDraft) continue;
        if (index === 1 && !pullRequest.waitingOnViewer && !pullRequest.needsRereview) continue;
        const key = JSON.stringify([pullRequest.host.toLowerCase(), pullRequest.owner.toLowerCase(), pullRequest.repo.toLowerCase(), pullRequest.number]);
        candidates.set(key, pullRequest);
      }
    }

    if (!state.initialized && !processCurrent) {
      state.initialized = true;
      state.baseline = [...candidates.keys()];
      await persist();
      return;
    }
    state.initialized = true;
    if (processCurrent) {
      state.baseline = [];
      await persist();
    }
    const projects = await handlePrProjects({}, currentContext);
    if (projects.kind !== "ok") throw new Error(projects.message);
    const baseline = new Set(state.baseline);
    for (const [key, pullRequest] of candidates) {
      if (stopped) return;
      if (baseline.has(key)) continue;
      const project = projects.projects.find((entry) => entry.projectId === pullRequest.projectId);
      if (!project) continue;
      try {
        let entry = state.runs[key];
        const previous = entry?.kind === "completed" ? entry : null;
        if (previous && (!pullRequest.needsRereview || !pullRequest.headRefOid || previous.reviewedHeads.includes(pullRequest.headRefOid))) continue;
        if (!entry || previous) {
          const existing = previous ? null : findWorkspaceForPullRequest(await listActiveWorkspaces(currentContext.paseo), pullRequest);
          entry = {
            kind: "pending",
            pullRequest,
            rootPath: project.rootPath,
            workspaceId: previous?.workspaceId ?? existing?.id ?? null,
            agentId: previous?.agentId ?? null,
            messageId: previous ? randomUUID() : null,
            reviewedHeads: previous?.reviewedHeads ?? [],
            config: null,
            prompt: previous
              ? [
                  `Re-review ${pullRequest.url}. New PR head: ${pullRequest.headRefOid}.`,
                  "Use the earlier review and conversation in this thread as context, or consult the PR's review history if that context is unavailable. Fetch the PR's latest commits and safely update the checkout without discarding local changes.",
                  "Focus on changes since your previous review, verify whether earlier findings were addressed, and flag new regressions. Summarize resolved and outstanding issues and your updated recommendation.",
                  `Review instructions: ${settings.prompt}`,
                ].join("\n\n")
              : settings.prompt,
            labels: await loadStoredWorkspaceLabelNames(),
          };
          state.runs[key] = entry;
        }
        if (entry.kind !== "pending" || stopped) continue;
        // Persist the immutable intent before every attempt, including after a failed journal write.
        await persist();
        const latestSettings = await loadStoredAssignmentAutomation();
        if (!latestSettings.enabled) return;
        if (!latestSettings.includeDrafts && pullRequest.isDraft) continue;
        await finishRun(key, entry, currentContext);
      } catch (error) {
        console.error(`[paseo-pr] Automatic review failed for ${pullRequest.host}/${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}:`, error);
      }
    }
  };

  const finishRun = async (key: string, entry: PendingRun, currentContext: PluginHandlerContext) => {
    const latestSettings = await loadStoredAssignmentAutomation();
    if (stopped || !latestSettings.enabled) return;
    let agentId = entry.agentId;
    if (agentId !== null) {
      const agent = currentContext.paseo.agents.ref(agentId);
      const snapshot = await agent.refresh();
      const workspaceAvailable = snapshot?.agent.archivedAt
        ? (await listActiveWorkspaces(currentContext.paseo)).some((workspace) => workspace.id === entry.workspaceId)
        : true;
      if (snapshot && workspaceAvailable) {
        if (snapshot.agent.status === "running" || snapshot.agent.status === "initializing" || snapshot.agent.activeTurn || snapshot.agent.pendingPermissions.length > 0) return;
        if (!entry.messageId) throw new Error("Re-review message ID is unavailable.");
        if (stopped || !(await loadStoredAssignmentAutomation()).enabled) return;
        await agent.send(entry.prompt, { messageId: entry.messageId, activeTurnBehavior: "steer" });
      } else {
        entry.agentId = null;
        const existing = findWorkspaceForPullRequest(await listActiveWorkspaces(currentContext.paseo), entry.pullRequest);
        entry.workspaceId = existing?.id ?? null;
        await persist();
        agentId = null;
      }
    }
    if (agentId === null) {
      if (entry.workspaceId === null) {
        const created = await createPullRequestWorkspace({
          paseo: currentContext.paseo,
          rootPath: entry.rootPath,
          number: entry.pullRequest.number,
          title: entry.pullRequest.title,
          idempotencyKey: `paseo-pr:workspace:${key}${entry.messageId ? `:${entry.messageId}` : ""}`,
        });
        entry.workspaceId = created.workspaceId;
        await persist();
      }
      if (stopped) return;
      const labels = await applyExistingWorkspaceLabels({ workspaceId: entry.workspaceId, names: entry.labels });
      if (labels.kind === "error") throw new Error(labels.message);
      if (stopped) return;
      if (!entry.config) {
        const { config } = await currentContext.paseo.config.get();
        const profile = config.agentProfiles?.find((candidate) => candidate.id === latestSettings.profileId);
        if (!profile?.model) throw new Error("The automatic review profile is unavailable or has no model.");
        entry.config = {
          provider: `${profile.provider}/${profile.model}`,
          ...(profile.modeId ? { modeId: profile.modeId } : {}),
          ...(profile.thinkingOptionId ? { thinkingOptionId: profile.thinkingOptionId } : {}),
          ...(profile.featureValues ? { featureValues: profile.featureValues } : {}),
        };
        await persist();
      }
      if (stopped || !(await loadStoredAssignmentAutomation()).enabled) return;
      const agent = await currentContext.paseo.workspaces.ref(entry.workspaceId).agents.create({
        idempotencyKey: `paseo-pr:review:${key}${entry.messageId ? `:${entry.messageId}` : ""}`,
        clientMessageId: entry.messageId ?? undefined,
        config: entry.config,
        prompt: entry.prompt,
        title: `PR #${entry.pullRequest.number}: ${entry.pullRequest.title}`,
      });
      agentId = agent.id;
    }
    if (!state) throw new Error("Automatic review state is unavailable.");
    if (entry.workspaceId === null) throw new Error("Automatic review workspace is unavailable.");
    const reviewedHeads = entry.pullRequest.headRefOid
      ? [...entry.reviewedHeads, entry.pullRequest.headRefOid]
      : entry.reviewedHeads;
    state.runs[key] = { kind: "completed", workspaceId: entry.workspaceId, agentId, reviewedHeads };
    await persist();
    console.info(`[paseo-pr] ${entry.messageId ? "Started re-review" : "Started automatic review"} ${key}: ${agentId}`);
  };

  const wake = (nextContext: PluginHandlerContext, processCurrent = false): Promise<void> => {
    if (stopped) return Promise.resolve();
    context = nextContext;
    clearTimeout(timer);
    pendingWake = true;
    processCurrentRequested ||= processCurrent;
    if (running) return running;
    running = (async () => {
      try {
        while (pendingWake && context && !stopped) {
          pendingWake = false;
          const processCurrent = processCurrentRequested;
          processCurrentRequested = false;
          try {
            await run(context, processCurrent);
          } catch (error) {
            console.error("[paseo-pr] Automatic review poll failed:", error);
          }
        }
      } finally {
        running = undefined;
        if (!stopped && context) timer = setTimeout(() => { if (context) void wake(context); }, POLL_MS);
      }
    })();
    return running;
  };
  return {
    wake,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
