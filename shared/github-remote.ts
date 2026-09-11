export interface GithubRepo {
  host: string;
  owner: string;
  repo: string;
}

export function isGithubHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "github.com" ||
    normalized === "ssh.github.com" ||
    normalized.endsWith(".github.com")
  );
}

export function parseGithubProjectKey(projectKey: string | undefined): GithubRepo | null {
  if (!projectKey) return null;
  const trimmed = projectKey.trim();
  if (!trimmed.startsWith("remote:")) return parseGithubRemoteUrl(trimmed);

  const remote = trimmed.slice("remote:".length).split("#", 1)[0]?.trim() ?? "";
  if (remote.length === 0) return null;

  const slash = remote.indexOf("/");
  if (slash <= 0) return null;
  const host = remote.slice(0, slash).toLowerCase();
  if (!isGithubHost(host)) return null;
  return parseGithubRemoteUrl(`https://${remote}`);
}

export function parseGithubRemoteUrl(remoteUrl: string): GithubRepo | null {
  const trimmed = remoteUrl.trim();
  if (trimmed.length === 0) return null;

  const scp = /^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(trimmed);
  if (scp) {
    const host = scp[1].toLowerCase();
    if (!isGithubHost(host)) return null;
    return { host: canonicalGithubHost(host), owner: scp[2], repo: stripGitSuffix(scp[3]) };
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
    return { host: canonicalGithubHost(host), owner: parts[0], repo: stripGitSuffix(parts[1]) };
  } catch {
    return null;
  }
}

export function ghRepoFlag(repo: GithubRepo): string {
  return repo.host === "github.com" ? `${repo.owner}/${repo.repo}` : `${repo.host}/${repo.owner}/${repo.repo}`;
}

function canonicalGithubHost(host: string): string {
  return host === "ssh.github.com" ? "github.com" : host;
}

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/u, "");
}
