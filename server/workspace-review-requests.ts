import { z } from "zod";

export const reviewRequestEventSchema = z.object({
  __typename: z.enum(["ReviewRequestedEvent", "ReviewRequestRemovedEvent"]),
  id: z.string(),
  createdAt: z.string(),
  requestedReviewer: z.object({
    login: z.string().optional(),
    slug: z.string().optional(),
    organization: z.object({ login: z.string() }).optional(),
  }).nullable(),
});
type ReviewRequestEvent = z.infer<typeof reviewRequestEventSchema>;

// Pages arrive newest first; events within each page are chronological.
export function activeReviewRequests(events: readonly (ReviewRequestEvent | null)[], seen: Set<string>): ReviewRequestEvent[] {
  const active: ReviewRequestEvent[] = [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const reviewer = event?.requestedReviewer;
    if (!event || !reviewer) continue;
    const key = reviewer.login
      ? JSON.stringify(["user", reviewer.login.toLowerCase()])
      : reviewer.organization && reviewer.slug
        ? JSON.stringify(["team", reviewer.organization.login.toLowerCase(), reviewer.slug.toLowerCase()])
        : null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (event.__typename === "ReviewRequestedEvent") active.push(event);
  }
  return active;
}
