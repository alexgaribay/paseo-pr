import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { clearResolvedCommands, expandHome, resolveExecutable } from "./command-path.server";
import type { PluginSettingsOutput } from "./settings.shared";

interface StoredSettings {
  ghPath: string;
}

const DEFAULT_SETTINGS: StoredSettings = { ghPath: "" };

let memory: StoredSettings | null = null;

export async function loadStoredGhPath(): Promise<string> {
  return (await loadStoredSettings()).ghPath;
}

export async function handleSettingsGet(): Promise<PluginSettingsOutput> {
  const stored = await loadStoredSettings();
  return {
    kind: "ok",
    ghPath: stored.ghPath,
    resolvedGhPath: await resolveExecutable(stored.ghPath.trim() || "gh"),
  };
}

export async function handleSettingsSet(input: { ghPath: string }): Promise<PluginSettingsOutput> {
  const ghPath = input.ghPath.trim();
  if (ghPath.length > 0) {
    const resolved = await resolveExecutable(ghPath);
    if (!resolved) {
      const stored = await loadStoredSettings();
      return {
        kind: "error",
        message: `Not an executable: ${expandHome(ghPath)}`,
        ghPath: stored.ghPath,
        resolvedGhPath: await resolveExecutable(stored.ghPath.trim() || "gh"),
      };
    }
  }

  const next: StoredSettings = { ghPath };
  await writeStoredSettings(next);
  memory = next;
  clearResolvedCommands();
  return {
    kind: "ok",
    ghPath,
    resolvedGhPath: await resolveExecutable(ghPath || "gh"),
  };
}

async function loadStoredSettings(): Promise<StoredSettings> {
  if (memory) return memory;
  try {
    const raw = JSON.parse(await readFile(settingsFilePath(), "utf8")) as unknown;
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
  return { ghPath: typeof ghPath === "string" ? ghPath : "" };
}

function settingsFilePath(): string {
  const home = process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo");
  return join(home, "plugin-data", "paseo-pr", "settings.json");
}
