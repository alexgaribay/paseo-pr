import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { clearResolvedCommands, expandHome, resolveExecutable } from "./command-path";
import {
  DEFAULT_ASSIGNMENT_PROMPT,
  DEFAULT_REFRESH_INTERVAL_MINUTES,
  isRefreshIntervalMinutes,
  type PluginSettingsOutput,
  type RefreshIntervalMinutes,
} from "../shared/settings";
import { loadWorkspaceLabelCatalog } from "./workspace-labels";
import {
  resolveExistingWorkspaceLabels,
  uniqueWorkspaceLabelNames,
  type WorkspaceLabelDefinition,
} from "../shared/workspace-labels";

interface StoredSettings {
  ghPath: string;
  refreshIntervalMinutes: RefreshIntervalMinutes;
  workspaceLabelNames: string[];
  assignmentAutomation: {
    enabled: boolean;
    provider: string;
    prompt: string;
    thinkingOptionId: string | null;
    modeId: string | null;
  };
}

const DEFAULT_SETTINGS: StoredSettings = {
  ghPath: "",
  refreshIntervalMinutes: DEFAULT_REFRESH_INTERVAL_MINUTES,
  workspaceLabelNames: [],
  assignmentAutomation: { enabled: false, provider: "", prompt: DEFAULT_ASSIGNMENT_PROMPT, thinkingOptionId: null, modeId: null },
};

let memory: StoredSettings | null = null;

export async function loadStoredGhPath(): Promise<string> {
  return (await loadStoredSettings()).ghPath;
}

export async function loadStoredRefreshIntervalMinutes(): Promise<RefreshIntervalMinutes> {
  return (await loadStoredSettings()).refreshIntervalMinutes;
}

export async function loadStoredWorkspaceLabelNames(): Promise<string[]> {
  return (await loadStoredSettings()).workspaceLabelNames;
}

export async function handleSettingsGet(): Promise<PluginSettingsOutput> {
  const stored = await loadStoredSettings();
  return await toSettingsOutput({ kind: "ok", stored });
}

export async function handleSettingsSet(input: {
  ghPath: string;
  refreshIntervalMinutes: RefreshIntervalMinutes;
  workspaceLabelNames: string[];
  assignmentAutomation: StoredSettings["assignmentAutomation"];
}): Promise<PluginSettingsOutput> {
  const ghPath = input.ghPath.trim();
  if (ghPath.length > 0) {
    const resolved = await resolveExecutable(ghPath);
    if (!resolved) {
      const stored = await loadStoredSettings();
      return await toSettingsOutput({
        kind: "error",
        stored,
        message: `Not an executable: ${expandHome(ghPath)}`,
      });
    }
  }

  const provider = input.assignmentAutomation.provider.trim();
  const prompt = input.assignmentAutomation.prompt.trim();
  if (input.assignmentAutomation.enabled && (provider.length === 0 || prompt.length === 0)) {
    const stored = await loadStoredSettings();
    return await toSettingsOutput({
      kind: "error",
      stored,
      message: "Assigned PR automation needs both a provider/model and prompt.",
    });
  }

  const catalog = await loadWorkspaceLabelCatalog();
  const workspaceLabelNames = persistableWorkspaceLabelNames(input.workspaceLabelNames, catalog);

  const next: StoredSettings = {
    ghPath,
    refreshIntervalMinutes: input.refreshIntervalMinutes,
    workspaceLabelNames,
    assignmentAutomation: {
      enabled: input.assignmentAutomation.enabled,
      provider,
      prompt,
      thinkingOptionId: input.assignmentAutomation.thinkingOptionId?.trim() || null,
      modeId: input.assignmentAutomation.modeId?.trim() || null,
    },
  };
  await writeStoredSettings(next);
  memory = next;
  clearResolvedCommands();
  return await toSettingsOutput({ kind: "ok", stored: next });
}

async function loadStoredSettings(): Promise<StoredSettings> {
  if (memory) return memory;
  try {
    const raw: unknown = JSON.parse(await readFile(settingsFilePath(), "utf8"));
    memory = parseStoredSettings(raw);
  } catch {
    memory = { ...DEFAULT_SETTINGS };
  }
  return memory;
}

async function writeStoredSettings(settings: StoredSettings): Promise<void> {
  const filePath = settingsFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function parseStoredSettings(value: unknown): StoredSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS };
  const ghPath = "ghPath" in value ? value.ghPath : "";
  const refresh = "refreshIntervalMinutes" in value ? value.refreshIntervalMinutes : DEFAULT_REFRESH_INTERVAL_MINUTES;
  const workspaceLabelNames = "workspaceLabelNames" in value ? value.workspaceLabelNames : [];
  const assignmentAutomation = "assignmentAutomation" in value ? value.assignmentAutomation : null;
  return {
    ghPath: typeof ghPath === "string" ? ghPath : "",
    refreshIntervalMinutes:
      typeof refresh === "number" && isRefreshIntervalMinutes(refresh)
        ? refresh
        : DEFAULT_REFRESH_INTERVAL_MINUTES,
    workspaceLabelNames: Array.isArray(workspaceLabelNames)
      ? uniqueWorkspaceLabelNames(workspaceLabelNames.filter((name): name is string => typeof name === "string"))
      : [],
    assignmentAutomation:
      assignmentAutomation && typeof assignmentAutomation === "object"
        ? {
            enabled: "enabled" in assignmentAutomation && assignmentAutomation.enabled === true,
            provider: "provider" in assignmentAutomation && typeof assignmentAutomation.provider === "string"
              ? assignmentAutomation.provider
              : "",
            prompt:
              "prompt" in assignmentAutomation &&
              typeof assignmentAutomation.prompt === "string" &&
              assignmentAutomation.prompt.trim().length > 0
                ? assignmentAutomation.prompt
                : DEFAULT_ASSIGNMENT_PROMPT,
            thinkingOptionId:
              "thinkingOptionId" in assignmentAutomation && typeof assignmentAutomation.thinkingOptionId === "string"
                ? assignmentAutomation.thinkingOptionId
                : null,
            modeId: "modeId" in assignmentAutomation && typeof assignmentAutomation.modeId === "string"
              ? assignmentAutomation.modeId
              : null,
          }
        : { enabled: false, provider: "", prompt: DEFAULT_ASSIGNMENT_PROMPT, thinkingOptionId: null, modeId: null },
  };
}

async function toSettingsOutput(input: {
  kind: "ok" | "error";
  stored: StoredSettings;
  message?: string;
}): Promise<PluginSettingsOutput> {
  const resolvedGhPath = await resolveExecutable(input.stored.ghPath.trim() || "gh");
  const workspaceLabels = await loadWorkspaceLabelCatalog();
  const workspaceLabelNames = persistableWorkspaceLabelNames(input.stored.workspaceLabelNames, workspaceLabels);
  if (input.kind === "error") {
    return {
      kind: "error",
      message: input.message ?? "Could not save settings.",
      ghPath: input.stored.ghPath,
      resolvedGhPath,
      refreshIntervalMinutes: input.stored.refreshIntervalMinutes,
      workspaceLabelNames,
      workspaceLabels,
      assignmentAutomation: input.stored.assignmentAutomation,
    };
  }
  return {
    kind: "ok",
    ghPath: input.stored.ghPath,
    resolvedGhPath,
    refreshIntervalMinutes: input.stored.refreshIntervalMinutes,
    workspaceLabelNames,
    workspaceLabels,
    assignmentAutomation: input.stored.assignmentAutomation,
  };
}

function persistableWorkspaceLabelNames(
  names: readonly string[],
  catalog: readonly WorkspaceLabelDefinition[],
): string[] {
  return resolveExistingWorkspaceLabels(names, catalog).map((label) => label.name);
}

function settingsFilePath(): string {
  const home = process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo");
  return join(home, "plugin-data", "paseo-pr", "settings.json");
}
