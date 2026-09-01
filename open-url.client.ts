export function openHttpsUrl(url: string, allowedHost: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  const allowed = allowedHost.trim().toLowerCase();
  const github = host === "github.com" || host.endsWith(".github.com");
  if (host !== allowed && !github) return false;

  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(parsed.toString(), "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}
