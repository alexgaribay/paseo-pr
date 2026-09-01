import { Icon } from "@getpaseo/plugin/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import {
  formatAssignees,
  formatPullRequestStatus,
  formatUpdatedAt,
  pullRequestStatusTone,
  repositoryLabel,
  StatusBadge,
} from "./inbox-helpers.client";
import type { PullRequest } from "./pr.shared";

export function PrTable(props: {
  theme: PluginTheme;
  compact: boolean;
  pullRequests: PullRequest[];
  opening: boolean;
  onShow: (pullRequest: PullRequest) => void;
  onOpenWorkspace: (pullRequest: PullRequest) => void;
}) {
  const styles = useMemo(() => tableStyles(props.theme, props.compact), [props.compact, props.theme]);

  return (
    <FlatList
      data={props.pullRequests}
      keyExtractor={(item) => `${item.projectId}:${item.number}`}
      style={styles.list}
      renderItem={({ item }) => (
        <TableRow
          pullRequest={item}
          compact={props.compact}
          styles={styles}
          theme={props.theme}
          opening={props.opening}
          onShow={props.onShow}
          onOpenWorkspace={props.onOpenWorkspace}
        />
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No pull requests match these filters.</Text>
        </View>
      }
    />
  );
}

function TableRow(props: {
  pullRequest: PullRequest;
  compact: boolean;
  opening: boolean;
  theme: PluginTheme;
  onShow: (pullRequest: PullRequest) => void;
  onOpenWorkspace: (pullRequest: PullRequest) => void;
  styles: ReturnType<typeof tableStyles>;
}) {
  const { pullRequest, styles } = props;
  const status = formatPullRequestStatus(pullRequest);
  const assignees = formatAssignees(pullRequest);
  const meta = [
    repositoryLabel(pullRequest),
    pullRequest.author,
    assignees ? `→ ${assignees}` : null,
    pullRequest.headRefName,
    formatUpdatedAt(pullRequest.updatedAt),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show pull request ${pullRequest.number}`}
        onPress={() => props.onShow(pullRequest)}
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
          styles.body,
          (hovered || pressed) && styles.rowHover,
        ]}
      >
        <View style={styles.titleRow}>
          <Text style={styles.number}>#{pullRequest.number}</Text>
          <Text style={styles.title} numberOfLines={props.compact ? 2 : 1}>
            {pullRequest.title}
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </Pressable>
      <View style={styles.trailing}>
        {pullRequest.waitingOnViewer ? (
          <StatusBadge theme={props.theme} label="Awaiting Review" tone="warning" />
        ) : (
          <StatusBadge theme={props.theme} label={status} tone={pullRequestStatusTone(pullRequest)} />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Create workspace for pull request ${pullRequest.number}`}
          disabled={props.opening}
          onPress={() => props.onOpenWorkspace(pullRequest)}
          style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
            styles.actionInner,
            (hovered || pressed) && styles.rowHover,
          ]}
        >
          <Icon name="FolderGit2" size={14} color={props.theme.colors.foregroundMuted} />
          {props.compact ? null : <Text style={styles.actionLabel}>Open</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function tableStyles(theme: PluginTheme, compact: boolean) {
  return {
    list: { flex: 1 },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      minHeight: compact ? 52 : 44,
      paddingHorizontal: compact ? 16 : 24,
      paddingVertical: compact ? 10 : 8,
      borderBottomWidth: 1,
      borderColor: theme.colors.border,
    },
    rowHover: { backgroundColor: theme.colors.surface1 },
    body: { flex: 1, gap: 4, minWidth: 0 },
    titleRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, minWidth: 0 },
    number: { color: theme.colors.foregroundMuted, fontSize: 14, fontWeight: "500" as const },
    title: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const, flex: 1 },
    meta: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16 },
    trailing: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, flexShrink: 0 },
    actionInner: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, paddingHorizontal: 4 },
    actionLabel: { color: theme.colors.foregroundMuted, fontSize: 12 },
    empty: { paddingHorizontal: compact ? 16 : 24, paddingVertical: compact ? 28 : 40 },
    emptyText: { color: theme.colors.foregroundMuted, fontSize: 14 },
  };
}
