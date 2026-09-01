type Listener = () => void;

const listeners = new Set<Listener>();
let pending = false;

export function requestOpenPrModal(): void {
  if (listeners.size === 0) {
    pending = true;
    return;
  }
  for (const listener of listeners) listener();
}

export function subscribeOpenPrModal(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    pending = false;
    listener();
  }
  return () => {
    listeners.delete(listener);
  };
}
