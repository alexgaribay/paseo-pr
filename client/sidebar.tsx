import { useRpc, type PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { prAttention, prStatus } from "../shared/pr";
import { DEFAULT_REFRESH_INTERVAL_MINUTES, prSettingsGet, refreshIntervalMs } from "../shared/settings";
import { CountBadge } from "./inbox-helpers";

export function PullRequestSidebar({ theme, currentScreen, openScreen }: PluginSidebarItemProps) {
  const fetchStatus = useRpc(prStatus);
  const fetchSettings = useRpc(prSettingsGet);
  const fetchAttention = useRpc(prAttention);
  const settingsQuery = useQuery({
    queryKey: ["pr.settings"],
    queryFn: () => fetchSettings({}),
  });
  const statusQuery = useQuery({
    queryKey: ["pr.status"],
    queryFn: () => fetchStatus({}),
  });
  const attentionQuery = useQuery({
    queryKey: ["pr.attention"],
    queryFn: () => fetchAttention({}),
    enabled: statusQuery.data?.kind === "ok",
    refetchInterval: refreshIntervalMs(settingsQuery.data?.refreshIntervalMinutes ?? DEFAULT_REFRESH_INTERVAL_MINUTES),
  });
  const count = attentionQuery.data?.kind === "ok" ? attentionQuery.data.count : 0;
  const accessibilityLabel = `${count} pull requests need your review attention`;
  return (
    <SidebarRow
      icon="GitPullRequest"
      active={currentScreen?.screenId === "main"}
      onPress={() => openScreen({ screenId: "main" })}
      trailing={count > 0 ? (
        <View accessible accessibilityLabel={accessibilityLabel}>
          <CountBadge theme={theme} count={count} accessibilityLabel={accessibilityLabel} />
        </View>
      ) : undefined}
    />
  );
}
