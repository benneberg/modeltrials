import React, { useState, useSyncExternalStore } from 'react';
import {
  Activity,
  Check,
  Copy,
  Database,
  Download,
  FileJson,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { testModelConnection } from '../services/aiExecutionEngine';
import {
  decryptCredential,
  encryptCredential,
  isLegacyCredential,
} from '../services/cryptoVault';
import {
  AUTO_LOCK_MS,
  isVaultUnlocked,
  lockVault,
  MIN_PASSPHRASE_LENGTH,
  subscribeVault,
  unlockVault,
} from '../services/vaultSession';
import {
  exportAllWorkspaceJson,
  exportSingleTrialJson,
} from '../services/indexedDbStore';
import {
  EncryptedCredential,
  ModelDefinition,
  ModelProvider,
  TrialEvent,
} from '../types/trial';
import { NordicVaultSeal } from './NordicGraphics';

interface ModelsVaultViewProps {
  trial: TrialEvent;
  allTrials: TrialEvent[];
  models: ModelDefinition[];
  credentials: EncryptedCredential[];
  onSaveModel: (model: ModelDefinition) => Promise<void>;
  onDeleteModel: (modelId: string) => Promise<void>;
  onSaveCredential: (cred: EncryptedCredential) => Promise<void>;
  onDeleteCredential: (credId: string) => Promise<void>;
  onImportJson: (
    rawJson: string,
    duplicateAsNew: boolean
  ) => Promise<{ count: number }>;
}

export const ModelsVaultView: React.FC<ModelsVaultViewProps> = ({
  trial,
  allTrials,
  models,
  credentials,
  onSaveModel,
  onDeleteModel,
  onSaveCredential,
  onDeleteCredential,
  onImportJson,
}) => {
  // New Model Form State
  const [showAddModel, setShowAddModel] = useState(false);
  const [modelName, setModelName] = useState('');
  const [provider, setProvider] = useState<ModelProvider>('openrouter');
  const [modelId, setModelId] = useState('');
  const [endpoint, setEndpoint] = useState(
    'https://openrouter.ai/api/v1/chat/completions'
  );
  const [linkedCredId, setLinkedCredId] = useState<string>('');
  const [costIn, setCostIn] = useState(0.002);
  const [costOut, setCostOut] = useState(0.008);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);

  // Encrypted Key Vault State
  const [keyLabel, setKeyLabel] = useState('');
  const [keyProvider, setKeyProvider] = useState<ModelProvider>('openai');
  const [rawApiKey, setRawApiKey] = useState('');
  const [vaultPassphrase, setVaultPassphrase] = useState('');
  const [vaultError, setVaultError] = useState<string | null>(null);
  const vaultUnlocked = useSyncExternalStore(subscribeVault, isVaultUnlocked);
  const [encrypting, setEncrypting] = useState(false);
  const [verifiedCredId, setVerifiedCredId] = useState<string | null>(null);

  // Portability Export / Import State
  const [importJsonText, setImportJsonText] = useState('');
  const [duplicateOnImport, setDuplicateOnImport] = useState(true);
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [copiedExport, setCopiedExport] = useState(false);

  const handleProviderChange = (p: ModelProvider) => {
    setProvider(p);
    if (p === 'openai') {
      setEndpoint('https://api.openai.com/v1/chat/completions');
      setModelId('gpt-4o');
    } else if (p === 'anthropic') {
      setEndpoint('https://api.anthropic.com/v1/messages');
      setModelId('claude-3-7-sonnet-20250219');
    } else if (p === 'gemini') {
      setEndpoint(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'
      );
      setModelId('gemini-2.5-pro');
    } else if (p === 'openrouter') {
      setEndpoint('https://openrouter.ai/api/v1/chat/completions');
      setModelId('deepseek/deepseek-r1');
    } else if (p === 'manual') {
      setEndpoint('local://manual-workspace');
      setModelId('human-operator');
    }
  };

  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelName.trim() || !modelId.trim()) return;
    const newModel: ModelDefinition = {
      id: `model_${Date.now()}`,
      name: modelName.trim(),
      provider,
      modelId: modelId.trim(),
      endpoint: endpoint.trim(),
      credentialId: linkedCredId || undefined,
      costPer1kInput: Number(costIn),
      costPer1kOutput: Number(costOut),
      connectionStatus: provider === 'manual' ? 'ready' : 'untested',
      statusMessage: 'Created in local registry. Click Test Connection to verify.',
    };
    await onSaveModel(newModel);
    setModelName('');
    setShowAddModel(false);
  };

  const handleTestConnection = async (m: ModelDefinition) => {
    setTestingModelId(m.id);
    try {
      const cred = credentials.find((c) => c.id === m.credentialId);
      const res = await testModelConnection(m, cred);
      await onSaveModel({
        ...m,
        connectionStatus: res.status,
        lastTestedAt: new Date().toISOString(),
        statusMessage: res.message,
      });
    } finally {
      setTestingModelId(null);
    }
  };

  const handleEncryptAndStoreKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawApiKey.trim() || !vaultUnlocked) return;
    setEncrypting(true);
    try {
      const encrypted = await encryptCredential(
        keyProvider,
        keyLabel || `${keyProvider.toUpperCase()} API Key`,
        rawApiKey
      );
      await onSaveCredential(encrypted);
      setRawApiKey('');
      setKeyLabel('');
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Could not encrypt the key.');
    } finally {
      setEncrypting(false);
    }
  };

  const handleVerifyDecryption = async (cred: EncryptedCredential) => {
    try {
      const plain = await decryptCredential(cred);
      if (plain && plain.length > 0) {
        setVerifiedCredId(cred.id);
        setTimeout(() => setVerifiedCredId(null), 2500);
      }
    } catch {
      alert(
        vaultUnlocked
          ? 'Decryption check failed: the unlocked passphrase does not match the one used to encrypt this key.'
          : 'The vault is locked. Unlock it with your passphrase first.'
      );
    }
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      unlockVault(vaultPassphrase);
      setVaultPassphrase('');
      setVaultError(null);
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Could not unlock the vault.');
    }
  };

  const handleDownloadJsonFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImportJsonText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleRunImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importJsonText.trim()) return;
    try {
      const res = await onImportJson(importJsonText, duplicateOnImport);
      setImportStatus({
        type: 'success',
        message: `Successfully imported ${res.count} trial event(s) into IndexedDB.`,
      });
      setImportJsonText('');
    } catch (err) {
      setImportStatus({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to parse JSON bundle.',
      });
    }
  };

  const getStatusBadge = (status: ModelDefinition['connectionStatus']) => {
    switch (status) {
      case 'ready':
        return {
          label: '[DIRECT API READY]',
          cls: 'bg-[#2A6F4E]/15 text-[#2A6F4E]',
        };
      case 'cors_fallback':
        return {
          label: '[CORS FALLBACK / SANDBOX]',
          cls: 'bg-[#D98A2B]/18 text-[#D98A2B]',
        };
      case 'auth_error':
        return {
          label: '[AUTH ERROR]',
          cls: 'bg-[#B93829]/15 text-[#B93829]',
        };
      default:
        return {
          label: '[UNTESTED]',
          cls: 'bg-[#8E9490]/20 text-[#5C615E] dark:text-[#A3A8A5]',
        };
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Section 1: Reusable Model Definitions & CORS Diagnostic Tester */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#6A6558] dark:text-[#8E9490]">
              Client-Side Adapter Registry
            </span>
            <h2 className="text-xl font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
              Reusable Model Definitions & Browser CORS Diagnostics
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModel(!showAddModel)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#2F5D50] text-white hover:bg-[#1E3D34] spring-press"
          >
            <Plus className="w-3.5 h-3.5" />
            {showAddModel ? 'Close Form' : 'Add Model Definition'}
          </button>
        </div>

        {showAddModel && (
          <form
            onSubmit={handleCreateModel}
            className="mb-5 p-4 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-[#5C615E] dark:text-[#A3A8A5] mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Claude 3.7 Opus"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-[#5C615E] dark:text-[#A3A8A5] mb-1">
                  Provider Adapter
                </label>
                <select
                  value={provider}
                  onChange={(e) =>
                    handleProviderChange(e.target.value as ModelProvider)
                  }
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                >
                  <option value="openrouter">OpenRouter (CORS Friendly)</option>
                  <option value="openai">OpenAI Native</option>
                  <option value="anthropic">Anthropic Direct Browser</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="custom">Custom OpenAI-Compatible</option>
                  <option value="manual">Manual / Human Operator</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-mono text-[#5C615E] dark:text-[#A3A8A5] mb-1">
                  Model Identifier
                </label>
                <input
                  type="text"
                  required
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-mono text-[#5C615E] dark:text-[#A3A8A5] mb-1">
                  API Endpoint URL
                </label>
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-[#5C615E] dark:text-[#A3A8A5] mb-1">
                  Linked Vault Key (Optional)
                </label>
                <select
                  value={linkedCredId}
                  onChange={(e) => setLinkedCredId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                >
                  <option value="">None (Use Sandbox / Manual Fallback)</option>
                  {credentials.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} ({c.maskedPreview})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3 text-xs font-mono">
                <label className="flex items-center gap-1 text-[#5C615E]">
                  In $/1k:
                  <input
                    type="number"
                    step="0.0005"
                    value={costIn}
                    onChange={(e) => setCostIn(Number(e.target.value))}
                    className="w-20 px-2 py-1 rounded bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                  />
                </label>
                <label className="flex items-center gap-1 text-[#5C615E]">
                  Out $/1k:
                  <input
                    type="number"
                    step="0.0005"
                    value={costOut}
                    onChange={(e) => setCostOut(Number(e.target.value))}
                    className="w-20 px-2 py-1 rounded bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#2F5D50] text-white"
              >
                Save Model to IndexedDB
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {models.map((m) => {
            const badge = getStatusBadge(m.connectionStatus);
            const linkedCred = credentials.find((c) => c.id === m.credentialId);

            return (
              <div
                key={m.id}
                className="p-4 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#6A6558] dark:text-[#8E9490]">
                        {m.provider.toUpperCase()} · {m.modelId}
                      </span>
                      <h3 className="text-sm font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                        {m.name}
                      </h3>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold shrink-0 ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <p className="text-[11px] font-mono text-[#6A6558] dark:text-[#8E9490] truncate mt-1">
                    Endpoint: {m.endpoint}
                  </p>
                  {m.statusMessage && (
                    <p className="text-xs text-[#5C615E] dark:text-[#A3A8A5] mt-1.5 leading-snug">
                      {m.statusMessage}
                    </p>
                  )}
                </div>

                <div className="pt-2.5 border-t border-[#DDD7C9] dark:border-[#2B2F2D] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={m.credentialId || ''}
                      onChange={(e) =>
                        onSaveModel({
                          ...m,
                          credentialId: e.target.value || undefined,
                        })
                      }
                      className="text-[11px] font-mono px-2 py-1 rounded bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#5C615E] dark:text-[#A3A8A5]"
                    >
                      <option value="">
                        {linkedCred ? 'Unlink Key' : 'Link Vault Key...'}
                      </option>
                      {credentials.map((c) => (
                        <option key={c.id} value={c.id}>
                          Key: {c.label} ({c.maskedPreview})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={testingModelId === m.id}
                      onClick={() => handleTestConnection(m)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC] hover:border-[#2F5D50] spring-press"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${
                          testingModelId === m.id ? 'animate-spin' : ''
                        }`}
                      />
                      Test Connection
                    </button>
                    {models.length > 2 && (
                      <button
                        type="button"
                        onClick={() => onDeleteModel(m.id)}
                        className="p-1 text-[#6A6558] dark:text-[#8E9490] hover:text-[#B93829]"
                        title="Delete model definition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Web Crypto API (AES-GCM) Encrypted IndexedDB Vault + JSON Portability */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 6 Cols: Web Crypto API Encrypted Vault */}
        <div className="lg:col-span-6 p-5 sm:p-6 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#2F5D50] dark:text-[#5FAE92] font-semibold flex items-center gap-1">
                <Lock className="w-3 h-3" /> Web Crypto API · AES-256-GCM
              </span>
              <h2 className="text-xl font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
                Local Encrypted API Key Vault
              </h2>
              <p className="text-xs text-[#5C615E] dark:text-[#A3A8A5] mt-0.5">
                Keys are encrypted via PBKDF2 (100,000 iterations) + AES-GCM before touching IndexedDB. Never transmitted to any backend or included in JSON exports.
              </p>
            </div>
            <NordicVaultSeal className="w-9 h-9 text-[#1C1B18] dark:text-[#F2F0EC] shrink-0" />
          </div>

          <form
            onSubmit={handleEncryptAndStoreKey}
            className="p-4 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-mono uppercase text-[#6A6558] dark:text-[#8E9490] mb-1">
                  Provider
                </label>
                <select
                  value={keyProvider}
                  onChange={(e) =>
                    setKeyProvider(e.target.value as ModelProvider)
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="custom">Custom Endpoint</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-[#6A6558] dark:text-[#8E9490] mb-1">
                  Key Label
                </label>
                <input
                  type="text"
                  placeholder="Personal OpenRouter Key"
                  value={keyLabel}
                  onChange={(e) => setKeyLabel(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-mono uppercase text-[#6A6558] dark:text-[#8E9490] mb-1">
                  Raw Provider API Key
                </label>
                <input
                  type="password"
                  required
                  placeholder="sk-..."
                  value={rawApiKey}
                  onChange={(e) => setRawApiKey(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-[#6A6558] dark:text-[#8E9490] mb-1">
                  Vault Passphrase
                </label>
                {vaultUnlocked ? (
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs rounded-lg bg-[#2F5D50]/10 border border-[#2F5D50]/30 text-[#2F5D50] dark:text-[#5FAE92]">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5" /> Unlocked · auto-locks after{' '}
                      {AUTO_LOCK_MS / 60000} min idle
                    </span>
                    <button
                      type="button"
                      onClick={() => lockVault()}
                      className="font-mono text-[11px] underline underline-offset-2"
                    >
                      Lock now
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={`Min ${MIN_PASSPHRASE_LENGTH} characters`}
                      value={vaultPassphrase}
                      onChange={(e) => setVaultPassphrase(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUnlock(e);
                      }}
                      className="min-w-0 flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                    />
                    <button
                      type="button"
                      onClick={handleUnlock}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1C1B18] text-white dark:bg-[#F2F0EC] dark:text-[#1C1B18] spring-press"
                    >
                      Unlock
                    </button>
                  </div>
                )}
                <p className="mt-1 text-[10px] leading-snug text-[#6A6558] dark:text-[#8E9490]">
                  {vaultError ??
                    'Never stored or exported. First time? Whatever you enter becomes your passphrase. Forget it and you re-enter your API keys.'}
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={encrypting || !rawApiKey.trim() || !vaultUnlocked}
              className="w-full py-2 rounded-lg text-xs font-semibold bg-[#2F5D50] hover:bg-[#1E3D34] text-white flex items-center justify-center gap-1.5 spring-press disabled:opacity-50"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {encrypting
                ? 'Encrypting via Web Crypto AES-GCM...'
                : 'Encrypt & Store in IndexedDB'}
            </button>
          </form>

          {/* Stored Encrypted Credentials List */}
          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#6A6558] dark:text-[#8E9490] flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              IndexedDB Encrypted Credentials ({credentials.length})
            </span>

            {credentials.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-[#DDD7C9] dark:border-[#2B2F2D] text-xs text-[#6A6558] dark:text-[#8E9490] text-center">
                No encrypted API keys stored yet. Add a key above to enable live browser-to-provider API calls, or run trials in zero-cost Sandbox / Manual mode.
              </div>
            ) : (
              credentials.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                        {c.label}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#2A6F4E]/15 text-[#2A6F4E] font-semibold">
                        AES-GCM
                      </span>
                      {isLegacyCredential(c) && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#A8502F]/15 text-[#A8502F] font-semibold">
                          LEGACY · re-save to upgrade
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-[#6A6558] dark:text-[#8E9490] truncate">
                      {c.provider.toUpperCase()} · {c.maskedPreview} · IV:{' '}
                      {c.ivBase64.slice(0, 8)}…
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleVerifyDecryption(c)}
                      className="px-2.5 py-1 rounded text-[11px] font-mono border border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#FAF8F3] dark:bg-[#1B1E1D] text-[#1C1B18] dark:text-[#F2F0EC]"
                    >
                      {verifiedCredId === c.id ? (
                        <span className="text-[#2A6F4E] flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> Verified
                        </span>
                      ) : (
                        'Verify Decrypt'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteCredential(c.id)}
                      className="p-1.5 text-[#6A6558] dark:text-[#8E9490] hover:text-[#B93829]"
                      title="Delete encrypted credential"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 6 Cols: Full Event JSON Export / Import Portability Center */}
        <div className="lg:col-span-6 p-5 sm:p-6 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] space-y-4">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#A8502F] font-semibold flex items-center gap-1">
              <FileJson className="w-3.5 h-3.5" /> First-Class Data Portability
            </span>
            <h2 className="text-xl font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
              Full Event Export & Import (JSON)
            </h2>
            <p className="text-xs text-[#5C615E] dark:text-[#A3A8A5] mt-0.5">
              Back up, move across browsers, or duplicate complete competitions including conversations, portfolio snapshots, submissions, and rubric scores.
            </p>
          </div>

          {/* Export Actions */}
          <div className="p-4 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] space-y-2.5">
            <span className="block text-xs font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
              Export Active Trial or Complete Workspace
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const json = exportSingleTrialJson(trial, models);
                  handleDownloadJsonFile(
                    `${trial.id}_model_trials_v030.json`,
                    json
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#2F5D50] text-white hover:bg-[#1E3D34] spring-press"
              >
                <Download className="w-3.5 h-3.5" />
                Export Active Trial (.JSON)
              </button>

              <button
                type="button"
                onClick={() => {
                  const json = exportAllWorkspaceJson(allTrials, models);
                  handleDownloadJsonFile(
                    `model_trials_full_backup_${new Date()
                      .toISOString()
                      .slice(0, 10)}.json`,
                    json
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC]"
              >
                <Download className="w-3.5 h-3.5" />
                Export All ({allTrials.length}) Trials
              </button>

              <button
                type="button"
                onClick={() => {
                  const json = exportSingleTrialJson(trial, models);
                  navigator.clipboard.writeText(json);
                  setCopiedExport(true);
                  setTimeout(() => setCopiedExport(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#5C615E] dark:text-[#A3A8A5]"
              >
                {copiedExport ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#2A6F4E]" /> Copied JSON!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy JSON
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Import Form */}
          <form
            onSubmit={handleRunImport}
            className="p-4 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                Restore or Duplicate Trial from JSON
              </span>
              <label className="inline-flex items-center gap-1 text-xs font-semibold text-[#2F5D50] dark:text-[#5FAE92] cursor-pointer hover:underline">
                <Upload className="w-3.5 h-3.5" /> Upload .JSON File
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <textarea
              rows={4}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder='Paste exported Model Trials JSON bundle here ({"schemaVersion": "0.3.0", "events": [...]})...'
              className="w-full p-2.5 text-xs font-mono rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-[#5C615E] dark:text-[#A3A8A5] cursor-pointer">
                <input
                  type="checkbox"
                  checked={duplicateOnImport}
                  onChange={(e) => setDuplicateOnImport(e.target.checked)}
                  className="rounded accent-[#2F5D50]"
                />
                Import as Duplicate Copy (preserves existing event ID)
              </label>

              <button
                type="submit"
                disabled={!importJsonText.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#2F5D50] text-white disabled:opacity-50 spring-press"
              >
                <Activity className="w-3.5 h-3.5" />
                Import into IndexedDB
              </button>
            </div>

            {importStatus && (
              <div
                className={`p-2.5 rounded-lg text-xs font-medium ${
                  importStatus.type === 'success'
                    ? 'bg-[#2A6F4E]/15 text-[#2A6F4E]'
                    : 'bg-[#B93829]/15 text-[#B93829]'
                }`}
              >
                {importStatus.message}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
