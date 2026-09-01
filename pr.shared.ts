import { defineRpc } from "@getpaseo/plugin/server";
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
export const pullRequestAuthorFilterSchema = z.enum(["anyone", "me"]);

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
  isDraft: z.boolean(),
  updatedAt: z.string(),
  reviewDecision: z.string().nullable(),
  headRefName: z.string().nullable(),
});

export const listPullRequestsInputSchema = z.object({
  projectIds: z.array(z.string()).optional(),
  states: z.array(pullRequestStateSchema).default(["open"]),
  author: pullRequestAuthorFilterSchema.default("anyone"),
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
    pullRequest: pullRequestSchema,
  }),
  z.object({
    kind: z.literal("not_found"),
    message: z.string(),
  }),
  unavailableSchema,
  errorSchema,
]);

export const listGithubProjectsOutputSchema = z.object({
  projects: z.array(githubProjectSchema),
});

export const prStatus = defineRpc({
  name: "pr.status",
  input: z.object({}),
  output: ghStatusSchema,
});

export const prProjects = defineRpc({
  name: "pr.projects",
  input: z.object({}),
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

export type GhStatus = z.infer<typeof ghStatusSchema>;
export type GithubProject = z.infer<typeof githubProjectSchema>;
export type PullRequest = z.infer<typeof pullRequestSchema>;
export type PullRequestState = z.infer<typeof pullRequestStateSchema>;
export type PullRequestAuthorFilter = z.infer<typeof pullRequestAuthorFilterSchema>;
export type ListPullRequestsInput = z.infer<typeof listPullRequestsInputSchema>;
export type ListPullRequestsOutput = z.infer<typeof listPullRequestsOutputSchema>;
export type ViewPullRequestOutput = z.infer<typeof viewPullRequestOutputSchema>;
