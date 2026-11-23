import { afterEach, describe, expect, it } from 'vitest';
import { decryptCredential, encryptCredential, isLegacyCredential } from './cryptoVault';
import { isVaultUnlocked, lockVault, unlockVault, VaultLockedError } from './vaultSession';

const KEY = 'sk-test-1234567890abcdef';

afterEach(() => lockVault());

describe('vault', () => {
  it('round-trips a key with the session passphrase', async () => {
    unlockVault('correct horse battery');
    const cred = await encryptCredential('openai', 'main', KEY);
    expect(cred.v).toBe(2);
    expect(cred.cipherTextBase64).not.toContain(KEY);
    expect(await decryptCredential(cred)).toBe(KEY);
  });

  it('uses a fresh salt and IV for every credential', async () => {
    unlockVault('correct horse battery');
    const a = await encryptCredential('openai', 'a', KEY);
    const b = await encryptCredential('openai', 'b', KEY);
    expect(a.saltBase64).not.toBe(b.saltBase64);
    expect(a.ivBase64).not.toBe(b.ivBase64);
    expect(a.cipherTextBase64).not.toBe(b.cipherTextBase64);
  });

  it('refuses a wrong passphrase', async () => {
    const cred = await encryptCredential('openai', 'x', KEY, 'correct horse battery');
    await expect(decryptCredential(cred, 'wrong passphrase!!')).rejects.toBeTruthy();
  });

  it('throws VaultLockedError when locked and no passphrase is given', async () => {
    const cred = await encryptCredential('openai', 'x', KEY, 'correct horse battery');
    expect(isVaultUnlocked()).toBe(false);
    await expect(decryptCredential(cred)).rejects.toBeInstanceOf(VaultLockedError);
  });

  it('rejects short passphrases', async () => {
    expect(() => unlockVault('short')).toThrow();
    await expect(encryptCredential('openai', 'x', KEY, 'short')).rejects.toThrow();
  });

  it('still opens legacy credentials made with the old built-in secret', async () => {
    const subtle = globalThis.crypto.subtle;
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const material = await subtle.importKey(
      'raw',
      new TextEncoder().encode('model-trials-local-nordic-vault-v0.3.0'),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    const aes = await subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    const ct = new Uint8Array(
      await subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(KEY))
    );
    const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
    const legacy = {
      id: 'c1',
      provider: 'openai' as const,
      label: 'old',
      cipherTextBase64: b64(ct),
      ivBase64: b64(iv),
      saltBase64: b64(salt),
      maskedPreview: 'sk-tes••••',
      createdAt: new Date().toISOString(),
    };
    expect(isLegacyCredential(legacy)).toBe(true);
    unlockVault('some new passphrase');
    expect(await decryptCredential(legacy)).toBe(KEY);
  });
});
