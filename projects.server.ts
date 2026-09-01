import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { parseGithubProjectKey, parseGithubRemoteUrl, type GithubRepo } from "./github-remote.shared";
import { readOriginRemoteUrl } from "./gh.server";
import type { GithubProject } from "./pr.shared";

export interface ResolvedGithubProject extends GithubProject {
  github: GithubRepo;
}

export async function listResolvedGithubProjects(
  context: PluginHandlerContext,
): Promise<ResolvedGithubProject[]> {
  const listed = await listCandidateProjects(context);
  const resolved: ResolvedGithubProject[] = [];
  const seen = new Set<string>();

  for (const project of listed) {
    try {
      const fromKey = parseGithubProjectKey(project.projectKey);
      if (!fromKey && (project.kind === "non_git" || project.kind === "directory")) continue;
      const github = fromKey ?? parseGithubRemoteUrl((await readOriginRemoteUrl(project.rootPath)) ?? "");
      if (!github) continue;
      if (seen.has(project.projectId)) continue;
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

  if (resolved.length === 0) {
    console.error(
      `[paseo-pr] no GitHub remotes from ${listed.length} projects keys=${listed
        .map((project) => `${project.projectKey ?? project.rootPath}:${project.kind ?? "unknown"}`)
        .join(",")}`,
    );
  }
  return resolved;
}

export async function findGithubProject(
  context: PluginHandlerContext,
  projectId: string,
): Promise<ResolvedGithubProject | null> {
  const projects = await listResolvedGithubProjects(context);
  return projects.find((project) => project.projectId === projectId) ?? null;
}

interface CandidateProject {
  projectId: string;
  displayName: string;
  rootPath: string;
  projectKey?: string;
  kind?: string;
}

async function listCandidateProjects(context: PluginHandlerContext): Promise<CandidateProject[]> {
  const fromProjects = await listFromProjectsApi(context);
  if (fromProjects.length > 0) return fromProjects;
  return await listFromWorkspacesApi(context);
}

async function listFromProjectsApi(context: PluginHandlerContext): Promise<CandidateProject[]> {
  try {
    const listed = await context.paseo.projects.list();
    const records = recordsFromProjectsPayload(listed);
    return records.map(candidateFromUnknown).filter((project): project is CandidateProject => project !== null);
  } catch (error) {
    console.error(`[paseo-pr] projects.list failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function listFromWorkspacesApi(context: PluginHandlerContext): Promise<CandidateProject[]> {
  try {
    const candidates: CandidateProject[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const result = await context.paseo.workspaces.list({
        page: cursor ? { limit: 100, cursor } : { limit: 100 },
      });
      for (const workspace of result.entries) {
        const candidate = candidateFromUnknown(workspace);
        if (!candidate || seen.has(candidate.projectId)) continue;
        seen.add(candidate.projectId);
        candidates.push(candidate);
      }
      if (!result.pageInfo.hasMore || result.pageInfo.nextCursor == null) break;
      cursor = result.pageInfo.nextCursor;
    }
    return candidates;
  } catch (error) {
    console.error(`[paseo-pr] workspaces.list failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
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
