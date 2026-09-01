import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { clearResolvedCommands, expandHome, resolveExecutable } from "./command-path.server";
import {
  DEFAULT_REFRESH_INTERVAL_MINUTES,
  isRefreshIntervalMinutes,
  type PluginSettingsOutput,
  type RefreshIntervalMinutes,
} from "./settings.shared";

interface StoredSettings {
  ghPath: string;
  refreshIntervalMinutes: RefreshIntervalMinutes;
}

const DEFAULT_SETTINGS: StoredSettings = {
  ghPath: "",
  refreshIntervalMinutes: DEFAULT_REFRESH_INTERVAL_MINUTES,
};

let memory: StoredSettings | null = null;

export async function loadStoredGhPath(): Promise<string> {
  return (await loadStoredSettings()).ghPath;
}

export async function loadStoredRefreshIntervalMinutes(): Promise<RefreshIntervalMinutes> {
  return (await loadStoredSettings()).refreshIntervalMinutes;
}

export async function handleSettingsGet(): Promise<PluginSettingsOutput> {
  const stored = await loadStoredSettings();
  return await toSettingsOutput({ kind: "ok", stored });
}

export async function handleSettingsSet(input: {
  ghPath: string;
  refreshIntervalMinutes: RefreshIntervalMinutes;
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

  const next: StoredSettings = {
    ghPath,
    refreshIntervalMinutes: input.refreshIntervalMinutes,
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
  return {
    ghPath: typeof ghPath === "string" ? ghPath : "",
    refreshIntervalMinutes:
      typeof refresh === "number" && isRefreshIntervalMinutes(refresh)
        ? refresh
        : DEFAULT_REFRESH_INTERVAL_MINUTES,
  };
}

async function toSettingsOutput(input: {
  kind: "ok" | "error";
  stored: StoredSettings;
  message?: string;
}): Promise<PluginSettingsOutput> {
  const resolvedGhPath = await resolveExecutable(input.stored.ghPath.trim() || "gh");
  if (input.kind === "error") {
    return {
      kind: "error",
      message: input.message ?? "Could not save settings.",
      ghPath: input.stored.ghPath,
      resolvedGhPath,
      refreshIntervalMinutes: input.stored.refreshIntervalMinutes,
    };
  }
  return {
    kind: "ok",
    ghPath: input.stored.ghPath,
    resolvedGhPath,
    refreshIntervalMinutes: input.stored.refreshIntervalMinutes,
  };
}

function settingsFilePath(): string {
  const home = process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo");
  return join(home, "plugin-data", "paseo-pr", "settings.json");
}
