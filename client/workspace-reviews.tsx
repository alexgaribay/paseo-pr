import type { PluginTheme } from "@getpaseo/plugin";
import {
  useRpc,
  type PluginButtonContentProps,
  type PluginClientContext,
  type PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { ExternalLink, Icon, ScrollView, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { prWorkspaceReviewAction, prWorkspaceReviews, type WorkspaceReview, type WorkspaceReviewAction } from "../shared/workspace-reviews";

const QUERY_KEY = ["pr.workspace-reviews"];

export function registerWorkspaceReviewUi(client: PluginClientContext): () => void {
  return client.addWorkspacePanel({
    id: "pr-review-updates",
    title: "PR review updates",
    icon: "GitPullRequest",
    Component: WorkspaceReviewPanel,
  });
}

function useWorkspaceReviews() {
  const fetchReviews = useRpc(prWorkspaceReviews);
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchReviews({}),
    refetchInterval: 60_000,
  });
}

export function WorkspaceReviewMonitor({ client }: { client: PluginClientContext }) {
  const query = useWorkspaceReviews();
  const status = query.isError || query.failureCount > 0 ? undefined : query.data;
  useEffect(() => {
    const registrations = (status?.reviews ?? []).map((review) => client.addHeaderButton({
      id: `pr-review-${review.workspaceId}`,
      workspaceId: review.workspaceId,
      button: {
        title: `PR #${review.number} ${review.reasons.includes("head_changed") ? "has updated code" : "has a new review request"}. Fetch safely and re-review.`,
        icon: ({ theme, size }) => <Icon name="RefreshCw" size={size} color={theme.colors.statusWarning} />,
        behavior: { kind: "popover", Content: WorkspaceReviewPopover },
      },
    }));
    for (const approved of status?.approvedWorkspaces ?? []) {
      registrations.push(client.addHeaderButton({
        id: `pr-approved-${approved.workspaceId}`,
        workspaceId: approved.workspaceId,
        button: {
          title: `PR #${approved.number} is approved`,
          icon: ({ theme, size }) => <Icon name="CircleCheck" size={size} color={theme.colors.statusSuccess} />,
          behavior: {
            kind: "popover",
            Content: ({ theme }) => (
              <View style={{ padding: 16, gap: 10 }}>
                <Text style={{ color: theme.colors.statusSuccess, fontWeight: "600" }}>PR #{approved.number} is approved</Text>
                <ExternalLink href={approved.url}><Text style={{ color: theme.colors.accent }}>{approved.title}</Text></ExternalLink>
              </View>
            ),
          },
        },
      }));
    }
    return () => { for (const registration of registrations) registration.remove(); };
  }, [client, status]);
  return null;
}

function WorkspaceReviewPanel({ workspaceId, theme }: PluginWorkspacePanelProps) {
  return <WorkspaceReviewList workspaceId={workspaceId} theme={theme} />;
}

function WorkspaceReviewPopover({ workspaceId, theme }: PluginButtonContentProps) {
  return <WorkspaceReviewList workspaceId={workspaceId} theme={theme} />;
}

function WorkspaceReviewList({ workspaceId, theme }: { workspaceId?: string; theme: PluginTheme }) {
  const query = useWorkspaceReviews();
  const fetchReviews = useRpc(prWorkspaceReviews);
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => fetchReviews({ refresh: true }),
    onSuccess: (result) => { queryClient.setQueryData(QUERY_KEY, result); },
    onError: () => queryClient.resetQueries({ queryKey: QUERY_KEY }),
  });
  const reviews = (query.data?.reviews ?? []).filter((review) => !workspaceId || review.workspaceId === workspaceId);
  const errors = (query.data?.errors ?? []).filter((error) => !workspaceId || error.workspaceId === workspaceId);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "600" }}>PR review updates</Text>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
        Nothing is fetched or sent to an agent until you ask. The plugin only reads PR status and the local commit.
      </Text>
      {query.isPending ? <Text style={{ color: theme.colors.foregroundMuted }}>Checking checked-out PRs...</Text> : null}
      {query.error ? <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger }}>{query.error.message}</Text> : null}
      {refresh.error ? <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger }}>{refresh.error.message}</Text> : null}
      {errors.map((error) => <Text key={error.workspaceId} accessibilityRole="alert" style={{ color: theme.colors.statusDanger }}>{error.message}</Text>)}
      {!query.isPending && !query.error && errors.length === 0 && reviews.length === 0 ? (
        <Text style={{ color: theme.colors.foregroundMuted }}>No new PR heads or review requests since the recorded baseline. Unmatched or closed PRs are not monitored.</Text>
      ) : null}
      {reviews.map((review) => <WorkspaceReviewCard key={`${review.workspaceId}:${review.token}`} review={review} theme={theme} />)}
      <Pressable accessibilityRole="button" disabled={refresh.isPending} onPress={() => refresh.mutate()} style={{ paddingVertical: 8 }}>
        <Text style={{ color: theme.colors.accent }}>Check again</Text>
      </Pressable>
    </ScrollView>
  );
}

function WorkspaceReviewCard({ review, theme }: { review: WorkspaceReview; theme: PluginTheme }) {
  const [agentId, setAgentId] = useState(review.agents[0]?.id ?? "");
  const sendAction = useRpc(prWorkspaceReviewAction);
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: async (input: WorkspaceReviewAction) => {
      const result = await sendAction(input);
      if (result.kind === "error") throw new Error(result.message);
      return input.action;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
  const selected = review.agents.find((agent) => agent.id === agentId);
  const disabled = action.isPending || !selected || selected.busy;
  return (
    <View style={{ padding: 14, gap: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, backgroundColor: theme.colors.surface1 }}>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{review.workspaceTitle}</Text>
      <ExternalLink href={review.url}><Text style={{ color: theme.colors.accent, fontWeight: "600" }}>#{review.number} {review.title}</Text></ExternalLink>
      {review.reasons.includes("head_changed") ? (
        <Text style={{ color: theme.colors.foreground }}>The latest PR head {review.headOid.slice(0, 8)} differs from the recorded checkout {review.baselineHeadOid.slice(0, 8)}.</Text>
      ) : null}
      {review.reasons.includes("review_requested") ? <Text style={{ color: theme.colors.foreground }}>Another GitHub review was requested from you, even if the head has not changed.</Text> : null}
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
        Ask an existing agent to inspect local changes, fetch the latest PR commits, and re-review. It must ask before changing a dirty or divergent checkout. This does not authorize posting a GitHub review.
      </Text>
      {review.agents.length > 0 ? (
        <SettingsSelect
          label="Review conversation"
          value={agentId}
          options={review.agents.map((agent) => ({ value: agent.id, label: `${agent.title}${agent.busy ? " (busy)" : ""}` }))}
          onValueChange={setAgentId}
          disabled={action.isPending}
        />
      ) : <Text style={{ color: theme.colors.foregroundMuted }}>Open an agent in this workspace first. This prompt never creates a new agent.</Text>}
      {selected?.busy ? <Text style={{ color: theme.colors.foregroundMuted }}>Finish the agent's current turn or permission request first.</Text> : null}
      {action.error ? <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger }}>{action.error.message}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => action.mutate({ action: "review", workspaceId: review.workspaceId, token: review.token, agentId })}
          style={{ padding: 10, borderRadius: 6, backgroundColor: theme.colors.accent, opacity: disabled ? 0.5 : 1 }}
        >
          <Text style={{ color: theme.colors.accentForeground }}>{action.isPending ? "Sending..." : "Fetch safely and re-review"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={action.isPending}
          onPress={() => action.mutate({ action: "dismiss", workspaceId: review.workspaceId, token: review.token })}
          style={{ padding: 10 }}
        >
          <Text style={{ color: theme.colors.foregroundMuted }}>Dismiss this update</Text>
        </Pressable>
      </View>
    </View>
  );
}
