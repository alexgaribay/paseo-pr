export function githubAvatarUrl(host: string, login: string): string | null {
  const name = login.trim();
  if (name.length === 0 || name === "unknown") return null;
  const user = encodeURIComponent(name.replace(/\[bot\]$/u, ""));
  const normalized = host.trim().toLowerCase();
  if (normalized === "github.com" || normalized.endsWith(".github.com")) {
    return `https://github.com/${user}.png?size=64`;
  }
  if (normalized.length === 0) return null;
  return `https://${normalized}/${user}.png?size=64`;
}
