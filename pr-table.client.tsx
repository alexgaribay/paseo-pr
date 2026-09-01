import { Icon } from "@getpaseo/plugin/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo } from "react";
import { FlatList, Pressable, Text, View, type GestureResponderEvent } from "react-native";
import {
  formatAssignees,
  formatPullRequestStatus,
  formatUpdatedAt,
  pullRequestStatusTone,
  repositoryLabel,
  StatusBadge,
} from "./inbox-helpers.client";
import type { PullRequest } from "./pr.shared";
import { SkeletonBone, useSkeletonPulse } from "./skeleton.client";

const SKELETON_ROWS = [72, 58, 66, 48, 70, 54, 62, 44] as const;

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

export function PrTableSkeleton(props: { theme: PluginTheme; compact: boolean }) {
  const styles = useMemo(() => tableStyles(props.theme, props.compact), [props.compact, props.theme]);
  const pulse = useSkeletonPulse();

  return (
    <View style={styles.list} accessibilityLabel="Loading pull requests">
      {SKELETON_ROWS.map((titleWidth, index) => (
        <View key={index} style={styles.row}>
          <View style={styles.body}>
            <View style={styles.titleRow}>
              <SkeletonBone theme={props.theme} pulse={pulse} width={36} height={14} />
              <SkeletonBone theme={props.theme} pulse={pulse} height={14} style={{ flex: 1, maxWidth: titleWidth * 4 }} />
            </View>
            <SkeletonBone
              theme={props.theme}
              pulse={pulse}
              height={12}
              style={{ maxWidth: index % 2 === 0 ? 220 : 180 }}
            />
          </View>
          <View style={styles.trailing}>
            <SkeletonBone theme={props.theme} pulse={pulse} width={72} height={22} radius={999} />
            <SkeletonBone theme={props.theme} pulse={pulse} width={72} height={32} radius={8} />
          </View>
        </View>
      ))}
    </View>
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Show pull request ${pullRequest.number}`}
      onPress={() => props.onShow(pullRequest)}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        styles.row,
        (hovered || pressed) && styles.rowHover,
      ]}
    >
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.number}>#{pullRequest.number}</Text>
          <Text style={styles.title} numberOfLines={props.compact ? 2 : 1}>
            {pullRequest.title}
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={styles.trailing}>
        {pullRequest.waitingOnViewer ? (
          <StatusBadge theme={props.theme} label="Awaiting Review" tone="warning" />
        ) : (
          <StatusBadge theme={props.theme} label={status} tone={pullRequestStatusTone(pullRequest)} />
        )}
        <RowButton
          theme={props.theme}
          styles={styles}
          icon="FolderGit2"
          label="Open"
          accessibilityLabel={`Create workspace for pull request ${pullRequest.number}`}
          disabled={props.opening}
          onPress={() => props.onOpenWorkspace(pullRequest)}
        />
      </View>
    </Pressable>
  );
}

function RowButton(props: {
  theme: PluginTheme;
  styles: ReturnType<typeof tableStyles>;
  icon: string;
  label: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      disabled={props.disabled}
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        props.onPress();
      }}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        props.styles.button,
        (hovered || pressed) && props.styles.buttonHover,
        props.disabled ? props.styles.buttonDisabled : null,
      ]}
    >
      <Icon name={props.icon} size={14} color={props.theme.colors.foreground} />
      <Text style={props.styles.buttonLabel}>{props.label}</Text>
    </Pressable>
  );
}

function tableStyles(theme: PluginTheme, compact: boolean) {
  return {
    list: { flex: 1 },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      minHeight: compact ? 56 : 48,
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
    trailing: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "flex-end" as const,
      gap: 8,
      flexShrink: 0,
    },
    button: {
      minHeight: 32,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    buttonHover: { backgroundColor: theme.colors.surface1 },
    buttonDisabled: { opacity: 0.5 },
    buttonLabel: { color: theme.colors.foreground, fontSize: 12, fontWeight: "500" as const },
    empty: { paddingHorizontal: compact ? 16 : 24, paddingVertical: compact ? 28 : 40 },
    emptyText: { color: theme.colors.foregroundMuted, fontSize: 14 },
  };
}
