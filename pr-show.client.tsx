import { useRpc, type PluginTheme } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { UserAvatar } from "./avatar.client";
import {
  formatAssignees,
  formatPullRequestStatus,
  formatUpdatedAt,
  pullRequestStatusTone,
  repositoryLabel,
  StatusBadge,
} from "./inbox-helpers.client";
import { MarkdownBody } from "./markdown.client";
import { SkeletonBone, useSkeletonPulse } from "./skeleton.client";
import { prView, type PullRequest, type PullRequestComment } from "./pr.shared";

export function PrShowPanel(props: {
  theme: PluginTheme;
  compact: boolean;
  platform: "ios" | "android" | "web";
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
  const description = detail?.body.trim() ?? "";
  const comments = detail?.comments ?? [];
  const filesChanged =
    detail?.changedFiles != null ? `${detail.changedFiles} ${detail.changedFiles === 1 ? "file" : "files"}` : "";
  const branch =
    pullRequest.headRefName && detail?.baseRefName
      ? `${detail.baseRefName} ← ${pullRequest.headRefName}`
      : pullRequest.headRefName;
  const baseUrl = `https://${pullRequest.host}/${pullRequest.owner}/${pullRequest.repo}/`;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.headingRow}>
        <UserAvatar theme={props.theme} host={pullRequest.host} login={pullRequest.author} size={28} />
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
      <View style={styles.people}>
        <PersonChip theme={props.theme} host={pullRequest.host} login={pullRequest.author} />
        {pullRequest.assignees
          .filter((login) => login.toLowerCase() !== pullRequest.author.toLowerCase())
          .map((login) => (
            <PersonChip key={login} theme={props.theme} host={pullRequest.host} login={login} />
          ))}
      </View>
      <Text style={styles.meta}>
        {[repositoryLabel(pullRequest), assignees ? `→ ${assignees}` : null, branch, filesChanged]
          .filter((part): part is string => Boolean(part))
          .join(" · ")}
        {detail && (detail.additions !== null || detail.deletions !== null) ? (
          <>
            {" · "}
            {detail.additions !== null ? <Text style={styles.statAdd}>+{detail.additions}</Text> : null}
            {detail.additions !== null && detail.deletions !== null ? " " : null}
            {detail.deletions !== null ? <Text style={styles.statDel}>−{detail.deletions}</Text> : null}
          </>
        ) : null}
        {` · Updated ${formatUpdatedAt(pullRequest.updatedAt)}`}
      </Text>

      <Text style={styles.section}>Description</Text>
      {detailQuery.isLoading ? (
        <ShowMarkdownSkeleton theme={props.theme} compact={props.compact} />
      ) : error ? (
        <Text style={styles.danger}>{error}</Text>
      ) : description.length > 0 ? (
        <View style={styles.card}>
          <MarkdownBody
            theme={props.theme}
            compact={props.compact}
            platform={props.platform}
            source={description}
            host={pullRequest.host}
            baseUrl={baseUrl}
          />
        </View>
      ) : (
        <Text style={styles.muted}>No description.</Text>
      )}

      <Text style={styles.section}>Conversation</Text>
      {detailQuery.isLoading ? (
        <ShowCommentsSkeleton theme={props.theme} compact={props.compact} />
      ) : comments.length === 0 ? (
        <Text style={styles.muted}>No comments yet.</Text>
      ) : (
        comments.map((comment) => (
          <CommentCard
            key={comment.id}
            theme={props.theme}
            compact={props.compact}
            platform={props.platform}
            host={pullRequest.host}
            baseUrl={baseUrl}
            styles={styles}
            comment={comment}
          />
        ))
      )}
    </ScrollView>
  );
}

function ShowMarkdownSkeleton(props: { theme: PluginTheme; compact: boolean }) {
  const pulse = useSkeletonPulse();
  return (
    <View
      accessibilityLabel="Loading description"
      style={{
        backgroundColor: props.theme.colors.surface1,
        borderWidth: 1,
        borderColor: props.theme.colors.border,
        borderRadius: 8,
        padding: 12,
        gap: 8,
      }}
    >
      <SkeletonBone theme={props.theme} pulse={pulse} height={14} />
      <SkeletonBone theme={props.theme} pulse={pulse} height={14} style={{ maxWidth: props.compact ? 220 : 360 }} />
      <SkeletonBone theme={props.theme} pulse={pulse} height={14} style={{ maxWidth: props.compact ? 180 : 280 }} />
    </View>
  );
}

function ShowCommentsSkeleton(props: { theme: PluginTheme; compact: boolean }) {
  const pulse = useSkeletonPulse();
  return (
    <View accessibilityLabel="Loading conversation" style={{ gap: 12 }}>
      {[0, 1].map((index) => (
        <View
          key={index}
          style={{
            backgroundColor: props.theme.colors.surface1,
            borderWidth: 1,
            borderColor: props.theme.colors.border,
            borderRadius: 8,
            padding: 12,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <SkeletonBone theme={props.theme} pulse={pulse} width={22} height={22} radius={11} />
            <SkeletonBone theme={props.theme} pulse={pulse} height={12} style={{ flex: 1, maxWidth: 180 }} />
          </View>
          <SkeletonBone theme={props.theme} pulse={pulse} height={14} />
          <SkeletonBone theme={props.theme} pulse={pulse} height={14} style={{ maxWidth: index === 0 ? 240 : 200 }} />
        </View>
      ))}
    </View>
  );
}

function PersonChip(props: { theme: PluginTheme; host: string; login: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <UserAvatar theme={props.theme} host={props.host} login={props.login} size={18} />
      <Text style={{ color: props.theme.colors.foregroundMuted, fontSize: 12 }}>{props.login}</Text>
    </View>
  );
}

function CommentCard(props: {
  theme: PluginTheme;
  compact: boolean;
  platform: "ios" | "android" | "web";
  host: string;
  baseUrl: string;
  styles: ReturnType<typeof showStyles>;
  comment: PullRequestComment;
}) {
  const { comment, styles } = props;
  const kind = formatCommentKind(comment);
  const body = comment.body.trim();
  return (
    <View style={styles.card}>
      <View style={styles.commentHeader}>
        <UserAvatar theme={props.theme} host={props.host} login={comment.author} size={22} />
        <Text style={styles.commentAuthor}>{comment.author}</Text>
        <Text style={styles.commentMeta} numberOfLines={1}>
          {[kind, formatUpdatedAt(comment.createdAt), comment.path]
            .filter((part): part is string => Boolean(part))
            .join(" · ")}
        </Text>
      </View>
      {body.length > 0 ? (
        <MarkdownBody
          theme={props.theme}
          compact={props.compact}
          platform={props.platform}
          source={body}
          host={props.host}
          baseUrl={props.baseUrl}
        />
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
    people: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, gap: 10 },
    meta: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16 },
    statAdd: { color: theme.colors.statusSuccess, fontSize: 12, lineHeight: 16, fontWeight: "500" as const },
    statDel: { color: theme.colors.statusDanger, fontSize: 12, lineHeight: 16, fontWeight: "500" as const },
    section: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" as const, marginTop: 8 },
    card: {
      backgroundColor: theme.colors.surface1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      padding: 12,
      gap: 8,
    },
    commentHeader: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    commentAuthor: { color: theme.colors.foreground, fontSize: 12, fontWeight: "500" as const, flexShrink: 0 },
    commentMeta: { color: theme.colors.foregroundMuted, fontSize: 12, flex: 1 },
    muted: { color: theme.colors.foregroundMuted, fontSize: 14 },
    danger: { color: theme.colors.statusDanger, fontSize: 14 },
  };
}
