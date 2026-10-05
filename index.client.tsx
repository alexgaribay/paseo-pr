import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MainSurface } from "./client/main";
import { requestInboxFocus } from "./client/search-pr-request";
import { SettingsPanel } from "./client/settings-panel";

export default function contribute(client: PluginClientContext) {
  const removeSurface = client.addSurface("main", MainSurface);
  const removeSettings = client.addSettingsScreen({
    id: "settings",
    title: "Pull requests",
    icon: "GitPullRequest",
    Component: ({ theme, layout }) => <SettingsPanel theme={theme} compact={layout.compact} />,
  });
  const removeSidebar = client.addSidebarItem({
    id: "main",
    title: "Pull requests",
    icon: "GitPullRequest",
    surface: "main",
  });
  const removeCommand = client.addCommandCenterItem({
    id: "search-for-pr",
    title: "Search for PR",
    icon: "Search",
    keywords: ["search", "pr", "pull request", "github"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface("main");
      requestInboxFocus();
    },
  });
  return () => {
    removeCommand();
    removeSidebar();
    removeSettings();
    removeSurface();
  };
}
