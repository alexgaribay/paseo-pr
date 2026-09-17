import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { PullRequest, PullRequestPersonFilter, PullRequestState } from "../shared/pr";

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
  const tinted = props.tone !== "muted" && isHexColor(color);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: tinted ? withAlpha(color, "59") : props.theme.colors.border,
        backgroundColor: tinted ? withAlpha(color, "26") : props.theme.colors.surface2,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color, fontSize: 11, fontWeight: "500", lineHeight: 14 }}>{props.label}</Text>
    </View>
  );
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/u.test(value);
}

function withAlpha(color: string, alphaHex: string): string {
  return `${color}${alphaHex}`;
}

export function CountBadge(props: {
  theme: PluginTheme;
  count: number;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  if (props.count <= 0) return null;
  const label = props.count > 99 ? "99+" : String(props.count);
  const warning = props.theme.colors.statusWarning;
  const tinted = isHexColor(warning);
  const body = (
    <View
      style={{
        minWidth: 18,
        height: 18,
        paddingHorizontal: 6,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tinted ? withAlpha(warning, "26") : props.theme.colors.surface2,
        borderWidth: 1,
        borderColor: tinted ? withAlpha(warning, "59") : props.theme.colors.border,
      }}
    >
      <Text style={{ color: tinted ? warning : props.theme.colors.foreground, fontSize: 11, fontWeight: "500" }}>{label}</Text>
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
  if (pullRequest.waitingOnViewer || pullRequest.needsRereview) return "warning";
  if (pullRequest.isDraft && pullRequest.state === "open") return "muted";
  if (pullRequest.state === "open") return "success";
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
