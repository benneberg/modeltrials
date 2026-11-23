import type { EvaluationCriterion, Participant, TrialEvent } from '../types/trial';

export interface RankedParticipant {
  participant: Participant;
  rank: number;
  score: number;
  /** Set when this participant tied on the previous key and was ordered by a later one. */
  tieBrokenBy?: 'equity' | 'cost' | 'name';
}

export function averageScore(p: Participant): number {
  const evals = Object.values(p.evaluations || {});
  if (evals.length === 0) {
    const last = p.equityCurve[p.equityCurve.length - 1];
    return last?.score || 0;
  }
  const sum = evals.reduce((acc, e) => acc + e.weightedTotal, 0);
  return Number((sum / evals.length).toFixed(2));
}

/** Mean 0-100 score per criterion across all evaluated milestones. */
export function criterionAverages(
  p: Participant,
  criteria: EvaluationCriterion[]
): { criterion: EvaluationCriterion; average: number | null }[] {
  const evals = Object.values(p.evaluations || {});
  return criteria.map((criterion) => {
    const vals = evals
      .map((e) => e.criteriaScores?.[criterion.id])
      .filter((v): v is number => typeof v === 'number');
    return {
      criterion,
      average: vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : null,
    };
  });
}

/**
 * Deterministic ranking.
 * Order: rubric score (high) -> equity (high, real-money only) -> cost (low) -> pseudonym.
 * Real-money trials rank by equity first when either side has no rubric score yet.
 * Tied participants share a rank only if every key is equal; otherwise the key that
 * separated them is reported in `tieBrokenBy` so the UI can say so.
 */
export function rankParticipants(trial: TrialEvent): RankedParticipant[] {
  const rows = trial.participants.map((participant) => ({
    participant,
    score: averageScore(participant),
  }));

  const cmp = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
    const bothScored = a.score > 0 && b.score > 0;
    if (trial.isRealMoney && !bothScored) {
      const d = b.participant.currentEquityUsd - a.participant.currentEquityUsd;
      if (d !== 0) return d;
    }
    if (a.score !== b.score) return b.score - a.score;
    if (trial.isRealMoney) {
      const d = b.participant.currentEquityUsd - a.participant.currentEquityUsd;
      if (d !== 0) return d;
    }
    const c = (a.participant.estimatedCostUsd || 0) - (b.participant.estimatedCostUsd || 0);
    if (c !== 0) return c;
    return a.participant.pseudonym.localeCompare(b.participant.pseudonym);
  };

  const sorted = [...rows].sort(cmp);
  return sorted.map((row, i) => {
    const prev = sorted[i - 1];
    let tieBrokenBy: RankedParticipant['tieBrokenBy'];
    if (prev && prev.score === row.score) {
      if (trial.isRealMoney && prev.participant.currentEquityUsd !== row.participant.currentEquityUsd)
        tieBrokenBy = 'equity';
      else if ((prev.participant.estimatedCostUsd || 0) !== (row.participant.estimatedCostUsd || 0))
        tieBrokenBy = 'cost';
      else tieBrokenBy = 'name';
    }
    return { participant: row.participant, rank: i + 1, score: row.score, tieBrokenBy };
  });
}
