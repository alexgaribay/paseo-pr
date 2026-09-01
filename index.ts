import type { PluginContext } from "@getpaseo/plugin";
import { readCommandCenterQuery } from "./command-center-query.client";
import { MainSurface } from "./main.client";
import { requestOpenPrModal } from "./open-pr-request.client";
import { handlePrAttention, handlePrList, handlePrProjects, handlePrStatus, handlePrView } from "./pr.server";
import { prAttention, prList, prProjects, prStatus, prView } from "./pr.shared";
import { commandCenterDigitKeyword, parsePullRequestNumber } from "./pr-query.shared";
import { handleSettingsGet, handleSettingsSet } from "./settings.server";
import { prSettingsGet, prSettingsSet } from "./settings.shared";

export default function contribute(plugin: PluginContext) {
  plugin.handle(prStatus, handlePrStatus);
  plugin.handle(prProjects, handlePrProjects);
  plugin.handle(prList, handlePrList);
  plugin.handle(prView, handlePrView);
  plugin.handle(prAttention, handlePrAttention);
  plugin.handle(prSettingsGet, handleSettingsGet);
  plugin.handle(prSettingsSet, handleSettingsSet);
  plugin.addSurface("main", MainSurface);
  plugin.addSidebarItem({
    id: "main",
    title: "Pull requests",
    icon: "GitPullRequest",
    surface: "main",
  });
  plugin.addCommandCenterItem({
    id: "open-github-pr",
    title: "Open GitHub PR",
    icon: "GitPullRequest",
    keywords: ["pr", "pull request", "github", "#", "pull", commandCenterDigitKeyword()],
    context: "global",
    onSelect({ openSurface }) {
      const number = parsePullRequestNumber(readCommandCenterQuery());
      openSurface("main");
      requestOpenPrModal({ number, autoSubmit: number !== null });
    },
  });
  return () => {};
}
