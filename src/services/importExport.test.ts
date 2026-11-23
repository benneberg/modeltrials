import { describe, expect, it } from 'vitest';
import { INITIAL_MODEL_DEFINITIONS, INITIAL_TRIAL_EVENTS } from '../data/seedTrials';
import { exportAllWorkspaceJson, exportSingleTrialJson, validateImportPayload } from './indexedDbStore';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('export / import', () => {
  it('accepts a full workspace export of the seed data', () => {
    const json = exportAllWorkspaceJson(INITIAL_TRIAL_EVENTS, INITIAL_MODEL_DEFINITIONS);
    const out = validateImportPayload(JSON.parse(json));
    expect(out.events).toHaveLength(INITIAL_TRIAL_EVENTS.length);
  });

  it('accepts a single-event export', () => {
    const json = exportSingleTrialJson(INITIAL_TRIAL_EVENTS[0], INITIAL_MODEL_DEFINITIONS);
    expect(validateImportPayload(JSON.parse(json)).events).toHaveLength(1);
  });

  it('never exports credential links, and strips them on import', () => {
    const models = INITIAL_MODEL_DEFINITIONS.map((m) => ({ ...m, credentialId: 'cred_secret' }));
    const json = exportAllWorkspaceJson(INITIAL_TRIAL_EVENTS, models);
    expect(json).not.toContain('cred_secret');
    const tampered = clone(JSON.parse(json));
    tampered.modelDefinitions[0].credentialId = 'cred_injected';
    expect(validateImportPayload(tampered).models[0].credentialId).toBeUndefined();
  });

  it('rejects criteria weights that do not sum to 100', () => {
    const bad = clone(JSON.parse(exportSingleTrialJson(INITIAL_TRIAL_EVENTS[0], [])));
    bad.events[0].criteria[0].weight += 7;
    expect(() => validateImportPayload(bad)).toThrow(/sum to/);
  });

  it('rejects unknown schema versions, junk, and more than 5 participants', () => {
    const good = JSON.parse(exportSingleTrialJson(INITIAL_TRIAL_EVENTS[0], []));
    expect(() => validateImportPayload({ ...good, schemaVersion: '9.9.9' })).toThrow(/Unsupported/);
    expect(() => validateImportPayload('hello')).toThrow();
    expect(() => validateImportPayload({ foo: 1 })).toThrow(/Not a Model Trials export/);
    const many = clone(good);
    many.events[0].participants = Array.from({ length: 6 }, () => many.events[0].participants[0]);
    expect(() => validateImportPayload(many)).toThrow(/more than 5/);
  });
});
