import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const pluginSettingsSchema = z.object({
  ghPath: z.string(),
  resolvedGhPath: z.string().nullable(),
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
  input: z.object({ ghPath: z.string() }),
  output: pluginSettingsOutputSchema,
});

export type PluginSettings = z.infer<typeof pluginSettingsSchema>;
export type PluginSettingsOutput = z.infer<typeof pluginSettingsOutputSchema>;
