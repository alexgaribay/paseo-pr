import type { PluginServerContext } from "@getpaseo/plugin/server";
import { handlePrAttention, handlePrList, handlePrProjects, handlePrStatus, handlePrView } from "./server/pr";
import { prAttention, prList, prProjects, prStatus, prView } from "./shared/pr";
import { handleSettingsGet, handleSettingsSet, loadStoredWorkspaceLabelNames } from "./server/settings";
import { prSettingsGet, prSettingsSet } from "./shared/settings";
import { applyExistingWorkspaceLabels } from "./server/workspace-labels";
import { prWorkspaceLabelsApply } from "./shared/workspace-labels";
import { createAssignmentAutomation } from "./server/assignment-automation";

export default function contribute(server: PluginServerContext) {
  const automation = createAssignmentAutomation();
  server.handle(prStatus, (input, context) => {
    void automation.wake(context);
    return handlePrStatus(input);
  });
  server.handle(prProjects, handlePrProjects);
  server.handle(prList, handlePrList);
  server.handle(prView, handlePrView);
  server.handle(prAttention, handlePrAttention);
  server.handle(prSettingsGet, (input, context) => {
    void automation.wake(context);
    return handleSettingsGet();
  });
  server.handle(prSettingsSet, async (input, context) => {
    const result = await handleSettingsSet(input);
    if (result.kind === "ok") void automation.wake(context, input.processCurrent);
    return result;
  });
  server.handle(prWorkspaceLabelsApply, async (input) =>
    await applyExistingWorkspaceLabels({
      workspaceId: input.workspaceId,
      names: await loadStoredWorkspaceLabelNames(),
    }),
  );
  const removeWorkspaceHook = server.on("workspace.created", (_event, context) => {
    void automation.wake(context);
  });
  return () => {
    removeWorkspaceHook();
    automation.stop();
  };
}
