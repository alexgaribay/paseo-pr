import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { handlePrList, handlePrProjects } from "./pr";
import { loadAutomationHostId, loadStoredAssignmentAutomation, loadStoredWorkspaceLabelNames } from "./settings";
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
    config: z.object({
      provider: z.string(),
      modeId: z.string().optional(),
      thinkingOptionId: z.string().optional(),
      featureValues: z.record(z.string(), z.unknown()).optional(),
    }),
    prompt: z.string(),
    labels: z.array(z.string()),
  }),
  z.object({ kind: z.literal("completed"), workspaceId: z.string(), agentId: z.string() }),
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
    const hostId = await loadAutomationHostId();
    if (stopped || !settings.enabled || !hostId || settings.ownerHostId !== hostId) return;
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
      if (baseline.has(key) || state.runs[key]?.kind === "completed") continue;
      const project = projects.projects.find((entry) => entry.projectId === pullRequest.projectId);
      if (!project) continue;
      try {
        let entry = state.runs[key];
        if (!entry) {
          const { config } = await currentContext.paseo.config.get();
          const profile = config.agentProfiles?.find((candidate) => candidate.id === settings.profileId);
          if (!profile?.model) throw new Error("The automatic review profile is unavailable or has no model.");
          const existing = findWorkspaceForPullRequest(await listActiveWorkspaces(currentContext.paseo), pullRequest);
          entry = {
            kind: "pending",
            pullRequest,
            rootPath: project.rootPath,
            workspaceId: existing?.id ?? null,
            config: {
              provider: `${profile.provider}/${profile.model}`,
              ...(profile.modeId ? { modeId: profile.modeId } : {}),
              ...(profile.thinkingOptionId ? { thinkingOptionId: profile.thinkingOptionId } : {}),
              ...(profile.featureValues ? { featureValues: profile.featureValues } : {}),
            },
            prompt: settings.prompt,
            labels: await loadStoredWorkspaceLabelNames(),
          };
          state.runs[key] = entry;
        }
        if (entry.kind !== "pending" || stopped) continue;
        // Persist the immutable intent before every attempt, including after a failed journal write.
        await persist();
        const latestSettings = await loadStoredAssignmentAutomation();
        if (!latestSettings.enabled || latestSettings.ownerHostId !== hostId) return;
        if (!latestSettings.includeDrafts && pullRequest.isDraft) continue;
        await finishRun(key, entry, currentContext);
      } catch (error) {
        console.error(`[paseo-pr] Automatic review failed for ${pullRequest.host}/${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}:`, error);
      }
    }
  };

  const finishRun = async (key: string, entry: PendingRun, currentContext: PluginHandlerContext) => {
    if (entry.workspaceId === null) {
      const created = await createPullRequestWorkspace({
        paseo: currentContext.paseo,
        rootPath: entry.rootPath,
        number: entry.pullRequest.number,
        title: entry.pullRequest.title,
        idempotencyKey: `paseo-pr:workspace:${key}`,
      });
      entry.workspaceId = created.workspaceId;
      await persist();
    }
    if (stopped) return;
    const labels = await applyExistingWorkspaceLabels({ workspaceId: entry.workspaceId, names: entry.labels });
    if (labels.kind === "error") throw new Error(labels.message);
    if (stopped) return;
    const latestSettings = await loadStoredAssignmentAutomation();
    const hostId = await loadAutomationHostId();
    if (stopped || !latestSettings.enabled || !hostId || latestSettings.ownerHostId !== hostId) return;
    const agent = await currentContext.paseo.workspaces.ref(entry.workspaceId).agents.create({
      idempotencyKey: `paseo-pr:review:${key}`,
      config: entry.config,
      prompt: entry.prompt,
      title: `PR #${entry.pullRequest.number}: ${entry.pullRequest.title}`,
    });
    if (!state) throw new Error("Automatic review state is unavailable.");
    state.runs[key] = { kind: "completed", workspaceId: entry.workspaceId, agentId: agent.id };
    await persist();
    console.info(`[paseo-pr] Started automatic review ${key}: ${agent.id}`);
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
