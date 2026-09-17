import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { parseGithubProjectKey, parseGithubRemoteUrl, type GithubRepo } from "../shared/github-remote";
import { readOriginRemoteUrl } from "./gh";
import type { GithubProject } from "../shared/pr";

const PROJECT_CACHE_FRESH_MS = 60_000;
const PROJECT_CACHE_STALE_MS = 10 * 60_000;
const TRANSPORT_RETRY_DELAY_MS = 250;

export interface ResolvedGithubProject extends GithubProject {
  github: GithubRepo;
}

export class ProjectDiscoveryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectDiscoveryUnavailableError";
  }
}

let cache: { projects: ResolvedGithubProject[]; nextRefreshAt: number; staleUntil: number } | null = null;
let discovery: Promise<ResolvedGithubProject[]> | null = null;
let unavailable: { message: string; retryAt: number } | null = null;
let lastUnavailableLogAt = 0;

export async function listResolvedGithubProjects(
  context: PluginHandlerContext,
): Promise<ResolvedGithubProject[]> {
  const now = Date.now();
  if (cache && cache.nextRefreshAt > now) return cache.projects;
  if (unavailable && unavailable.retryAt > now) {
    throw new ProjectDiscoveryUnavailableError(unavailable.message);
  }
  if (discovery) return await discovery;

  const pending = refreshResolvedGithubProjects(context);
  discovery = pending;
  try {
    return await pending;
  } finally {
    if (discovery === pending) discovery = null;
  }
}

export async function findGithubProject(
  context: PluginHandlerContext,
  projectId: string,
): Promise<ResolvedGithubProject | null> {
  const projects = await listResolvedGithubProjects(context);
  return projects.find((project) => project.projectId === projectId) ?? null;
}

async function refreshResolvedGithubProjects(
  context: PluginHandlerContext,
): Promise<ResolvedGithubProject[]> {
  try {
    const listed = await listCandidateProjects(context);
    const resolved = await resolveGithubProjects(listed);
    cache = {
      projects: resolved,
      nextRefreshAt: Date.now() + PROJECT_CACHE_FRESH_MS,
      staleUntil: Date.now() + PROJECT_CACHE_STALE_MS,
    };
    unavailable = null;
    if (resolved.length === 0) {
      console.warn(
        `[paseo-pr] no GitHub remotes from ${listed.length} projects keys=${listed
          .map((project) => `${project.projectKey ?? project.rootPath}:${project.kind ?? "unknown"}`)
          .join(",")}`,
      );
    }
    return resolved;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (cache && cache.staleUntil > Date.now()) {
      cache.nextRefreshAt = Date.now() + PROJECT_CACHE_FRESH_MS;
      logUnavailableOnce(`[paseo-pr] Project discovery unavailable; using cached projects: ${message}`);
      return cache.projects;
    }
    const unavailableMessage = `Paseo project transport is unavailable: ${message}`;
    unavailable = { message: unavailableMessage, retryAt: Date.now() + PROJECT_CACHE_FRESH_MS };
    throw new ProjectDiscoveryUnavailableError(unavailableMessage);
  }
}

async function resolveGithubProjects(
  listed: CandidateProject[],
): Promise<ResolvedGithubProject[]> {
  const resolved: ResolvedGithubProject[] = [];
  const seen = new Set<string>();

  for (const project of listed) {
    try {
      const fromKey = parseGithubProjectKey(project.projectKey);
      if (!fromKey && (project.kind === "non_git" || project.kind === "directory")) continue;
      const github = fromKey ?? parseGithubRemoteUrl((await readOriginRemoteUrl(project.rootPath)) ?? "");
      if (!github || seen.has(project.projectId)) continue;
      seen.add(project.projectId);
      resolved.push({
        projectId: project.projectId,
        displayName: project.displayName,
        host: github.host,
        owner: github.owner,
        repo: github.repo,
        rootPath: project.rootPath,
        github,
      });
    } catch (error) {
      console.error(
        `[paseo-pr] skipped project ${project.projectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return resolved;
}

interface CandidateProject {
  projectId: string;
  displayName: string;
  rootPath: string;
  projectKey?: string;
  kind?: string;
}

type CandidateSource =
  | { kind: "ok"; projects: CandidateProject[] }
  | { kind: "unavailable"; message: string };

async function listCandidateProjects(context: PluginHandlerContext): Promise<CandidateProject[]> {
  const fromProjects = await listFromProjectsApi(context);
  if (fromProjects.kind === "ok" && fromProjects.projects.length > 0) return fromProjects.projects;

  const fromWorkspaces = await listFromWorkspacesApi(context);
  if (fromWorkspaces.kind === "ok") return fromWorkspaces.projects;
  if (fromProjects.kind === "ok") return fromProjects.projects;

  throw new ProjectDiscoveryUnavailableError(
    `projects.list failed: ${fromProjects.message}; workspaces.list failed: ${fromWorkspaces.message}`,
  );
}

async function listFromProjectsApi(context: PluginHandlerContext): Promise<CandidateSource> {
  try {
    const listed = await retryTransport(() => context.paseo.projects.list());
    const records = recordsFromProjectsPayload(listed);
    return {
      kind: "ok",
      projects: records.map(candidateFromUnknown).filter((project): project is CandidateProject => project !== null),
    };
  } catch (error) {
    return { kind: "unavailable", message: error instanceof Error ? error.message : String(error) };
  }
}

async function listFromWorkspacesApi(context: PluginHandlerContext): Promise<CandidateSource> {
  try {
    const candidates: CandidateProject[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const result = await retryTransport(() =>
        context.paseo.workspaces.list({ page: cursor ? { limit: 100, cursor } : { limit: 100 } }),
      );
      for (const workspace of result.entries) {
        const candidate = candidateFromUnknown(workspace);
        if (!candidate || seen.has(candidate.projectId)) continue;
        seen.add(candidate.projectId);
        candidates.push(candidate);
      }
      if (!result.pageInfo.hasMore || result.pageInfo.nextCursor == null) break;
      cursor = result.pageInfo.nextCursor;
    }
    return { kind: "ok", projects: candidates };
  } catch (error) {
    return { kind: "unavailable", message: error instanceof Error ? error.message : String(error) };
  }
}

async function retryTransport<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof Error && error.message.includes("Transport not connected"))) throw error;
    await new Promise<void>((resolve) => setTimeout(resolve, TRANSPORT_RETRY_DELAY_MS));
    return await operation();
  }
}


function logUnavailableOnce(message: string): void {
  if (Date.now() - lastUnavailableLogAt < PROJECT_CACHE_FRESH_MS) return;
  lastUnavailableLogAt = Date.now();
  console.warn(message);
}

function recordsFromProjectsPayload(listed: unknown): unknown[] {
  if (Array.isArray(listed)) return listed;
  if (!listed || typeof listed !== "object") return [];
  const projects = Reflect.get(listed, "projects");
  return Array.isArray(projects) ? projects : [];
}

function candidateFromUnknown(value: unknown): CandidateProject | null {
  if (!value || typeof value !== "object") return null;
  const projectId = readString(Reflect.get(value, "projectId"));
  if (!projectId) return null;
  const rootPath =
    readString(Reflect.get(value, "projectRootPath")) ??
    readString(Reflect.get(value, "rootPath")) ??
    readString(Reflect.get(value, "path")) ??
    readString(Reflect.get(value, "cwd"));
  if (!rootPath) return null;
  const displayName =
    readString(Reflect.get(value, "projectCustomName")) ??
    readString(Reflect.get(value, "projectDisplayName")) ??
    readString(Reflect.get(value, "displayName")) ??
    readString(Reflect.get(value, "name")) ??
    projectId;
  return {
    projectId,
    displayName,
    rootPath,
    projectKey: readString(Reflect.get(value, "projectKey")),
    kind: readString(Reflect.get(value, "projectKind")) ?? readString(Reflect.get(value, "kind")),
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
