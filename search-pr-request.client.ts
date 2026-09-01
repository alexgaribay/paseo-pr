type Listener = () => void;

const listeners = new Set<Listener>();
let pending = false;

export function requestInboxFocus(): void {
  if (listeners.size === 0) {
    pending = true;
    return;
  }
  for (const listener of listeners) listener();
}

export function subscribeInboxFocus(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    pending = false;
    listener();
  }
  return () => {
    listeners.delete(listener);
  };
}
