import type { PluginClientContext } from "@getpaseo/plugin/client";
import { findWorkspaceForPullRequest, createPullRequestWorkspace, listActiveWorkspaces, pullRequestWorkspaceKey } from "./workspace-from-pr";
import { prList, prProjects, type PullRequest } from "../shared/pr";
import { prSettingsGet } from "../shared/settings";
import { prWorkspaceLabelsApply } from "../shared/workspace-labels";

export function startAssignmentAutomation(client: PluginClientContext): () => void {
  const seen = new Set<string>();
  let initialized = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const poll = async () => {
    try {
      const settings = await client.rpc(prSettingsGet, {});
      if (!settings.assignmentAutomation.enabled) {
        initialized = false;
        seen.clear();
      } else {
        const assigned = await client.rpc(prList, { assignee: "me", limit: 100 });
        if (assigned.kind === "ok") {
          if (!initialized) {
            for (const pullRequest of assigned.pullRequests) seen.add(pullRequestWorkspaceKey(pullRequest));
            initialized = true;
          } else {
            const projects = (await client.rpc(prProjects, {})).projects;
            for (const pullRequest of assigned.pullRequests) {
              const key = pullRequestWorkspaceKey(pullRequest);
              if (seen.has(key)) continue;
              const project = projects.find((entry) => entry.projectId === pullRequest.projectId);
              if (!project) continue;
              try {
                await automate({ client, pullRequest, rootPath: project.rootPath, provider: settings.assignmentAutomation.provider, prompt: settings.assignmentAutomation.prompt });
                seen.add(key);
              } catch {
                // Retry this assignment on the next poll.
              }
            }
          }
        }
      }
      const delay = Math.max(60_000, settings.refreshIntervalMinutes * 60_000);
      if (!stopped) timer = setTimeout(() => void poll(), delay);
    } catch {
      if (!stopped) timer = setTimeout(() => void poll(), 60_000);
    }
  };

  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

async function automate(input: { client: PluginClientContext; pullRequest: PullRequest; rootPath: string; provider: string; prompt: string }) {
  if (input.provider.trim().length === 0 || input.prompt.trim().length === 0) return;
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
    config: { provider: input.provider.trim() },
    prompt: input.prompt,
    title: `PR #${input.pullRequest.number}: ${input.pullRequest.title}`,
  });
}
