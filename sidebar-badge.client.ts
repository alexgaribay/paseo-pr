const SIDEBAR_TEST_ID = "plugin-sidebar-paseo-pr-main";
const BADGE_ATTR = "data-paseo-pr-waiting";
const THEME_ATTR = "data-paseo-pr-theme";
const DEFAULT_POLL_MS = 5 * 60_000;

export interface SidebarBadgeTheme {
  foreground: string;
  background: string;
  border: string;
}

let started = false;
let lastCount = 0;
let pollMs = DEFAULT_POLL_MS;
let fetchCount: () => Promise<number> = async () => 0;
let timer: ReturnType<typeof setInterval> | undefined;
let observer: MutationObserver | undefined;
let observedNode: Node | null = null;
let raf = 0;
let theme: SidebarBadgeTheme | null = null;

export function ensureSidebarBadgePolling(nextFetchCount: () => Promise<number>): () => void {
  fetchCount = nextFetchCount;
  if (started) return () => {};
  started = true;

  if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      scheduleBadgeRender();
    });
    attachObserver();
    startTimer();
    void refresh();
  }

  return () => {};
}

export function setSidebarBadgePollInterval(ms: number | false): void {
  pollMs = ms === false ? 0 : ms;
  if (!started) return;
  startTimer();
}

export function setSidebarBadgeTheme(next: SidebarBadgeTheme): void {
  theme = next;
  if (!started) return;
  renderSidebarBadge(lastCount);
}

async function refresh() {
  try {
    lastCount = await fetchCount();
  } catch {
    lastCount = 0;
  }
  attachObserver();
  renderSidebarBadge(lastCount);
}

function startTimer() {
  if (timer) clearInterval(timer);
  timer = undefined;
  if (pollMs > 0) {
    timer = setInterval(() => {
      void refresh();
    }, pollMs);
  }
}

function scheduleBadgeRender() {
  if (typeof requestAnimationFrame === "undefined") {
    renderSidebarBadge(lastCount);
    return;
  }
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    renderSidebarBadge(lastCount);
  });
}

function attachObserver() {
  if (!observer || typeof document === "undefined") return;
  const row = document.querySelector(`[data-testid="${SIDEBAR_TEST_ID}"]`);
  const target = row?.parentElement ?? null;
  if (!target || target === observedNode) return;
  observer.disconnect();
  observedNode = target;
  observer.observe(target, { childList: true, subtree: true });
}

export function renderSidebarBadge(count: number) {
  if (typeof document === "undefined") return;
  const row = document.querySelector(`[data-testid="${SIDEBAR_TEST_ID}"]`);
  if (!row) return;

  const existing = row.querySelector(`[${BADGE_ATTR}]`);
  if (count <= 0) {
    if (existing) {
      observer?.disconnect();
      existing.remove();
      reconnectObserver();
    }
    return;
  }

  const colors = theme ?? colorsFromRow(row);
  const label = count > 99 ? "99+" : String(count);
  const themeKey = `${colors.foreground}|${colors.background}|${colors.border}`;
  if (
    existing instanceof HTMLElement &&
    existing.getAttribute(BADGE_ATTR) === String(count) &&
    existing.getAttribute(THEME_ATTR) === themeKey &&
    existing.textContent === label
  ) {
    return;
  }

  observer?.disconnect();
  const badge = existing instanceof HTMLElement ? existing : document.createElement("span");
  badge.setAttribute(BADGE_ATTR, String(count));
  badge.setAttribute(THEME_ATTR, themeKey);
  badge.setAttribute("aria-label", `${count} pull requests waiting on you`);
  badge.textContent = label;
  badge.style.marginLeft = "auto";
  badge.style.minWidth = "18px";
  badge.style.height = "18px";
  badge.style.padding = "0 6px";
  badge.style.borderRadius = "999px";
  badge.style.display = "inline-flex";
  badge.style.alignItems = "center";
  badge.style.justifyContent = "center";
  badge.style.fontSize = "11px";
  badge.style.fontWeight = "500";
  badge.style.lineHeight = "18px";
  badge.style.color = colors.foreground;
  badge.style.background = colors.background;
  badge.style.border = `1px solid ${colors.border}`;
  badge.style.flexShrink = "0";
  if (!existing) row.appendChild(badge);
  reconnectObserver();
}

function colorsFromRow(row: Element): SidebarBadgeTheme {
  const foreground = firstNonDefaultColor(row) ?? "CanvasText";
  return {
    foreground,
    background: `color-mix(in srgb, ${foreground} 16%, transparent)`,
    border: `color-mix(in srgb, ${foreground} 24%, transparent)`,
  };
}

function firstNonDefaultColor(root: Element): string | null {
  const nodes = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const node of nodes) {
    const color = getComputedStyle(node).color;
    if (!isDefaultInk(color)) return color;
  }
  return null;
}

function isDefaultInk(color: string): boolean {
  const value = color.trim().toLowerCase();
  return (
    value === "" ||
    value === "black" ||
    value === "#000" ||
    value === "#000000" ||
    value === "rgb(0, 0, 0)" ||
    value === "rgba(0, 0, 0, 1)" ||
    value === "rgba(0, 0, 0, 1.0)"
  );
}

function reconnectObserver() {
  if (!observer || !observedNode) {
    attachObserver();
    return;
  }
  observer.observe(observedNode, { childList: true, subtree: true });
}
