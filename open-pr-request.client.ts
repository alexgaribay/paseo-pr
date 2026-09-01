export interface OpenPrRequest {
  number: number | null;
  autoSubmit: boolean;
}

type Listener = (request: OpenPrRequest) => void;

const listeners = new Set<Listener>();
let pending: OpenPrRequest | null = null;

export function requestOpenPrModal(request: OpenPrRequest = { number: null, autoSubmit: false }): void {
  if (listeners.size === 0) {
    pending = request;
    return;
  }
  for (const listener of listeners) listener(request);
}

export function subscribeOpenPrModal(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const request = pending;
    pending = null;
    listener(request);
  }
  return () => {
    listeners.delete(listener);
  };
}
