export function readCommandCenterQuery(): string {
  if (typeof document === "undefined") return "";
  const node = document.querySelector("[data-testid='command-center-input']");
  if (!node) return "";
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) return node.value;
  const nested = node.querySelector("input, textarea");
  if (nested instanceof HTMLInputElement || nested instanceof HTMLTextAreaElement) return nested.value;
  const value = node.getAttribute("value");
  if (value && value.length > 0) return value;
  return (node.textContent ?? "").trim();
}
