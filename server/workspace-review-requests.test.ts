import assert from "node:assert/strict";
import { test } from "node:test";
import { activeReviewRequests, reviewRequestEventSchema } from "./workspace-review-requests";
import { initialReviewState, reviewReasons } from "./workspace-review-state";

function event(id: string, removed = false, reviewer = { login: "alex" }) {
  return reviewRequestEventSchema.parse({
    __typename: removed ? "ReviewRequestRemovedEvent" : "ReviewRequestedEvent",
    id,
    createdAt: "2026-11-05T10:00:00.000Z",
    requestedReviewer: reviewer,
  });
}

test("withdrawing a review request removes its attention without hiding changed code", () => {
  const observation = { pullRequestKey: "pr-42", headOid: "head-a", request: null };
  const state = initialReviewState(observation, "head-a");
  const requested = event("request-1");
  assert.deepEqual(reviewReasons(state, { ...observation, request: requested }), ["review_requested"]);
  const requests = activeReviewRequests([requested, event("removed-1", true)], new Set());
  assert.deepEqual(requests, []);
  assert.deepEqual(reviewReasons(state, observation), []);
  assert.deepEqual(reviewReasons(state, { ...observation, headOid: "head-b" }), ["head_changed"]);
});

test("requesting another review after withdrawal retains the new request identity", () => {
  const requests = activeReviewRequests([event("request-1"), event("removed-1", true), event("request-2")], new Set());
  assert.deepEqual(requests.map((request) => request.id), ["request-2"]);
});

test("a removal suppresses older requests across timeline pages", () => {
  const seen = new Set<string>();
  assert.deepEqual(activeReviewRequests([event("removed-1", true)], seen), []);
  assert.deepEqual(activeReviewRequests([event("request-1")], seen), []);
});

test("withdrawal is scoped to its reviewer rather than unrelated requests", () => {
  const requests = activeReviewRequests([
    event("alex-request"),
    event("someone-request", false, { login: "someone" }),
    event("alex-removed", true, { login: "Alex" }),
  ], new Set());
  assert.deepEqual(requests.map((request) => request.id), ["someone-request"]);
});

test("team withdrawals are scoped by organization and do not hide direct requests", () => {
  const team = (id: string, organization: string, removed: boolean) => reviewRequestEventSchema.parse({
    __typename: removed ? "ReviewRequestRemovedEvent" : "ReviewRequestedEvent", id,
    createdAt: "2026-11-05T10:00:00.000Z",
    requestedReviewer: { slug: "reviewers", organization: { login: organization } },
  });
  const requests = activeReviewRequests([
    event("direct"), team("acme-request", "acme", false), team("other-request", "other", false), team("acme-removed", "Acme", true),
  ], new Set());
  assert.deepEqual(requests.map((request) => request.id), ["other-request", "direct"]);
});
