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

export const WORKSPACE_LABEL_IDENTITY: Record<WorkspaceLabelColor, string> = {
  violet: "#7a6aa8",
  sky: "#3d7ea6",
  emerald: "#388068",
  orange: "#a4673a",
  pink: "#b05c80",
  indigo: "#6a70b8",
  teal: "#368080",
  red: "#b06260",
  amber: "#8f7838",
  blue: "#5179b0",
};

const WORKSPACE_LABEL_FOREGROUND_LIGHT: Record<WorkspaceLabelColor, string> = {
  violet: "#6d49b5",
  sky: "#3d6985",
  emerald: "#3e6e5d",
  orange: "#845838",
  pink: "#974168",
  indigo: "#5251c2",
  teal: "#3e6d6c",
  red: "#9c4243",
  amber: "#716239",
  blue: "#39649e",
};

const WORKSPACE_LABEL_FOREGROUND_DARK: Record<WorkspaceLabelColor, string> = {
  violet: "#a392d5",
  sky: "#6aa6ce",
  emerald: "#6cae96",
  orange: "#cc8f64",
  pink: "#d87da3",
  indigo: "#9299d5",
  teal: "#6cacab",
  red: "#d88381",
  amber: "#b29d64",
  blue: "#7ba1d5",
};

export function workspaceLabelTint(color: WorkspaceLabelColor): string {
  return `${WORKSPACE_LABEL_IDENTITY[color]}1a`;
}

export function workspaceLabelForeground(
  color: WorkspaceLabelColor,
  scheme: "light" | "dark",
): string {
  return scheme === "light" ? WORKSPACE_LABEL_FOREGROUND_LIGHT[color] : WORKSPACE_LABEL_FOREGROUND_DARK[color];
}

export function themeColorScheme(surface0: string): "light" | "dark" {
  const hex = surface0.trim().replace(/^#/, "");
  const rgb =
    hex.length >= 6
      ? hex.slice(0, 6)
      : hex.length === 3
        ? hex.split("").map((ch) => ch + ch).join("")
        : "";
  if (rgb.length !== 6 || /[^0-9a-f]/i.test(rgb)) return "dark";
  const r = Number.parseInt(rgb.slice(0, 2), 16) / 255;
  const g = Number.parseInt(rgb.slice(2, 4), 16) / 255;
  const b = Number.parseInt(rgb.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? "dark" : "light";
}
