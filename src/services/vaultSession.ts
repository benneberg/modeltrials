/**
 * In-memory vault session.
 *
 * The passphrase never touches IndexedDB, localStorage or exports. It lives in
 * this module only, and is wiped on lock, on auto-lock timeout, and on reload.
 */

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked. Unlock it in Models → Key Vault with your passphrase.');
    this.name = 'VaultLockedError';
  }
}

export const MIN_PASSPHRASE_LENGTH = 8;
export const AUTO_LOCK_MS = 15 * 60 * 1000;

let passphrase: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function armTimer() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(lockVault, AUTO_LOCK_MS);
}

export function unlockVault(candidate: string): void {
  if (candidate.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  passphrase = candidate;
  armTimer();
  emit();
}

export function lockVault(): void {
  passphrase = null;
  if (timer) clearTimeout(timer);
  timer = null;
  emit();
}

export function isVaultUnlocked(): boolean {
  return passphrase !== null;
}

/** Returns the session passphrase and extends the auto-lock timer. */
export function getVaultPassphrase(): string {
  if (passphrase === null) throw new VaultLockedError();
  armTimer();
  return passphrase;
}

export function subscribeVault(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
