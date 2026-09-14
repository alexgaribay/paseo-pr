import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MainSurface } from "./client/main";
import { requestInboxFocus } from "./client/search-pr-request";
import { startAssignmentAutomation } from "./client/assignment-automation";

export default function contribute(client: PluginClientContext) {
  client.addSurface("main", MainSurface);
  client.addSidebarItem({
    id: "main",
    title: "Pull requests",
    icon: "GitPullRequest",
    surface: "main",
  });
  client.addCommandCenterItem({
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
  return startAssignmentAutomation(client);
}
