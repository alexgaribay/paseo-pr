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
  const listed = await context.paseo.projects.list();
  const resolved: ResolvedGithubProject[] = [];

  for (const project of listed.projects) {
    if (project.projectKind === "non_git" || project.projectKind === "directory") {
      continue;
    }

    const fromKey = parseGithubProjectKey(project.projectKey);
    const github = fromKey ?? parseGithubRemoteUrl((await readOriginRemoteUrl(project.projectRootPath)) ?? "");
    if (!github) continue;

    resolved.push({
      projectId: project.projectId,
      displayName: project.projectCustomName ?? project.projectDisplayName,
      host: github.host,
      owner: github.owner,
      repo: github.repo,
      rootPath: project.projectRootPath,
      github,
    });
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
