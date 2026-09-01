export interface GithubRepo {
  host: string;
  owner: string;
  repo: string;
}

const GITHUB_PROJECT_KEY = /^remote:([^/]+)\/([^/]+)\/([^/]+)$/;

export function isGithubHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "github.com" || normalized.endsWith(".github.com");
}

export function parseGithubProjectKey(projectKey: string | undefined): GithubRepo | null {
  if (!projectKey) return null;
  const match = GITHUB_PROJECT_KEY.exec(projectKey);
  if (!match) return null;
  const host = match[1].toLowerCase();
  if (!isGithubHost(host)) return null;
  return { host, owner: match[2], repo: stripGitSuffix(match[3]) };
}

export function parseGithubRemoteUrl(remoteUrl: string): GithubRepo | null {
  const trimmed = remoteUrl.trim();
  if (trimmed.length === 0) return null;

  const scp = /^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(trimmed);
  if (scp) {
    const host = scp[1].toLowerCase();
    if (!isGithubHost(host)) return null;
    return { host, owner: scp[2], repo: stripGitSuffix(scp[3]) };
  }

  try {
    const withScheme = trimmed.startsWith("git@")
      ? trimmed
      : trimmed.includes("://")
        ? trimmed
        : `https://${trimmed}`;
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase();
    if (!isGithubHost(host)) return null;
    const parts = url.pathname.replace(/^\/+/u, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { host, owner: parts[0], repo: stripGitSuffix(parts[1]) };
  } catch {
    return null;
  }
}

export function ghRepoFlag(repo: GithubRepo): string {
  return repo.host === "github.com" ? `${repo.owner}/${repo.repo}` : `${repo.host}/${repo.owner}/${repo.repo}`;
}

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/u, "");
}
