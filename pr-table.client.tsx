import { Icon } from "@getpaseo/plugin/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { formatPullRequestStatus, formatUpdatedAt, repositoryLabel } from "./inbox-helpers.client";
import type { PullRequest } from "./pr.shared";

export function PrTable(props: {
  theme: PluginTheme;
  compact: boolean;
  pullRequests: PullRequest[];
  opening: boolean;
  onOpenWorkspace: (pullRequest: PullRequest) => void;
}) {
  const styles = useMemo(() => tableStyles(props.theme, props.compact), [props.compact, props.theme]);

  return (
    <View style={styles.table}>
      {props.compact ? null : (
        <View style={styles.headerRow} accessibilityRole="header">
          <Text style={[styles.headerCell, styles.prCol]}>Pull request</Text>
          <Text style={[styles.headerCell, styles.repoCol]}>Repository</Text>
          <Text style={[styles.headerCell, styles.authorCol]}>Author</Text>
          <Text style={[styles.headerCell, styles.statusCol]}>Status</Text>
          <Text style={[styles.headerCell, styles.updatedCol]}>Updated</Text>
          <View style={styles.actionCol} />
        </View>
      )}
      <FlatList
        data={props.pullRequests}
        keyExtractor={(item) => `${item.projectId}:${item.number}`}
        style={styles.list}
        renderItem={({ item, index }) => (
          <TableRow
            pullRequest={item}
            striped={index % 2 === 1}
            compact={props.compact}
            styles={styles}
            opening={props.opening}
            accentForeground={props.theme.colors.accentForeground}
            onOpenWorkspace={props.onOpenWorkspace}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No pull requests match these filters.</Text>
          </View>
        }
      />
    </View>
  );
}

function TableRow(props: {
  pullRequest: PullRequest;
  striped: boolean;
  compact: boolean;
  opening: boolean;
  accentForeground: string;
  onOpenWorkspace: (pullRequest: PullRequest) => void;
  styles: ReturnType<typeof tableStyles>;
}) {
  const { pullRequest, styles } = props;
  const status = formatPullRequestStatus(pullRequest);

  if (props.compact) {
    return (
      <View style={[styles.row, props.striped ? styles.rowStriped : null, styles.compactRow]}>
        <View style={styles.compactBody}>
          <Text style={styles.title} numberOfLines={2}>
            #{pullRequest.number} {pullRequest.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {repositoryLabel(pullRequest)} · {pullRequest.author} · {status}
            {pullRequest.headRefName ? ` · ${pullRequest.headRefName}` : ""}
          </Text>
        </View>
        <OpenWorkspaceButton
          number={pullRequest.number}
          opening={props.opening}
          styles={styles}
          accentForeground={props.accentForeground}
          onPress={() => props.onOpenWorkspace(pullRequest)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.row, props.striped ? styles.rowStriped : null]}>
      <View style={styles.prCol}>
        <Text style={styles.title} numberOfLines={2}>
          #{pullRequest.number} {pullRequest.title}
        </Text>
        {pullRequest.headRefName ? (
          <Text style={styles.meta} numberOfLines={1}>
            {pullRequest.headRefName}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.cell, styles.repoCol]} numberOfLines={1}>
        {repositoryLabel(pullRequest)}
      </Text>
      <Text style={[styles.cell, styles.authorCol]} numberOfLines={1}>
        {pullRequest.author}
      </Text>
      <Text style={[styles.cell, styles.statusCol]} numberOfLines={1}>
        {status}
      </Text>
      <Text style={[styles.cell, styles.updatedCol]} numberOfLines={1}>
        {formatUpdatedAt(pullRequest.updatedAt)}
      </Text>
      <View style={styles.actionCol}>
        <OpenWorkspaceButton
          number={pullRequest.number}
          opening={props.opening}
          styles={styles}
          accentForeground={props.accentForeground}
          onPress={() => props.onOpenWorkspace(pullRequest)}
        />
      </View>
    </View>
  );
}

function OpenWorkspaceButton(props: {
  number: number;
  opening: boolean;
  accentForeground: string;
  styles: ReturnType<typeof tableStyles>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Create workspace for pull request ${props.number}`}
      onPress={props.onPress}
      style={props.styles.action}
      disabled={props.opening}
    >
      <View style={props.styles.actionInner}>
        <Icon name="FolderGit2" size={14} color={props.accentForeground} />
        <Text style={props.styles.actionLabel}>Open workspace</Text>
      </View>
    </Pressable>
  );
}

function tableStyles(theme: PluginTheme, compact: boolean) {
  return {
    table: {
      flex: 1,
      marginHorizontal: compact ? 12 : 24,
      marginBottom: compact ? 12 : 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      overflow: "hidden" as const,
      backgroundColor: theme.colors.surface1,
    },
    list: { flex: 1 },
    headerRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: theme.colors.surface2,
      borderBottomWidth: 1,
      borderColor: theme.colors.border,
    },
    headerCell: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      fontWeight: "600" as const,
      letterSpacing: 0.3,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingHorizontal: compact ? 12 : 16,
      paddingVertical: compact ? 12 : 14,
      borderBottomWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
    },
    rowStriped: { backgroundColor: theme.colors.surface0 },
    compactRow: { alignItems: "flex-start" as const },
    compactBody: { flex: 1, gap: 4, minWidth: 0 },
    prCol: { flex: 3, minWidth: 0, gap: 2 },
    repoCol: { flex: 1.4, minWidth: 0 },
    authorCol: { flex: 1, minWidth: 0 },
    statusCol: { flex: 0.8, minWidth: 0 },
    updatedCol: { flex: 1, minWidth: 0 },
    actionCol: { width: 150, alignItems: "flex-end" as const },
    title: { color: theme.colors.foreground, fontWeight: "500" as const },
    cell: { color: theme.colors.foreground },
    meta: { color: theme.colors.foregroundMuted, fontSize: 12 },
    action: {
      backgroundColor: theme.colors.accent,
      paddingHorizontal: 10,
      paddingVertical: compact ? 6 : 8,
      borderRadius: 8,
    },
    actionInner: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
    actionLabel: { color: theme.colors.accentForeground, fontWeight: "600" as const, fontSize: 13 },
    empty: { paddingHorizontal: 16, paddingVertical: compact ? 28 : 40 },
    emptyText: { color: theme.colors.foregroundMuted },
  };
}
