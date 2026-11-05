import assert from "node:assert/strict";
import { test } from "node:test";
import {
  completeReviewTurn,
  initialReviewState,
  reviewReasons,
  reviewToken,
  workspaceReviewStateSchema,
  type ReviewObservation,
} from "./workspace-review-state";

const initial: ReviewObservation = {
  pullRequestKey: "github.com/acme/widgets#42",
  headOid: "head-a",
  request: { id: "request-1", createdAt: "2026-11-01T10:00:00.000Z" },
};

test("a manual checkout establishes a quiet baseline and prompts on the next head", () => {
  const state = initialReviewState(initial, "head-a");
  assert.deepEqual(reviewReasons(state, initial), []);
  assert.deepEqual(reviewReasons(state, { ...initial, headOid: "head-b" }), ["head_changed"]);
  assert.equal(state.baselineHeadOid, "head-a");
});

test("a checkout already behind the PR offers an update without marking remote code reviewed", () => {
  const state = initialReviewState(initial, "old-checkout");
  assert.deepEqual(reviewReasons(state, initial), ["head_changed"]);
  assert.equal(state.baselineHeadOid, "old-checkout");
});

test("a repeated explicit review request prompts even at the same head", () => {
  const state = initialReviewState(initial, "head-a");
  const requested = { ...initial, request: { id: "request-2", createdAt: "2026-11-02T10:00:00.000Z" } };
  assert.deepEqual(reviewReasons(state, requested), ["review_requested"]);
  assert.deepEqual(reviewReasons(state, { ...requested, headOid: "head-b" }), ["head_changed", "review_requested"]);
});

test("dismissal survives a restart but not a new head or another request", () => {
  const requested = { ...initial, request: { id: "request-2", createdAt: "2026-11-02T10:00:00.000Z" } };
  const state = initialReviewState(initial, "head-a");
  state.dismissedToken = reviewToken(requested);
  const restored = workspaceReviewStateSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(reviewReasons(restored, requested), []);
  assert.deepEqual(reviewReasons(restored, { ...requested, headOid: "head-b" }), ["head_changed", "review_requested"]);
  assert.deepEqual(reviewReasons(restored, { ...requested, request: { id: "request-3", createdAt: "2026-11-03T10:00:00.000Z" } }), ["review_requested"]);
});

test("a completed turn acknowledges its checkout and earlier requests", () => {
  const state = initialReviewState(initial, "head-a");
  const observed = { ...initial, headOid: "head-b", request: { id: "request-2", createdAt: "2026-11-02T10:00:00.000Z" } };
  const completed = completeReviewTurn(state, observed, "head-b", "2026-11-02T11:00:00.000Z");
  assert.deepEqual(reviewReasons(completed, observed), []);
  assert.equal(completed.baselineHeadOid, "head-b");
  assert.equal(completed.requestId, "request-2");
});

test("a push or request during a turn remains actionable when the turn ends", () => {
  const state = initialReviewState(initial, "head-a");
  const observed = { ...initial, headOid: "head-b", request: { id: "request-2", createdAt: "2026-11-02T12:00:00.000Z" } };
  const completed = completeReviewTurn(state, observed, "head-a", "2026-11-02T11:00:00.000Z");
  assert.deepEqual(reviewReasons(completed, observed), ["head_changed", "review_requested"]);
  assert.equal(completed.baselineHeadOid, "head-a");
  assert.equal(completed.requestId, "request-1");
});

test("first observation after a turn starts does not swallow a request made during the turn", () => {
  const state = initialReviewState(initial, "head-a", "2026-11-01T09:00:00.000Z");
  assert.deepEqual(reviewReasons(state, initial), ["review_requested"]);
  assert.equal(state.requestId, null);
});

test("switching the workspace to a different PR replaces its baseline and dismissal", () => {
  const state = initialReviewState(initial, "head-a");
  state.dismissedToken = reviewToken(initial);
  const switched = { ...initial, pullRequestKey: "github.com/acme/widgets#43", headOid: "other-head" };
  const completed = completeReviewTurn(state, switched, "other-head", "2026-11-02T10:00:00.000Z");
  assert.equal(completed.pullRequestKey, "github.com/acme/widgets#43");
  assert.equal(completed.dismissedToken, null);
  assert.deepEqual(reviewReasons(completed, { ...switched, headOid: "next-head" }), ["head_changed"]);
});

test("an uncertain send keeps the same message identity across restart without changing the baseline", () => {
  const state = initialReviewState(initial, "head-a");
  const next = { ...initial, headOid: "head-b" };
  state.delivery = { token: reviewToken(next), agentId: "existing-agent", messageId: "one-message", prompt: "Review the latest code safely." };
  const restored = workspaceReviewStateSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.delivery, {
    token: '["github.com/acme/widgets#42","head-b","request-1"]',
    agentId: "existing-agent",
    messageId: "one-message",
    prompt: "Review the latest code safely.",
  });
  assert.deepEqual(reviewReasons(restored, next), ["head_changed"]);
  assert.equal(restored.baselineHeadOid, "head-a");
});
