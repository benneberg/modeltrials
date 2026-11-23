/** Tiny store for in-flight replies, so streaming never churns the persisted trial state. */
const live = new Map<string, string>();
const listeners = new Set<() => void>();
let queued: ReturnType<typeof setTimeout> | null = null;

function emitSoon() {
  if (queued) return;
  queued = setTimeout(() => {
    queued = null;
    listeners.forEach((fn) => fn());
  }, 50);
}

export function setLive(participantId: string, text: string | null) {
  if (text === null) live.delete(participantId);
  else live.set(participantId, text);
  emitSoon();
}

export const getLive = (participantId: string | undefined): string | undefined =>
  participantId ? live.get(participantId) : undefined;

export function subscribeLive(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
