import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const WORKSPACE_LABEL_COLORS = [
  "violet",
  "sky",
  "emerald",
  "orange",
  "pink",
  "indigo",
  "teal",
  "red",
  "amber",
  "blue",
] as const;

export const workspaceLabelColorSchema = z.enum(WORKSPACE_LABEL_COLORS);

export const workspaceLabelDefinitionSchema = z.object({
  name: z.string().min(1),
  color: workspaceLabelColorSchema,
});

export const workspaceLabelNamesSchema = z.array(z.string()).max(50);

export const prWorkspaceLabelsApply = defineRpc({
  name: "pr.workspace-labels.apply",
  input: z.object({
    workspaceId: z.string().min(1),
  }),
  output: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("ok"),
      applied: z.array(z.string()),
    }),
    z.object({
      kind: z.literal("error"),
      message: z.string(),
    }),
  ]),
});

export type WorkspaceLabelColor = z.infer<typeof workspaceLabelColorSchema>;
export type WorkspaceLabelDefinition = z.infer<typeof workspaceLabelDefinitionSchema>;
export type WorkspaceLabelsApplyOutput = z.infer<typeof prWorkspaceLabelsApply.output>;

export function normalizeWorkspaceLabelName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function workspaceLabelKey(name: string): string {
  return normalizeWorkspaceLabelName(name).toLowerCase();
}

export function uniqueWorkspaceLabelNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = normalizeWorkspaceLabelName(raw);
    if (name.length === 0) continue;
    const key = workspaceLabelKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length >= 50) break;
  }
  return result;
}

export function resolveExistingWorkspaceLabels(
  names: readonly string[],
  catalog: readonly WorkspaceLabelDefinition[],
): WorkspaceLabelDefinition[] {
  const byKey = new Map(catalog.map((label) => [workspaceLabelKey(label.name), label]));
  return uniqueWorkspaceLabelNames(names).flatMap((name) => {
    const found = byKey.get(workspaceLabelKey(name));
    return found ? [found] : [];
  });
}
