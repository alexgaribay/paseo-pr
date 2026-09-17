import type { PluginClientContext } from "@getpaseo/plugin/client";
import { registerAssignmentAutomationWake } from "./automation-control";
import { findWorkspaceForPullRequest, createPullRequestWorkspace, listActiveWorkspaces, pullRequestWorkspaceKey } from "./workspace-from-pr";
import { prList, prProjects, type PullRequest } from "../shared/pr";
import { prSettingsGet } from "../shared/settings";
import { prWorkspaceLabelsApply } from "../shared/workspace-labels";

const AUTOMATION_POLL_MS = 60_000;

export function startAssignmentAutomation(client: PluginClientContext): () => void {
  const seen = new Set<string>();
  let initialized = false;
  let stopped = false;
  let polling = false;
  let pendingWake = false;
  let processCurrentOnNextPoll = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (delay: number) => {
    if (!stopped) timer = setTimeout(() => void poll(), delay);
  };

  const poll = async () => {
    if (polling) {
      pendingWake = true;
      return;
    }
    polling = true;
    if (processCurrentOnNextPoll) {
      seen.clear();
      initialized = true;
      processCurrentOnNextPoll = false;
    }
    try {
      const settings = await client.rpc(prSettingsGet, {});
      if (!settings.assignmentAutomation.enabled) {
        initialized = false;
        seen.clear();
      } else {
        const { profileId, prompt } = settings.assignmentAutomation;
        if (profileId.trim().length === 0 || prompt.trim().length === 0) {
          console.warn("[paseo-pr] Assigned PR automation is enabled but needs a profile and prompt.");
        } else {
          const candidates = await listAutomationCandidates(client);
          if (candidates) {
            if (!initialized) {
              for (const pullRequest of candidates) seen.add(pullRequestWorkspaceKey(pullRequest));
              initialized = true;
            } else {
              const projectsResult = await client.rpc(prProjects, {});
              if (projectsResult.kind !== "ok") {
                console.warn(`[paseo-pr] Automation skipped: ${projectsResult.message}`);
                return;
              }
              const projects = projectsResult.projects;
              for (const pullRequest of candidates) {
                const key = pullRequestWorkspaceKey(pullRequest);
                if (seen.has(key)) continue;
                const project = projects.find((entry) => entry.projectId === pullRequest.projectId);
                if (!project) {
                  console.warn(`[paseo-pr] Skipping automation for PR #${pullRequest.number}: project is excluded or unavailable.`);
                  continue;
                }
                try {
                  console.info(`[paseo-pr] Starting automation for ${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}.`);
                  await automate({
                    client,
                    pullRequest,
                    rootPath: project.rootPath,
                    profileId,
                    prompt,
                  });
                  seen.add(key);
                } catch (error) {
                  console.error(
                    `[paseo-pr] Automation failed for ${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}:`,
                    error instanceof Error ? error.message : error,
                  );
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("[paseo-pr] Automation poll failed:", error instanceof Error ? error.message : error);
    } finally {
      polling = false;
      const delay = pendingWake ? 0 : AUTOMATION_POLL_MS;
      pendingWake = false;
      schedule(delay);
    }
  };

  const unregisterWake = registerAssignmentAutomationWake(({ processCurrent }) => {
    clearTimeout(timer);
    processCurrentOnNextPoll ||= processCurrent;
    void poll();
  });

  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
    unregisterWake();
  };
}

async function listAutomationCandidates(client: PluginClientContext): Promise<PullRequest[] | null> {
  const [assigned, waiting] = await Promise.all([
    client.rpc(prList, { assignee: "me", limit: 100 }),
    client.rpc(prList, { waiting: "me", limit: 100 }),
  ]);
  if (assigned.kind === "unavailable" || waiting.kind === "unavailable") return null;

  const merged = new Map<string, PullRequest>();
  for (const result of [assigned, waiting]) {
    if (result.kind !== "ok") continue;
    for (const pullRequest of result.pullRequests) {
      merged.set(pullRequestWorkspaceKey(pullRequest), pullRequest);
    }
  }
  return [...merged.values()];
}

async function automate(input: {
  client: PluginClientContext;
  pullRequest: PullRequest;
  rootPath: string;
  profileId: string;
  prompt: string;
}) {
  if (input.profileId.trim().length === 0 || input.prompt.trim().length === 0) return;
  const { config } = await input.client.paseo.config.get();
  const profile = config.agentProfiles?.find((candidate) => candidate.id === input.profileId);
  if (!profile) throw new Error(`The selected agent profile no longer exists: ${input.profileId}`);
  if (!profile.model) throw new Error(`The selected agent profile needs a model: ${profile.name}`);
  const existing = findWorkspaceForPullRequest(await listActiveWorkspaces(input.client.paseo), input.pullRequest);
  const workspace = existing
    ? { id: existing.id }
    : {
        id: (await createPullRequestWorkspace({
          paseo: input.client.paseo,
          rootPath: input.rootPath,
          number: input.pullRequest.number,
          title: input.pullRequest.title,
          onCreated: async (workspaceId) => {
            const result = await input.client.rpc(prWorkspaceLabelsApply, { workspaceId });
            if (result.kind === "error") throw new Error(result.message);
          },
        })).workspaceId,
      };
  await input.client.paseo.workspaces.ref(workspace.id).agents.create({
    config: {
      provider: `${profile.provider}/${profile.model}`,
      ...(profile.thinkingOptionId ? { thinkingOptionId: profile.thinkingOptionId } : {}),
      ...(profile.modeId ? { modeId: profile.modeId } : {}),
      ...(profile.featureValues ? { featureValues: profile.featureValues } : {}),
    },
    prompt: input.prompt,
    title: `PR #${input.pullRequest.number}: ${input.pullRequest.title}`,
  });
}
