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
import { UserAvatar } from "./avatar.client";
import type { PullRequest } from "./pr.shared";
import { SkeletonBone, useSkeletonPulse } from "./skeleton.client";

const SKELETON_ROWS = [72, 58, 66, 48, 70, 54, 62, 44] as const;

export function PrTable(props: {
  theme: PluginTheme;
  compact: boolean;
  pullRequests: PullRequest[];
  opening: boolean;
  workspaceIdFor: (pullRequest: PullRequest) => string | null;
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
          workspaceId={props.workspaceIdFor(item)}
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
            <View style={styles.metaRow}>
              <SkeletonBone theme={props.theme} pulse={pulse} width={index % 2 === 0 ? 88 : 72} height={12} />
              <SkeletonBone theme={props.theme} pulse={pulse} width={14} height={14} radius={7} />
              <SkeletonBone theme={props.theme} pulse={pulse} width={64} height={12} />
            </View>
          </View>
          <View style={styles.trailing}>
            <SkeletonBone theme={props.theme} pulse={pulse} width={72} height={22} radius={999} />
            <SkeletonBone theme={props.theme} pulse={pulse} width={132} height={32} radius={8} />
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
  workspaceId: string | null;
  theme: PluginTheme;
  onShow: (pullRequest: PullRequest) => void;
  onOpenWorkspace: (pullRequest: PullRequest) => void;
  styles: ReturnType<typeof tableStyles>;
}) {
  const { pullRequest, styles } = props;
  const status = formatPullRequestStatus(pullRequest);
  const assignees = formatAssignees(pullRequest);
  const updatedAt = formatUpdatedAt(pullRequest.updatedAt);

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
        <View style={styles.metaRow}>
          <Text style={styles.meta} numberOfLines={1}>
            {repositoryLabel(pullRequest)}
          </Text>
          <Text style={styles.metaDot}>·</Text>
          <View style={styles.author}>
            <UserAvatar theme={props.theme} host={pullRequest.host} login={pullRequest.author} size={14} />
            <Text style={styles.meta} numberOfLines={1}>
              {pullRequest.author}
            </Text>
          </View>
          {assignees ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.meta} numberOfLines={1}>
                → {assignees}
              </Text>
            </>
          ) : null}
          {pullRequest.headRefName ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {pullRequest.headRefName}
              </Text>
            </>
          ) : null}
          {updatedAt ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {updatedAt}
              </Text>
            </>
          ) : null}
        </View>
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
          icon={props.workspaceId ? "ArrowRight" : "FolderGit2"}
          label={props.workspaceId ? "Jump to Workspace" : "Create Workspace"}
          accessibilityLabel={
            props.workspaceId
              ? `Jump to workspace for pull request ${pullRequest.number}`
              : `Create workspace for pull request ${pullRequest.number}`
          }
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
      <Icon name={props.icon} size={14} color={props.theme.colors.foregroundMuted} />
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
    number: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16 },
    title: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const, flex: 1 },
    metaRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      minWidth: 0,
    },
    author: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
      flexShrink: 1,
      minWidth: 0,
    },
    meta: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16, flexShrink: 1 },
    metaDot: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16, flexShrink: 0 },
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
      borderColor: "transparent",
      backgroundColor: "transparent",
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    buttonHover: { backgroundColor: theme.colors.surface2, borderColor: theme.colors.border },
    buttonDisabled: { opacity: 0.5 },
    buttonLabel: { color: theme.colors.foreground, fontSize: 12, fontWeight: "500" as const },
    empty: { paddingHorizontal: compact ? 16 : 24, paddingVertical: compact ? 28 : 40 },
    emptyText: { color: theme.colors.foregroundMuted, fontSize: 14 },
  };
}
