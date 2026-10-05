import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const ghUnavailableReasonSchema = z.enum(["missing", "unauthenticated"]);

export const ghStatusSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ok") }),
  z.object({
    kind: z.literal("unavailable"),
    reason: ghUnavailableReasonSchema,
    message: z.string(),
  }),
]);

export const githubProjectSchema = z.object({
  projectId: z.string(),
  displayName: z.string(),
  host: z.string(),
  owner: z.string(),
  repo: z.string(),
  rootPath: z.string(),
});

export const pullRequestStateSchema = z.enum(["open", "closed", "merged"]);
export const pullRequestPersonFilterSchema = z.enum(["anyone", "me"]);

export const pullRequestSchema = z.object({
  projectId: z.string(),
  host: z.string(),
  owner: z.string(),
  repo: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  state: z.string(),
  author: z.string(),
  authoredByViewer: z.boolean().nullable(),
  assignees: z.array(z.string()),
  isDraft: z.boolean(),
  updatedAt: z.string(),
  reviewDecision: z.string().nullable(),
  headRefName: z.string().nullable(),
  waitingOnViewer: z.boolean(),
  needsRereview: z.boolean(),
});

export const pullRequestCommentKindSchema = z.enum(["comment", "review", "line"]);

export const pullRequestCommentSchema = z.object({
  id: z.string(),
  author: z.string(),
  body: z.string(),
  createdAt: z.string(),
  url: z.string().nullable(),
  kind: pullRequestCommentKindSchema,
  reviewState: z.string().nullable(),
  path: z.string().nullable(),
});

export const pullRequestDetailSchema = pullRequestSchema.extend({
  body: z.string(),
  createdAt: z.string(),
  labels: z.array(z.string()),
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  changedFiles: z.number().int().nonnegative().nullable(),
  baseRefName: z.string().nullable(),
  comments: z.array(pullRequestCommentSchema),
});

export const listPullRequestsInputSchema = z.object({
  projectIds: z.array(z.string()).optional(),
  states: z.array(pullRequestStateSchema).default(["open"]),
  author: pullRequestPersonFilterSchema.default("anyone"),
  assignee: pullRequestPersonFilterSchema.default("anyone"),
  waiting: pullRequestPersonFilterSchema.default("anyone"),
  search: z.string().optional(),
  limit: z.number().int().positive().max(100).default(30),
});

const unavailableSchema = z.object({
  kind: z.literal("unavailable"),
  reason: ghUnavailableReasonSchema,
  message: z.string(),
});

const errorSchema = z.object({
  kind: z.literal("error"),
  message: z.string(),
});

export const listPullRequestsOutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    pullRequests: z.array(pullRequestSchema),
  }),
  unavailableSchema,
  errorSchema,
]);

export const viewPullRequestInputSchema = z.object({
  projectId: z.string(),
  number: z.number().int().positive(),
});

export const viewPullRequestOutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    pullRequest: pullRequestDetailSchema,
  }),
  z.object({
    kind: z.literal("not_found"),
    message: z.string(),
  }),
  unavailableSchema,
  errorSchema,
]);

export const listGithubProjectsOutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    projects: z.array(githubProjectSchema),
  }),
  errorSchema,
]);

export const attentionOutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    count: z.number().int().nonnegative(),
    pullRequests: z.array(pullRequestSchema),
  }),
  unavailableSchema,
  errorSchema,
]);

export const prStatus = defineRpc({
  name: "pr.status",
  input: z.object({}),
  output: ghStatusSchema,
});

export const prProjects = defineRpc({
  name: "pr.projects",
  input: z.object({
    includeExcluded: z.boolean().optional(),
  }),
  output: listGithubProjectsOutputSchema,
});

export const prList = defineRpc({
  name: "pr.list",
  input: listPullRequestsInputSchema,
  output: listPullRequestsOutputSchema,
});

export const prView = defineRpc({
  name: "pr.view",
  input: viewPullRequestInputSchema,
  output: viewPullRequestOutputSchema,
});

export const prAttention = defineRpc({
  name: "pr.attention",
  input: z.object({}),
  output: attentionOutputSchema,
});

export type GhStatus = z.infer<typeof ghStatusSchema>;
export type GithubProject = z.infer<typeof githubProjectSchema>;
export type PullRequest = z.infer<typeof pullRequestSchema>;
export type PullRequestComment = z.infer<typeof pullRequestCommentSchema>;
export type PullRequestDetail = z.infer<typeof pullRequestDetailSchema>;
export type PullRequestState = z.infer<typeof pullRequestStateSchema>;
export type PullRequestPersonFilter = z.infer<typeof pullRequestPersonFilterSchema>;
export type ListPullRequestsInput = z.infer<typeof listPullRequestsInputSchema>;
export type ListPullRequestsOutput = z.infer<typeof listPullRequestsOutputSchema>;
export type ListGithubProjectsOutput = z.infer<typeof listGithubProjectsOutputSchema>;
export type ViewPullRequestOutput = z.infer<typeof viewPullRequestOutputSchema>;
export type AttentionOutput = z.infer<typeof attentionOutputSchema>;
