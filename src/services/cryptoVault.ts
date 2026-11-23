import { EncryptedCredential, ModelProvider } from '../types/trial';
import { getVaultPassphrase, MIN_PASSPHRASE_LENGTH } from './vaultSession';

/** OWASP-aligned cost for PBKDF2-HMAC-SHA256. Stored per credential so it can be raised later. */
export const PBKDF2_ITERATIONS = 310_000;

/** Only used to open credentials written by the first version of the app. Never used to encrypt. */
const LEGACY_DEVICE_SECRET = 'model-trials-local-nordic-vault-v0.3.0';
const LEGACY_ITERATIONS = 100_000;

const subtle = () => globalThis.crypto.subtle;

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const keyMaterial = await subtle().importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function maskApiKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.length <= 8) return '••••' + trimmed.slice(-2);
  return `${trimmed.slice(0, 6)}••••••••${trimmed.slice(-4)}`;
}

export function isLegacyCredential(cred: EncryptedCredential): boolean {
  return cred.v !== 2;
}

/** Encrypts with a fresh salt and IV. The passphrase defaults to the unlocked vault session. */
export async function encryptCredential(
  provider: ModelProvider,
  label: string,
  rawApiKey: string,
  passphrase: string = getVaultPassphrase()
): Promise<EncryptedCredential> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS);

  const cipher = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(rawApiKey.trim())
  );

  return {
    id: `cred_${Date.now()}_${globalThis.crypto.randomUUID().slice(0, 8)}`,
    provider,
    label: label.trim() || `${provider.toUpperCase()} Key`,
    cipherTextBase64: bufferToBase64(cipher),
    ivBase64: bufferToBase64(iv),
    saltBase64: bufferToBase64(salt),
    maskedPreview: maskApiKey(rawApiKey),
    createdAt: new Date().toISOString(),
    v: 2,
    iterations: PBKDF2_ITERATIONS,
  };
}

async function tryDecrypt(
  cred: EncryptedCredential,
  passphrase: string,
  iterations: number
): Promise<string> {
  const key = await deriveAesKey(passphrase, base64ToUint8Array(cred.saltBase64), iterations);
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv: base64ToUint8Array(cred.ivBase64) as unknown as BufferSource },
    key,
    base64ToUint8Array(cred.cipherTextBase64) as unknown as BufferSource
  );
  return new TextDecoder().decode(plain);
}

/**
 * Decrypts a credential. Throws VaultLockedError if no passphrase is supplied and the
 * vault is locked, or a DOMException (OperationError) on a wrong passphrase.
 * Legacy credentials (no `v`) are also tried against the old built-in secret so existing
 * keys keep working; re-save them to upgrade.
 */
export async function decryptCredential(
  credential: EncryptedCredential,
  passphrase: string = getVaultPassphrase()
): Promise<string> {
  if (credential.v === 2) {
    return tryDecrypt(credential, passphrase, credential.iterations ?? PBKDF2_ITERATIONS);
  }
  try {
    return await tryDecrypt(credential, passphrase, LEGACY_ITERATIONS);
  } catch {
    return tryDecrypt(credential, LEGACY_DEVICE_SECRET, LEGACY_ITERATIONS);
  }
}
