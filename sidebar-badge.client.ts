const SIDEBAR_TEST_ID = "plugin-sidebar-paseo-pr-main";
const BADGE_ATTR = "data-paseo-pr-waiting";
const DEFAULT_POLL_MS = 5 * 60_000;

let started = false;
let lastCount = 0;
let pollMs = DEFAULT_POLL_MS;
let fetchCount: () => Promise<number> = async () => 0;
let timer: ReturnType<typeof setInterval> | undefined;
let observer: MutationObserver | undefined;
let observedNode: Node | null = null;
let raf = 0;

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

  const label = count > 99 ? "99+" : String(count);
  if (
    existing instanceof HTMLElement &&
    existing.getAttribute(BADGE_ATTR) === String(count) &&
    existing.textContent === label
  ) {
    return;
  }

  observer?.disconnect();
  const badge = existing instanceof HTMLElement ? existing : document.createElement("span");
  badge.setAttribute(BADGE_ATTR, String(count));
  badge.setAttribute("aria-label", `${count} pull requests waiting on you`);
  badge.textContent = label;
  if (!existing) {
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
    badge.style.color = "inherit";
    badge.style.background = "color-mix(in srgb, currentColor 16%, transparent)";
    badge.style.border = "1px solid color-mix(in srgb, currentColor 24%, transparent)";
    badge.style.flexShrink = "0";
    row.appendChild(badge);
  }
  reconnectObserver();
}

function reconnectObserver() {
  if (!observer || !observedNode) {
    attachObserver();
    return;
  }
  observer.observe(observedNode, { childList: true, subtree: true });
}
