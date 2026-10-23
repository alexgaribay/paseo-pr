import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MainSurface } from "./client/main";
import { requestInboxFocus } from "./client/search-pr-request";
import { SettingsPanel } from "./client/settings-panel";
import { PullRequestSidebar } from "./client/sidebar";

export default function contribute(client: PluginClientContext) {
  const removeScreen = client.addScreen({ id: "main", title: "Pull requests", Component: MainSurface });
  const removeSettings = client.addSettingsScreen({
    id: "settings",
    title: "Pull requests",
    icon: "GitPullRequest",
    Component: ({ theme, layout }) => <SettingsPanel theme={theme} compact={layout.compact} />,
  });
  const removeSidebar = client.addSidebarHeaderItem({
    id: "main",
    title: "Pull requests",
    Component: PullRequestSidebar,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "search-for-pr",
    title: "Search for PR",
    icon: "Search",
    keywords: ["search", "pr", "pull request", "github"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "main" });
      requestInboxFocus();
    },
  });
  return () => {
    removeCommand();
    removeSidebar();
    removeSettings();
    removeScreen();
  };
}
