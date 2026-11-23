import { describe, expect, it } from 'vitest';
import { INITIAL_TRIAL_EVENTS } from '../data/seedTrials';
import { buildSystemPromptForParticipant } from './aiExecutionEngine';
import type { TrialEvent } from '../types/trial';

const base = INITIAL_TRIAL_EVENTS.find((t) => t.participants.length >= 3)!;
const withMode = (mode: TrialEvent['visibilityMode']): TrialEvent => ({ ...base, visibilityMode: mode });

describe('visibility enforcement in prompts', () => {
  const self = base.participants[0];
  const others = base.participants.slice(1);

  it('ISOLATED reveals nothing about other participants', () => {
    const prompt = buildSystemPromptForParticipant(withMode('ISOLATED'), self);
    for (const o of others) {
      expect(prompt).not.toContain(o.pseudonym);
      expect(prompt).not.toContain(o.modelName);
    }
  });

  it('BLIND hides peer names and model names but marks the reader', () => {
    const prompt = buildSystemPromptForParticipant(withMode('BLIND'), self);
    expect(prompt).toContain('[YOU]');
    for (const o of others) {
      expect(prompt).not.toContain(o.pseudonym);
      expect(prompt).not.toContain(o.modelName);
    }
  });

  it('OPEN exposes the field', () => {
    const prompt = buildSystemPromptForParticipant(withMode('OPEN'), self);
    for (const o of others) expect(prompt).toContain(o.pseudonym);
  });
});
