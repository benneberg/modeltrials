import {
  INITIAL_MODEL_DEFINITIONS,
  INITIAL_TRIAL_EVENTS,
} from '../data/seedTrials';
import {
  EncryptedCredential,
  ModelDefinition,
  TrialEvent,
} from '../types/trial';

const DB_NAME = 'ModelTrialsDB_v030';
const DB_VERSION = 1;

const STORE_TRIALS = 'trials';
const STORE_MODELS = 'models';
const STORE_CREDENTIALS = 'credentials';
const STORE_META = 'meta';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TRIALS)) {
        db.createObjectStore(STORE_TRIALS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_MODELS)) {
        db.createObjectStore(STORE_MODELS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CREDENTIALS)) {
        db.createObjectStore(STORE_CREDENTIALS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function putInStore<T>(storeName: string, item: T): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteFromStore(storeName: string, id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function initializeAndLoadDatabase(): Promise<{
  trials: TrialEvent[];
  models: ModelDefinition[];
  credentials: EncryptedCredential[];
}> {
  let trials = await getAllFromStore<TrialEvent>(STORE_TRIALS);
  let models = await getAllFromStore<ModelDefinition>(STORE_MODELS);
  const credentials = await getAllFromStore<EncryptedCredential>(STORE_CREDENTIALS);

  if (models.length === 0) {
    for (const m of INITIAL_MODEL_DEFINITIONS) {
      await putInStore(STORE_MODELS, m);
    }
    models = [...INITIAL_MODEL_DEFINITIONS];
  }

  if (trials.length === 0) {
    for (const t of INITIAL_TRIAL_EVENTS) {
      await putInStore(STORE_TRIALS, t);
    }
    trials = [...INITIAL_TRIAL_EVENTS];
  }

  // Sort trials by updatedAt descending
  trials.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return { trials, models, credentials };
}

export async function saveTrialToDb(trial: TrialEvent): Promise<void> {
  const updated = { ...trial, updatedAt: new Date().toISOString() };
  await putInStore(STORE_TRIALS, updated);
}

export async function deleteTrialFromDb(trialId: string): Promise<void> {
  await deleteFromStore(STORE_TRIALS, trialId);
}

export async function saveModelToDb(model: ModelDefinition): Promise<void> {
  await putInStore(STORE_MODELS, model);
}

export async function deleteModelFromDb(modelId: string): Promise<void> {
  await deleteFromStore(STORE_MODELS, modelId);
}

export async function saveCredentialToDb(cred: EncryptedCredential): Promise<void> {
  await putInStore(STORE_CREDENTIALS, cred);
}

export async function deleteCredentialFromDb(credId: string): Promise<void> {
  await deleteFromStore(STORE_CREDENTIALS, credId);
}

export interface ExportedTrialBundle {
  schemaVersion: '0.3.0';
  exportedAt: string;
  platform: 'Model Trials PWA';
  type: 'SINGLE_EVENT' | 'FULL_WORKSPACE_BACKUP';
  events: TrialEvent[];
  modelDefinitions?: ModelDefinition[];
}

export function exportSingleTrialJson(
  trial: TrialEvent,
  models: ModelDefinition[]
): string {
  const usedModelIds = new Set(trial.participants.map((p) => p.modelDefId));
  const relevantModels = models
    .filter((m) => usedModelIds.has(m.id))
    .map((m) => ({
      ...m,
      // Never export credential IDs or secrets in portable event files
      credentialId: undefined,
    }));

  const bundle: ExportedTrialBundle = {
    schemaVersion: '0.3.0',
    exportedAt: new Date().toISOString(),
    platform: 'Model Trials PWA',
    type: 'SINGLE_EVENT',
    events: [trial],
    modelDefinitions: relevantModels,
  };

  return JSON.stringify(bundle, null, 2);
}

export function exportAllWorkspaceJson(
  trials: TrialEvent[],
  models: ModelDefinition[]
): string {
  const sanitizedModels = models.map((m) => ({
    ...m,
    credentialId: undefined,
  }));

  const bundle: ExportedTrialBundle = {
    schemaVersion: '0.3.0',
    exportedAt: new Date().toISOString(),
    platform: 'Model Trials PWA',
    type: 'FULL_WORKSPACE_BACKUP',
    events: trials,
    modelDefinitions: sanitizedModels,
  };

  return JSON.stringify(bundle, null, 2);
}

const SUPPORTED_SCHEMA_VERSIONS = ['0.3.0'];
const MODEL_PROVIDERS = ['openai', 'anthropic', 'gemini', 'openrouter', 'custom', 'manual'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Throws a readable Error listing the first problems found. Pure, so it is unit-testable. */
export function validateImportPayload(parsed: unknown): {
  events: TrialEvent[];
  models: ModelDefinition[];
} {
  if (!isRecord(parsed)) throw new Error('Import file must be a JSON object.');

  let rawEvents: unknown[];
  let rawModels: unknown[] = [];

  if (Array.isArray(parsed.events)) {
    if (
      typeof parsed.schemaVersion === 'string' &&
      !SUPPORTED_SCHEMA_VERSIONS.includes(parsed.schemaVersion)
    ) {
      throw new Error(
        `Unsupported schemaVersion "${parsed.schemaVersion}". This app reads: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}.`
      );
    }
    rawEvents = parsed.events;
    if (Array.isArray(parsed.modelDefinitions)) rawModels = parsed.modelDefinitions;
  } else if (typeof parsed.id === 'string' && Array.isArray(parsed.participants)) {
    rawEvents = [parsed];
  } else {
    throw new Error('Not a Model Trials export: expected an "events" array or a single event.');
  }

  const problems: string[] = [];
  rawEvents.forEach((ev, i) => {
    if (!isRecord(ev)) return problems.push(`events[${i}] is not an object`);
    if (typeof ev.id !== 'string' || !ev.id) problems.push(`events[${i}].id is missing`);
    if (typeof ev.title !== 'string') problems.push(`events[${i}].title is missing`);
    if (!Array.isArray(ev.participants)) problems.push(`events[${i}].participants must be a list`);
    else if (ev.participants.length > 5) problems.push(`events[${i}] has more than 5 participants`);
    if (!Array.isArray(ev.criteria)) problems.push(`events[${i}].criteria must be a list`);
    else {
      const total = ev.criteria.reduce(
        (sum: number, c: unknown) => sum + (isRecord(c) ? Number(c.weight) || 0 : 0),
        0
      );
      if (ev.criteria.length > 0 && Math.round(total) !== 100)
        problems.push(`events[${i}] criteria weights sum to ${total}, expected 100`);
    }
  });
  rawModels.forEach((m, i) => {
    if (!isRecord(m) || typeof m.id !== 'string')
      return problems.push(`modelDefinitions[${i}].id is missing`);
    if (typeof m.provider !== 'string' || !MODEL_PROVIDERS.includes(m.provider))
      problems.push(`modelDefinitions[${i}].provider is not recognised`);
  });

  if (problems.length) {
    throw new Error(
      `Import rejected. ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ''}`
    );
  }

  return {
    events: rawEvents as unknown as TrialEvent[],
    // Credentials never travel in exports, so strip any link that slipped in.
    models: (rawModels as unknown as ModelDefinition[]).map((m) => ({
      ...m,
      credentialId: undefined,
    })),
  };
}

export async function importTrialBundleJson(
  rawJson: string,
  duplicateAsNew: boolean = false
): Promise<{ importedEvents: TrialEvent[]; importedModels: ModelDefinition[] }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('That is not valid JSON.');
  }
  const { events: eventsToImport, models: modelsToImport } = validateImportPayload(parsed);

  for (const m of modelsToImport) {
    await saveModelToDb(m);
  }

  const savedEvents: TrialEvent[] = [];
  for (const ev of eventsToImport) {
    const finalEvent: TrialEvent = duplicateAsNew
      ? {
          ...ev,
          id: `trial_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: `${ev.title} (Imported Copy)`,
          updatedAt: new Date().toISOString(),
          auditLog: [
            {
              id: `log_imp_${Date.now()}`,
              timestamp: new Date().toISOString(),
              category: 'SYSTEM',
              actor: 'JSON Importer',
              summary: `Event duplicated via JSON Import from "${ev.title}".`,
            },
            ...(ev.auditLog || []),
          ],
        }
      : {
          ...ev,
          updatedAt: new Date().toISOString(),
        };

    await saveTrialToDb(finalEvent);
    savedEvents.push(finalEvent);
  }

  return { importedEvents: savedEvents, importedModels: modelsToImport };
}
