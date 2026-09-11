import { spawn } from "node:child_process";
import { commandEnv, resolveCommand } from "./command-path";
import { loadStoredGhPath } from "./settings";

export type CommandFailure = "missing" | "timeout";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  failure?: CommandFailure;
}

export async function runCommand(input: {
  command: string;
  args: readonly string[];
  cwd?: string;
  timeoutMs?: number;
}): Promise<CommandResult> {
  const requested = input.command === "gh" ? (await loadStoredGhPath()).trim() || "gh" : input.command;
  const command = (await resolveCommand(requested)) ?? requested;
  return await new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, [...input.args], {
      cwd: input.cwd,
      env: commandEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ code: 1, stdout, stderr, failure: "timeout" });
    }, input.timeoutMs ?? 20_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      finish({
        code: 1,
        stdout,
        stderr: error.message,
        failure: error.code === "ENOENT" ? "missing" : undefined,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      finish({ code: code ?? 1, stdout, stderr });
    });
  });
}
