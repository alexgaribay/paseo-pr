import { z } from "zod";

export interface ReviewObservation {
  pullRequestKey: string;
  headOid: string;
  request: { id: string; createdAt: string } | null;
}

export const workspaceReviewStateSchema = z.object({
  pullRequestKey: z.string(),
  baselineHeadOid: z.string(),
  requestId: z.string().nullable(),
  dismissedToken: z.string().nullable(),
  delivery: z.object({
    token: z.string(),
    agentId: z.string(),
    messageId: z.string(),
    prompt: z.string(),
  }).nullable(),
});
export type WorkspaceReviewState = z.infer<typeof workspaceReviewStateSchema>;

export function initialReviewState(observation: ReviewObservation, localHeadOid: string, baselineAt?: string): WorkspaceReviewState {
  return {
    pullRequestKey: observation.pullRequestKey,
    baselineHeadOid: localHeadOid,
    requestId: observation.request && (!baselineAt || Date.parse(observation.request.createdAt) <= Date.parse(baselineAt)) ? observation.request.id : null,
    dismissedToken: null,
    delivery: null,
  };
}

export function reviewToken(observation: ReviewObservation): string {
  return JSON.stringify([observation.pullRequestKey, observation.headOid, observation.request?.id ?? null]);
}

export function reviewReasons(state: WorkspaceReviewState, observation: ReviewObservation): Array<"head_changed" | "review_requested"> {
  if (state.pullRequestKey !== observation.pullRequestKey || state.dismissedToken === reviewToken(observation)) return [];
  const reasons: Array<"head_changed" | "review_requested"> = [];
  if (state.baselineHeadOid !== observation.headOid) reasons.push("head_changed");
  if (observation.request && observation.request.id !== state.requestId) reasons.push("review_requested");
  return reasons;
}

export function completeReviewTurn(
  state: WorkspaceReviewState,
  observation: ReviewObservation,
  localHeadOid: string,
  startedAt: string,
): WorkspaceReviewState {
  if (state.pullRequestKey !== observation.pullRequestKey) return initialReviewState(observation, localHeadOid, startedAt);
  return {
    ...state,
    baselineHeadOid: localHeadOid,
    requestId: observation.request && Date.parse(observation.request.createdAt) <= Date.parse(startedAt) ? observation.request.id : state.requestId,
  };
}
