import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const workspaceReviewSchema = z.object({
  workspaceId: z.string(),
  workspaceTitle: z.string(),
  number: z.number().int().positive(),
  url: z.string(),
  title: z.string(),
  headOid: z.string(),
  baselineHeadOid: z.string(),
  token: z.string(),
  reasons: z.array(z.enum(["head_changed", "review_requested"])),
  agents: z.array(z.object({ id: z.string(), title: z.string(), busy: z.boolean() })),
});

export const prWorkspaceReviews = defineRpc({
  name: "pr.workspace-reviews",
  input: z.object({ refresh: z.boolean().optional() }),
  output: z.object({
    reviews: z.array(workspaceReviewSchema),
    approvedWorkspaces: z.array(z.object({
      workspaceId: z.string(),
      number: z.number().int().positive(),
      title: z.string(),
      url: z.string(),
    })),
    errors: z.array(z.object({ workspaceId: z.string(), message: z.string() })),
  }),
});

export const prWorkspaceReviewAction = defineRpc({
  name: "pr.workspace-review.action",
  input: z.discriminatedUnion("action", [
    z.object({ action: z.literal("dismiss"), workspaceId: z.string().min(1), token: z.string().min(1) }),
    z.object({ action: z.literal("review"), workspaceId: z.string().min(1), token: z.string().min(1), agentId: z.string().min(1) }),
  ]),
  output: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("ok") }),
    z.object({ kind: z.literal("error"), message: z.string() }),
  ]),
});

export type WorkspaceReview = z.infer<typeof workspaceReviewSchema>;
export type WorkspaceReviewAction = z.infer<typeof prWorkspaceReviewAction.input>;
