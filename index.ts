import type { PluginContext } from "@getpaseo/plugin";
import { MainSurface } from "./main.client";
import { requestOpenPrModal } from "./open-pr-request.client";
import { handlePrList, handlePrProjects, handlePrStatus, handlePrView } from "./pr.server";
import { prList, prProjects, prStatus, prView } from "./pr.shared";
import { handleSettingsGet, handleSettingsSet } from "./settings.server";
import { prSettingsGet, prSettingsSet } from "./settings.shared";

export default function contribute(plugin: PluginContext) {
  plugin.handle(prStatus, handlePrStatus);
  plugin.handle(prProjects, handlePrProjects);
  plugin.handle(prList, handlePrList);
  plugin.handle(prView, handlePrView);
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
    keywords: ["pr", "pull request", "github", "#"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface("main");
      requestOpenPrModal();
    },
  });
  return () => {};
}
