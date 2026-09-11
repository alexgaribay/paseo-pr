import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const EXTRA_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  join(homedir(), ".local/bin"),
];

const resolvedCommands = new Map<string, string | null>();

export function expandedPath(): string {
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const dir of [...(process.env.PATH ?? "").split(delimiter), ...EXTRA_BIN_DIRS]) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    dirs.push(dir);
  }
  return dirs.join(delimiter);
}

export function commandEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: expandedPath() };
}

export function expandHome(filePath: string): string {
  const trimmed = filePath.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

export function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function clearResolvedCommands(): void {
  resolvedCommands.clear();
}

export async function resolveCommand(command: string): Promise<string | null> {
  const cached = resolvedCommands.get(command);
  if (cached !== undefined) return cached;
  const resolved = await resolveExecutable(command);
  resolvedCommands.set(command, resolved);
  return resolved;
}

export async function resolveExecutable(command: string): Promise<string | null> {
  const expanded = expandHome(command);
  if (!expanded) return null;

  const fromPath = resolveOnPath(expanded);
  if (fromPath) return fromPath;
  if (looksLikeFilePath(expanded)) return isExecutable(expanded) ? expanded : null;
  return await resolveFromLoginShell(expanded);
}

function looksLikeFilePath(command: string): boolean {
  return command.includes("/") || command.includes("\\");
}

function resolveOnPath(command: string): string | null {
  if (looksLikeFilePath(command)) {
    return isExecutable(command) ? command : null;
  }
  for (const dir of expandedPath().split(delimiter)) {
    const candidate = join(dir, command);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

async function resolveFromLoginShell(command: string): Promise<string | null> {
  if (!/^[A-Za-z0-9._-]+$/u.test(command)) return null;
  const shell = loginShell();
  if (!shell) return null;
  try {
    const { stdout } = await execFileAsync(shell, ["-lc", `command -v -- ${command}`], {
      timeout: 5_000,
      env: process.env,
    });
    const located = stdout.trim().split("\n")[0];
    if (located && isExecutable(located)) return located;
  } catch {
    return null;
  }
  return null;
}

function loginShell(): string | null {
  const fromEnv = process.env.SHELL;
  if (fromEnv && isExecutable(fromEnv)) return fromEnv;
  if (isExecutable("/bin/zsh")) return "/bin/zsh";
  if (isExecutable("/bin/bash")) return "/bin/bash";
  return null;
}
