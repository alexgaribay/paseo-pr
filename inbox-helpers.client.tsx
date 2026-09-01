import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { PullRequest, PullRequestPersonFilter, PullRequestState } from "./pr.shared";

export function ChipRow(props: {
  styles: {
    row: object;
    chip: object;
    chipSelected: object;
    chipLabel: object;
    chipLabelSelected: object;
  };
  items: { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => void;
  groupLabel?: string;
}) {
  return (
    <View style={props.styles.row}>
      {props.items.map((item) => {
        const selected = item.id === props.selected;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={props.groupLabel ? `${props.groupLabel}: ${item.label}` : item.label}
            onPress={() => props.onSelect(item.id)}
            style={[props.styles.chip, selected ? props.styles.chipSelected : null]}
          >
            <Text style={selected ? props.styles.chipLabelSelected : props.styles.chipLabel}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function StatusBadge(props: {
  theme: PluginTheme;
  label: string;
  tone: "success" | "warning" | "danger" | "muted";
}) {
  const color =
    props.tone === "success"
      ? props.theme.colors.statusSuccess
      : props.tone === "warning"
        ? props.theme.colors.statusWarning
        : props.tone === "danger"
          ? props.theme.colors.statusDanger
          : props.theme.colors.foregroundMuted;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: props.theme.colors.border,
        backgroundColor: props.theme.colors.surface2,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color, fontSize: 12 }}>{props.label}</Text>
    </View>
  );
}

export function CountBadge(props: {
  theme: PluginTheme;
  count: number;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  if (props.count <= 0) return null;
  const label = props.count > 99 ? "99+" : String(props.count);
  const body = (
    <View
      style={{
        minWidth: 18,
        height: 18,
        paddingHorizontal: 6,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: props.theme.colors.surface2,
        borderWidth: 1,
        borderColor: props.theme.colors.border,
      }}
    >
      <Text style={{ color: props.theme.colors.foreground, fontSize: 11, fontWeight: "500" }}>{label}</Text>
    </View>
  );
  if (!props.onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={props.accessibilityLabel} onPress={props.onPress}>
      {body}
    </Pressable>
  );
}

export function isPersonFilter(value: string): value is PullRequestPersonFilter {
  return value === "anyone" || value === "me";
}

export function isPullRequestState(value: string): value is PullRequestState {
  return value === "open" || value === "closed" || value === "merged";
}

export function formatPullRequestStatus(pullRequest: PullRequest): string {
  if (pullRequest.isDraft && pullRequest.state === "open") return "Draft";
  if (pullRequest.state === "open") return "Open";
  if (pullRequest.state === "closed") return "Closed";
  if (pullRequest.state === "merged") return "Merged";
  return pullRequest.state;
}

export function pullRequestStatusTone(pullRequest: PullRequest): "success" | "warning" | "danger" | "muted" {
  if (pullRequest.waitingOnViewer) return "warning";
  if (pullRequest.isDraft && pullRequest.state === "open") return "muted";
  if (pullRequest.state === "open") return "success";
  if (pullRequest.state === "merged") return "warning";
  return "muted";
}

export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function repositoryLabel(pullRequest: PullRequest): string {
  return `${pullRequest.owner}/${pullRequest.repo}`;
}

export function formatAssignees(pullRequest: PullRequest): string {
  if (pullRequest.assignees.length === 0) return "";
  if (pullRequest.assignees.length === 1) return pullRequest.assignees[0];
  return `${pullRequest.assignees[0]} +${pullRequest.assignees.length - 1}`;
}
