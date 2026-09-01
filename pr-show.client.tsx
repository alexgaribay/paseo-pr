import { useRpc, type PluginTheme } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import {
  formatAssignees,
  formatPullRequestStatus,
  formatUpdatedAt,
  pullRequestStatusTone,
  repositoryLabel,
  StatusBadge,
} from "./inbox-helpers.client";
import { prView, type PullRequest, type PullRequestComment, type PullRequestDetail } from "./pr.shared";

export function PrShowPanel(props: {
  theme: PluginTheme;
  compact: boolean;
  pullRequest: PullRequest;
}) {
  const fetchPullRequest = useRpc(prView);
  const styles = useMemo(() => showStyles(props.theme, props.compact), [props.compact, props.theme]);
  const detailQuery = useQuery({
    queryKey: ["pr.view", props.pullRequest.projectId, props.pullRequest.number],
    queryFn: () =>
      fetchPullRequest({
        projectId: props.pullRequest.projectId,
        number: props.pullRequest.number,
      }),
  });

  const result = detailQuery.data;
  const detail = result?.kind === "ok" ? result.pullRequest : null;
  const error =
    result?.kind === "unavailable" || result?.kind === "error" || result?.kind === "not_found" ? result.message : null;
  const pullRequest = detail ?? props.pullRequest;
  const status = formatPullRequestStatus(pullRequest);
  const assignees = formatAssignees(pullRequest);
  const description = detail ? displayMarkdown(detail.body) : "";
  const comments = detail?.comments ?? [];
  const stats = detail ? formatDiffStats(detail) : "";
  const branch =
    pullRequest.headRefName && detail?.baseRefName
      ? `${detail.baseRefName} ← ${pullRequest.headRefName}`
      : pullRequest.headRefName;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.headingRow}>
        <Text style={styles.number}>#{pullRequest.number}</Text>
        <Text style={styles.title}>{pullRequest.title}</Text>
      </View>
      <View style={styles.badges}>
        {pullRequest.waitingOnViewer ? (
          <StatusBadge theme={props.theme} label="Awaiting Review" tone="warning" />
        ) : (
          <StatusBadge theme={props.theme} label={status} tone={pullRequestStatusTone(pullRequest)} />
        )}
        {(detail?.labels ?? []).map((label) => (
          <StatusBadge key={label} theme={props.theme} label={label} tone="muted" />
        ))}
      </View>
      <Text style={styles.meta}>
        {[
          repositoryLabel(pullRequest),
          pullRequest.author,
          assignees ? `→ ${assignees}` : null,
          branch,
          stats,
          `Updated ${formatUpdatedAt(pullRequest.updatedAt)}`,
        ]
          .filter((part): part is string => Boolean(part))
          .join(" · ")}
      </Text>

      <Text style={styles.section}>Description</Text>
      {detailQuery.isLoading ? (
        <ActivityIndicator color={props.theme.colors.accent} />
      ) : error ? (
        <Text style={styles.danger}>{error}</Text>
      ) : description.length > 0 ? (
        <View style={styles.card}>
          <Text selectable style={styles.body}>
            {description}
          </Text>
        </View>
      ) : (
        <Text style={styles.muted}>No description.</Text>
      )}

      <Text style={styles.section}>Conversation</Text>
      {detailQuery.isLoading ? (
        <ActivityIndicator color={props.theme.colors.accent} />
      ) : comments.length === 0 ? (
        <Text style={styles.muted}>No comments yet.</Text>
      ) : (
        comments.map((comment) => (
          <CommentCard key={comment.id} theme={props.theme} styles={styles} comment={comment} />
        ))
      )}
    </ScrollView>
  );
}

function CommentCard(props: {
  theme: PluginTheme;
  styles: ReturnType<typeof showStyles>;
  comment: PullRequestComment;
}) {
  const { comment, styles } = props;
  const kind = formatCommentKind(comment);
  return (
    <View style={styles.card}>
      <Text style={styles.commentMeta}>
        {[comment.author, kind, formatUpdatedAt(comment.createdAt), comment.path]
          .filter((part): part is string => Boolean(part))
          .join(" · ")}
      </Text>
      {displayMarkdown(comment.body).length > 0 ? (
        <Text selectable style={styles.body}>
          {displayMarkdown(comment.body)}
        </Text>
      ) : (
        <Text style={styles.muted}>{kind ?? "Comment"}</Text>
      )}
    </View>
  );
}

function formatCommentKind(comment: PullRequestComment): string | null {
  if (comment.kind === "line") return "on diff";
  if (comment.kind !== "review") return null;
  if (comment.reviewState === "APPROVED") return "approved";
  if (comment.reviewState === "CHANGES_REQUESTED") return "requested changes";
  if (comment.reviewState === "DISMISSED") return "dismissed review";
  return "reviewed";
}

function formatDiffStats(detail: PullRequestDetail): string {
  const parts: string[] = [];
  if (detail.additions !== null) parts.push(`+${detail.additions}`);
  if (detail.deletions !== null) parts.push(`-${detail.deletions}`);
  if (detail.changedFiles !== null) {
    parts.push(`${detail.changedFiles} ${detail.changedFiles === 1 ? "file" : "files"}`);
  }
  return parts.join(" ");
}

function displayMarkdown(body: string): string {
  return body.replace(/<!--[\s\S]*?-->/gu, "").trim();
}

function showStyles(theme: PluginTheme, compact: boolean) {
  return {
    scroll: { flex: 1 },
    content: {
      paddingHorizontal: compact ? 16 : 24,
      paddingTop: 4,
      paddingBottom: compact ? 28 : 40,
      gap: 12,
    },
    headingRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 8 },
    number: { color: theme.colors.foregroundMuted, fontSize: 16, fontWeight: "500" as const, paddingTop: 2 },
    title: { color: theme.colors.foreground, fontSize: 16, fontWeight: "500" as const, flex: 1 },
    badges: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, gap: 6 },
    meta: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16 },
    section: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const, marginTop: 8 },
    card: {
      backgroundColor: theme.colors.surface1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      padding: 12,
      gap: 8,
    },
    commentMeta: { color: theme.colors.foregroundMuted, fontSize: 12 },
    body: { color: theme.colors.foreground, fontSize: 14, lineHeight: 20 },
    muted: { color: theme.colors.foregroundMuted, fontSize: 14 },
    danger: { color: theme.colors.statusDanger, fontSize: 14 },
  };
}
