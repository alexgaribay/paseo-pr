import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  resolveExistingWorkspaceLabels,
  uniqueWorkspaceLabelNames,
  workspaceLabelDefinitionSchema,
  type WorkspaceLabelDefinition,
  type WorkspaceLabelsApplyOutput,
} from "../shared/workspace-labels";

const ASSIGN_TIMEOUT_MS = 15_000;

export async function loadWorkspaceLabelCatalog(): Promise<WorkspaceLabelDefinition[]> {
  try {
    const raw: unknown = JSON.parse(await readFile(workspaceLabelsFilePath(), "utf8"));
    return parseWorkspaceLabelCatalog(raw);
  } catch (error) {
    if (isMissingFile(error)) return [];
    return [];
  }
}

export function parseWorkspaceLabelCatalog(value: unknown): WorkspaceLabelDefinition[] {
  if (!Array.isArray(value)) return [];
  const catalog: WorkspaceLabelDefinition[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const parsed = workspaceLabelDefinitionSchema.safeParse(entry);
    if (!parsed.success) continue;
    const name = uniqueWorkspaceLabelNames([parsed.data.name])[0];
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    catalog.push({ name, color: parsed.data.color });
  }
  return catalog;
}

export async function applyExistingWorkspaceLabels(input: {
  workspaceId: string;
  names: readonly string[];
}): Promise<WorkspaceLabelsApplyOutput> {
  if (input.names.length === 0) return { kind: "ok", applied: [] };

  const catalog = await loadWorkspaceLabelCatalog();
  const labels = resolveExistingWorkspaceLabels(input.names, catalog);
  if (labels.length === 0) return { kind: "ok", applied: [] };

  const applied: string[] = [];
  try {
    for (const label of labels) {
      await assignExistingWorkspaceLabel(input.workspaceId, label);
      applied.push(label.name);
    }
    return { kind: "ok", applied };
  } catch (error) {
    return {
      kind: "error",
      message:
        error instanceof Error
          ? applied.length > 0
            ? `Applied ${applied.join(", ")}, then failed: ${error.message}`
            : error.message
          : "Could not apply workspace labels.",
    };
  }
}

async function assignExistingWorkspaceLabel(
  workspaceId: string,
  label: WorkspaceLabelDefinition,
): Promise<void> {
  const requestId = randomUUID();
  const payload = {
    type: "workspace.label.assignment.set.request",
    requestId,
    workspaceId,
    label: { name: label.name, color: label.color },
    assigned: true,
  };
  const pending = waitForDaemonSessionResponse(requestId, ASSIGN_TIMEOUT_MS);
  try {
    sendPluginDaemonSession(payload);
    await pending.promise;
  } catch (error) {
    pending.cancel();
    throw error;
  }
}

function sendPluginDaemonSession(message: unknown): void {
  if (typeof process.send !== "function") {
    throw new Error("Could not apply workspace labels.");
  }
  process.send({
    type: "paseo_frame",
    data: JSON.stringify({ type: "session", message }),
    isBinary: false,
  });
}

function waitForDaemonSessionResponse(
  requestId: string,
  timeoutMs: number,
): { promise: Promise<void>; cancel: () => void } {
  let settled = false;
  let rejectPromise: ((error: Error) => void) | undefined;
  const timer = setTimeout(() => {
    cleanup();
    rejectPromise?.(new Error("Timed out applying workspace labels."));
  }, timeoutMs);

  function onMessage(message: unknown) {
    const response = parseDaemonSessionResponse(message);
    if (!response || response.requestId !== requestId) return;
    cleanup();
    if (response.error) {
      rejectPromise?.(new Error(response.error));
      return;
    }
    resolvePromise?.();
  }

  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    rejectPromise = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
  });

  function cleanup() {
    clearTimeout(timer);
    process.off("message", onMessage);
  }

  process.on("message", onMessage);
  return {
    promise,
    cancel() {
      cleanup();
    },
  };
}

function parseDaemonSessionResponse(
  message: unknown,
): { requestId: string; error?: string } | null {
  const envelope = unwrapPluginDaemonFrame(message);
  if (!envelope || typeof envelope !== "object") return null;
  const session =
    "type" in envelope && envelope.type === "session" && "message" in envelope
      ? envelope.message
      : envelope;
  if (!session || typeof session !== "object" || !("type" in session) || typeof session.type !== "string") {
    return null;
  }
  if (
    session.type !== "rpc_error" &&
    !session.type.endsWith(".response") &&
    !session.type.endsWith("_response")
  ) {
    return null;
  }
  const payload =
    "payload" in session && session.payload && typeof session.payload === "object"
      ? session.payload
      : null;
  if (!payload || !("requestId" in payload) || typeof payload.requestId !== "string") return null;
  if (session.type === "rpc_error") {
    const error =
      "error" in payload && typeof payload.error === "string" && payload.error.trim().length > 0
        ? payload.error
        : "Could not apply workspace labels.";
    return { requestId: payload.requestId, error };
  }
  return { requestId: payload.requestId };
}

function unwrapPluginDaemonFrame(message: unknown): unknown {
  if (!message || typeof message !== "object" || !("type" in message)) return message;
  if (message.type !== "paseo_frame" || !("data" in message)) return message;
  const text = frameDataToString(message.data);
  if (text == null) return message.data;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function frameDataToString(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (data instanceof Uint8Array) return new TextDecoder().decode(data);
  return null;
}

function workspaceLabelsFilePath(): string {
  const home = process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo");
  return join(home, "projects", "workspace-labels.json");
}

function isMissingFile(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT",
  );
}
