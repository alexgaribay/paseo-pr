import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import {
  workspaceLabelDefinitionSchema,
  workspaceLabelNamesSchema,
} from "./workspace-labels";

export const refreshIntervalMinutesSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(5),
  z.literal(10),
  z.literal(15),
  z.literal(30),
]);

export const REFRESH_INTERVAL_MINUTES = [0, 1, 2, 5, 10, 15, 30] as const;
export const DEFAULT_REFRESH_INTERVAL_MINUTES = 5;
export const DEFAULT_ASSIGNMENT_PROMPT =
  "Review this pull request. Summarize the changes, identify risks, and recommend the next action.";

export const assignmentAutomationSchema = z.object({
  enabled: z.boolean(),
  profileId: z.string(),
  prompt: z.string(),
});

export const pluginSettingsSchema = z.object({
  ghPath: z.string(),
  resolvedGhPath: z.string().nullable(),
  refreshIntervalMinutes: refreshIntervalMinutesSchema,
  excludedProjectIds: z.array(z.string()),
  workspaceLabelNames: workspaceLabelNamesSchema,
  workspaceLabels: z.array(workspaceLabelDefinitionSchema),
  assignmentAutomation: assignmentAutomationSchema,
});

export const pluginSettingsOutputSchema = z.discriminatedUnion("kind", [
  pluginSettingsSchema.extend({ kind: z.literal("ok") }),
  pluginSettingsSchema.extend({
    kind: z.literal("error"),
    message: z.string(),
  }),
]);

export const prSettingsGet = defineRpc({
  name: "pr.settings.get",
  input: z.object({}),
  output: pluginSettingsOutputSchema,
});

export const prSettingsSet = defineRpc({
  name: "pr.settings.set",
  input: z.object({
    ghPath: z.string(),
    refreshIntervalMinutes: refreshIntervalMinutesSchema,
    excludedProjectIds: z.array(z.string()),
    workspaceLabelNames: workspaceLabelNamesSchema,
    assignmentAutomation: assignmentAutomationSchema,
  }),
  output: pluginSettingsOutputSchema,
});

export type RefreshIntervalMinutes = z.infer<typeof refreshIntervalMinutesSchema>;
export type PluginSettings = z.infer<typeof pluginSettingsSchema>;
export type PluginSettingsOutput = z.infer<typeof pluginSettingsOutputSchema>;

export function isRefreshIntervalMinutes(value: number): value is RefreshIntervalMinutes {
  return (
    value === 0 ||
    value === 1 ||
    value === 2 ||
    value === 5 ||
    value === 10 ||
    value === 15 ||
    value === 30
  );
}

export function refreshIntervalLabel(minutes: RefreshIntervalMinutes): string {
  if (minutes === 0) return "Off";
  if (minutes === 1) return "1 min";
  return `${minutes} min`;
}

export function refreshIntervalMs(minutes: RefreshIntervalMinutes): number | false {
  return minutes === 0 ? false : minutes * 60_000;
}
