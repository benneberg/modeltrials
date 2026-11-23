import { describe, expect, it } from 'vitest';
import { INITIAL_TRIAL_EVENTS } from '../data/seedTrials';
import { criterionAverages, rankParticipants } from './ranking';
import type { Participant, TrialEvent } from '../types/trial';

const base = INITIAL_TRIAL_EVENTS[0];
const mk = (id: string, score: number, cost: number, equity = 1000): Participant => ({
  ...base.participants[0],
  id,
  pseudonym: id,
  equityCurve: [{ ...(base.participants[0].equityCurve[0] ?? { t: '', value: 0, score: 0 }), score }] as never,
  evaluations: {},
  estimatedCostUsd: cost,
  currentEquityUsd: equity,
});
const trial = (ps: Participant[], real = false): TrialEvent => ({ ...base, isRealMoney: real, participants: ps });

describe('ranking', () => {
  it('orders by score, then lower cost', () => {
    const r = rankParticipants(trial([mk('b', 80, 2), mk('a', 80, 1), mk('c', 90, 9)]));
    expect(r.map((x) => x.participant.id)).toEqual(['c', 'a', 'b']);
    expect(r[2].tieBrokenBy).toBe('cost');
  });

  it('real-money: higher equity breaks a score tie', () => {
    const r = rankParticipants(trial([mk('a', 70, 1, 900), mk('b', 70, 5, 1200)], true));
    expect(r[0].participant.id).toBe('b');
    expect(r[1].tieBrokenBy).toBe('equity');
  });

  it('is stable and falls back to name', () => {
    const r = rankParticipants(trial([mk('z', 50, 1), mk('m', 50, 1)]));
    expect(r.map((x) => x.participant.id)).toEqual(['m', 'z']);
    expect(r[1].tieBrokenBy).toBe('name');
  });

  it('averages each criterion across evaluations and reports null when unscored', () => {
    const p = mk('a', 0, 0);
    p.evaluations = {
      m1: { criteriaScores: { c1: 60 }, weightedTotal: 60 } as never,
      m2: { criteriaScores: { c1: 80 }, weightedTotal: 80 } as never,
    };
    const out = criterionAverages(p, [
      { id: 'c1', name: 'One', description: '', weight: 50 },
      { id: 'c2', name: 'Two', description: '', weight: 50 },
    ]);
    expect(out[0].average).toBe(70);
    expect(out[1].average).toBeNull();
  });
});
