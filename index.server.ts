import type { PluginServerContext } from "@getpaseo/plugin/server";
import { handlePrAttention, handlePrList, handlePrProjects, handlePrStatus, handlePrView } from "./server/pr";
import { prAttention, prList, prProjects, prStatus, prView } from "./shared/pr";
import { handleSettingsGet, handleSettingsSet, loadStoredWorkspaceLabelNames } from "./server/settings";
import { prSettingsGet, prSettingsSet } from "./shared/settings";
import { applyExistingWorkspaceLabels } from "./server/workspace-labels";
import { prWorkspaceLabelsApply } from "./shared/workspace-labels";

export default function contribute(server: PluginServerContext) {
  server.handle(prStatus, handlePrStatus);
  server.handle(prProjects, handlePrProjects);
  server.handle(prList, handlePrList);
  server.handle(prView, handlePrView);
  server.handle(prAttention, handlePrAttention);
  server.handle(prSettingsGet, handleSettingsGet);
  server.handle(prSettingsSet, handleSettingsSet);
  server.handle(prWorkspaceLabelsApply, async (input) =>
    await applyExistingWorkspaceLabels({
      workspaceId: input.workspaceId,
      names: await loadStoredWorkspaceLabelNames(),
    }),
  );
  return () => {};
}
