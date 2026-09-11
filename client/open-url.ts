import { Linking } from "react-native";

export function openHttpsUrl(url: string, allowedHost: string): boolean {
  const parsed = parseAllowedHttpsUrl(url, allowedHost);
  if (!parsed) return false;

  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(parsed.toString(), "_blank", "noopener,noreferrer");
    return true;
  }

  void Linking.openURL(parsed.toString());
  return true;
}

export function isAllowedHttpsUrl(url: string, allowedHost: string): boolean {
  return parseAllowedHttpsUrl(url, allowedHost) !== null;
}

export function resolveMarkdownUrl(href: string, baseUrl: string): string | null {
  const trimmed = href.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#")) return null;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseAllowedHttpsUrl(url: string, allowedHost: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  return isAllowedHttpsHost(parsed.hostname, allowedHost) ? parsed : null;
}

function isAllowedHttpsHost(hostname: string, allowedHost: string): boolean {
  const host = hostname.toLowerCase();
  const allowed = allowedHost.trim().toLowerCase();
  if (allowed.length > 0 && (host === allowed || host.endsWith(`.${allowed}`))) return true;
  if (host === "github.com" || host.endsWith(".github.com")) return true;
  if (host === "githubusercontent.com" || host.endsWith(".githubusercontent.com")) return true;
  return false;
}
