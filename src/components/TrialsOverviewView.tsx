import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Award,
  CheckCircle2,
  Clock,
  Coins,
  Download,
  Eye,
  EyeOff,
  FileEdit,
  Lock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Terminal,
  TrendingUp,
} from 'lucide-react';
import { COMPETITION_TEMPLATES } from '../data/seedTrials';
import { getParticipantAverageScore } from '../services/aiExecutionEngine';
import { criterionAverages, rankParticipants } from '../services/ranking';
import {
  EventLifecycle,
  Participant,
  TrialEvent,
} from '../types/trial';
import { EquityComparisonChart, MiniSparkline } from './NordicGraphics';

interface TrialsOverviewViewProps {
  trial: TrialEvent;
  allTrials: TrialEvent[];
  onSelectTrial: (trialId: string) => void;
  onOpenNewTrialModal: (templateId?: string) => void;
  onJumpToParticipantArena: (participantId: string) => void;
  onJumpToMilestones: (milestoneId?: string) => void;
  onResumeMissedSchedule: (scheduleId: string) => Promise<void>;
  onUpdateLifecycle: (newStatus: EventLifecycle, winnerId?: string) => void;
  onAmendRules: (newRules: string, reason: string) => void;
  onExportCurrentTrial: () => void;
}

export const TrialsOverviewView: React.FC<TrialsOverviewViewProps> = ({
  trial,
  allTrials,
  onSelectTrial,
  onOpenNewTrialModal,
  onJumpToParticipantArena,
  onJumpToMilestones,
  onResumeMissedSchedule,
  onUpdateLifecycle,
  onAmendRules,
  onExportCurrentTrial,
}) => {
  const [selectedHoldingParticipantId, setSelectedHoldingParticipantId] =
    useState<string>(trial.participants[0]?.id || '');
  const [isAmendingRules, setIsAmendingRules] = useState(false);
  const [draftRules, setDraftRules] = useState(trial.rules);
  const [amendReason, setAmendReason] = useState('');
  const [resumingScheduleId, setResumingScheduleId] = useState<string | null>(
    null
  );

  const missedSchedules = trial.schedules.filter((s) => s.status === 'MISSED');

  const ranked = rankParticipants(trial);
  const rankedParticipants = ranked.map((r) => r.participant);

  const totalCostUsd = trial.participants.reduce(
    (sum, p) => sum + (p.estimatedCostUsd || 0),
    0
  );
  const totalTokens = trial.participants.reduce(
    (sum, p) => sum + (p.totalTokens || 0),
    0
  );

  const completedMilestonesCount = trial.milestones.filter(
    (m) => m.status === 'COMPLETED'
  ).length;

  const inspectedParticipant: Participant | undefined =
    trial.participants.find((p) => p.id === selectedHoldingParticipantId) ||
    rankedParticipants[0];

  const latestSnapshot =
    inspectedParticipant?.portfolioHistory[
      inspectedParticipant.portfolioHistory.length - 1
    ];

  const handleResumeClick = async (schedId: string) => {
    setResumingScheduleId(schedId);
    try {
      await onResumeMissedSchedule(schedId);
    } finally {
      setResumingScheduleId(null);
    }
  };

  const handleSaveAmendment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amendReason.trim()) return;
    onAmendRules(draftRules, amendReason.trim());
    setAmendReason('');
    setIsAmendingRules(false);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Missed Schedule Alert Banner (Persistence & Resume Requirement) */}
      {missedSchedules.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-[#D98A2B]/12 border border-[#D98A2B]/40">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#D98A2B] shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider font-semibold text-[#D98A2B]">
                  Pending Schedule Detected ({missedSchedules.length})
                </span>
                <span className="text-[11px] font-mono text-[#5C615E] dark:text-[#A3A8A5]">
                  Logged while browser tab was closed
                </span>
              </div>
              <p className="text-sm font-medium text-[#1C1B18] dark:text-[#F2F0EC] mt-0.5">
                {missedSchedules[0].title}
              </p>
              <p className="text-xs text-[#5C615E] dark:text-[#A3A8A5] line-clamp-1 mt-0.5">
                {missedSchedules[0].promptTemplate}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={resumingScheduleId === missedSchedules[0].id}
            onClick={() => handleResumeClick(missedSchedules[0].id)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#2F5D50] hover:bg-[#1E3D34] text-white shrink-0 spring-press disabled:opacity-60"
          >
            <RotateCcw
              className={`w-3.5 h-3.5 ${
                resumingScheduleId === missedSchedules[0].id
                  ? 'animate-spin'
                  : ''
              }`}
            />
            {resumingScheduleId === missedSchedules[0].id
              ? 'Dispatching Check-In...'
              : 'Resume & Broadcast Now'}
          </button>
        </div>
      )}

      {/* Hero Trial Header Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-[#EBE6DB] dark:bg-[#242826] text-[#5C615E] dark:text-[#A3A8A5]">
                {trial.category}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-[#2F5D50]/10 text-[#2F5D50] dark:text-[#428E72] font-semibold">
                {trial.visibilityMode === 'ISOLATED' && (
                  <Lock className="w-3 h-3" />
                )}
                {trial.visibilityMode === 'BLIND' && (
                  <EyeOff className="w-3 h-3" />
                )}
                {trial.visibilityMode === 'OPEN' && <Eye className="w-3 h-3" />}
                {trial.visibilityMode} MODE
              </span>
              {trial.isRealMoney && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-[#A8502F]/15 text-[#A8502F] font-semibold">
                  <Coins className="w-3 h-3" />${trial.startingCapitalPerParticipant.toLocaleString()}{' '}
                  / Model Real-Money
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-editorial text-[#1C1B18] dark:text-[#F2F0EC] leading-tight">
              {trial.title}
            </h1>
            <p className="text-xs sm:text-sm text-[#5C615E] dark:text-[#A3A8A5] leading-relaxed">
              {trial.objective}
            </p>
          </div>

          {/* Lifecycle Controls & Quick Export */}
          <div className="flex flex-wrap items-center gap-2">
            {trial.status === 'RUNNING' && (
              <>
                <button
                  type="button"
                  onClick={() => onUpdateLifecycle('PAUSED')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#5C615E] dark:text-[#A3A8A5] hover:bg-[#F4F1EA] dark:hover:bg-[#242826]"
                >
                  <Pause className="w-3.5 h-3.5" /> Pause
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateLifecycle('COMPLETED', rankedParticipants[0]?.id)
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2F5D50] text-white hover:bg-[#1E3D34] spring-press"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Complete Trial
                </button>
              </>
            )}
            {trial.status === 'PAUSED' && (
              <button
                type="button"
                onClick={() => onUpdateLifecycle('RUNNING')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2F5D50] text-white"
              >
                <Play className="w-3.5 h-3.5" /> Resume Trial
              </button>
            )}
            {trial.status === 'COMPLETED' && (
              <button
                type="button"
                onClick={() => onUpdateLifecycle('RUNNING')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#5C615E] dark:text-[#A3A8A5]"
              >
                Reopen Trial
              </button>
            )}
            <button
              type="button"
              onClick={onExportCurrentTrial}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC] hover:bg-[#F4F1EA] dark:hover:bg-[#242826]"
              title="Export complete event history, submissions & evaluations as JSON"
            >
              <Download className="w-3.5 h-3.5" /> Export JSON
            </button>
          </div>
        </div>

        {/* 4-Metric Nordic Telemetry Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-[#DDD7C9] dark:border-[#2B2F2D]">
          <div>
            <span className="block text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
              Current Leader
            </span>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor:
                    rankedParticipants[0]?.colorHex || '#2F5D50',
                }}
              />
              <span className="text-sm font-semibold text-[#1C1B18] dark:text-[#F2F0EC] truncate">
                {rankedParticipants[0]?.pseudonym}
              </span>
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
              {trial.isRealMoney ? 'Leader Net P&L' : 'Top Rubric Score'}
            </span>
            <span className="block text-sm font-mono font-semibold tabular-nums mt-1 text-[#2A6F4E]">
              {trial.isRealMoney && rankedParticipants[0]
                ? `$${rankedParticipants[0].currentEquityUsd.toLocaleString(
                    'en-US',
                    { minimumFractionDigits: 2 }
                  )} (+${(
                    ((rankedParticipants[0].currentEquityUsd -
                      rankedParticipants[0].startingCapitalUsd) /
                      Math.max(1, rankedParticipants[0].startingCapitalUsd)) *
                    100
                  ).toFixed(2)}%)`
                : `${getParticipantAverageScore(
                    rankedParticipants[0]
                  ).toFixed(1)} / 100 pts`}
            </span>
          </div>

          <div>
            <span className="block text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
              Milestones & Checkpoints
            </span>
            <button
              type="button"
              onClick={() => onJumpToMilestones()}
              className="text-sm font-mono font-semibold tabular-nums mt-1 text-[#1C1B18] dark:text-[#F2F0EC] hover:text-[#2F5D50] flex items-center gap-1"
            >
              {completedMilestonesCount} / {trial.milestones.length} Completed
              <ArrowUpRight className="w-3.5 h-3.5 text-[#8E9490]" />
            </button>
          </div>

          <div>
            <span className="block text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
              Est. API Telemetry
            </span>
            <span className="block text-sm font-mono font-semibold tabular-nums mt-1 text-[#1C1B18] dark:text-[#F2F0EC]">
              ${totalCostUsd.toFixed(2)} · {(totalTokens / 1000).toFixed(1)}k tok
            </span>
          </div>
        </div>
      </div>

      {/* Main Split Grid: Performance Chart + Standings Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Multi-Line SVG Trajectory Chart */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
                  Independent Execution Telemetry
                </span>
                <h2 className="text-lg font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
                  {trial.isRealMoney
                    ? 'Multi-Model Capital Curve ($ USD) & Rubric Trajectory'
                    : 'Multi-Model Rubric Score Trajectory'}
                </h2>
              </div>
              <TrendingUp className="w-4 h-4 text-[#2F5D50] dark:text-[#428E72]" />
            </div>

            <EquityComparisonChart
              participants={trial.participants}
              isRealMoney={trial.isRealMoney}
              startingCapital={trial.startingCapitalPerParticipant}
              currency={trial.currency}
            />
          </div>

          {trial.isRealMoney && (
            <div className="mt-4 pt-3 border-t border-[#DDD7C9] dark:border-[#2B2F2D] flex items-center gap-2 text-[11px] text-[#5C615E] dark:text-[#A3A8A5]">
              <ShieldAlert className="w-3.5 h-3.5 text-[#A8502F] shrink-0" />
              <span>
                <strong>Compliance Principle:</strong> Model Trials records decisions, portfolio snapshots & P&L reported by the operator. User is solely responsible for all external capital and risk.
              </span>
            </div>
          )}
        </div>

        {/* Right 5 Cols: Ranked Leaderboard Cards (Max 4 Data Points per Card) */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
                Weighted Standings
              </span>
              <h2 className="text-lg font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
                Participant Leaderboard
              </h2>
            </div>
            <Award className="w-4 h-4 text-[#A8502F]" />
          </div>

          <div className="space-y-2.5">
            {rankedParticipants.map((p, index) => {
              const avgScore = getParticipantAverageScore(p);
              const pnlUsd = p.currentEquityUsd - p.startingCapitalUsd;
              const pnlPct =
                p.startingCapitalUsd > 0
                  ? (pnlUsd / p.startingCapitalUsd) * 100
                  : 0;
              const sparkPoints = p.equityCurve.map((pt) =>
                trial.isRealMoney ? pt.value : pt.score
              );
              const isWinner = trial.winnerParticipantId === p.id;

              return (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    selectedHoldingParticipantId === p.id
                      ? 'border-[#2F5D50] bg-[#F4F1EA] dark:bg-[#242826]'
                      : 'border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#F4F1EA]/50 dark:bg-[#121413]/60 hover:border-[#8E9490]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    {/* Data Point 1: Rank & Identity */}
                    <div
                      className="flex items-center gap-2.5 min-w-0 cursor-pointer"
                      onClick={() => setSelectedHoldingParticipantId(p.id)}
                    >
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold text-white shrink-0"
                        style={{ backgroundColor: p.colorHex }}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-[#1C1B18] dark:text-[#F2F0EC] truncate">
                            {p.pseudonym}
                          </span>
                          {isWinner && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#A8502F] text-white font-semibold">
                              WINNER
                            </span>
                          )}
                        </div>
                        <span className="block text-[11px] text-[#5C615E] dark:text-[#A3A8A5] truncate">
                          {p.modelName}
                          {ranked[index].tieBrokenBy && (
                            <span className="ml-1.5 text-[10px] font-mono text-[#A8502F]">
                              tie · {ranked[index].tieBrokenBy === 'equity' ? 'higher equity' : ranked[index].tieBrokenBy === 'cost' ? 'lower cost' : 'by name'}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Data Point 2: Sparkline */}
                    <div className="shrink-0">
                      <MiniSparkline
                        points={sparkPoints}
                        color={p.colorHex}
                        width={56}
                        height={24}
                      />
                    </div>

                    {/* Data Point 3 & 4: P&L / Equity + Rubric Score */}
                    <div className="text-right font-mono tabular-nums shrink-0">
                      {trial.isRealMoney ? (
                        <>
                          <div className="text-xs font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                            ${p.currentEquityUsd.toLocaleString('en-US', {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}{' '}
                            <span
                              className={
                                pnlPct >= 0
                                  ? 'text-[#2A6F4E]'
                                  : 'text-[#B93829]'
                              }
                            >
                              ({pnlPct >= 0 ? '+' : ''}
                              {pnlPct.toFixed(2)}%)
                            </span>
                          </div>
                          <div className="text-[11px] text-[#5C615E] dark:text-[#A3A8A5]">
                            Rubric: <strong className="text-[#1C1B18] dark:text-[#F2F0EC]">{avgScore.toFixed(1)}</strong>/100
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-bold text-[#2F5D50] dark:text-[#428E72]">
                            {avgScore.toFixed(1)}{' '}
                            <span className="text-[10px] font-normal text-[#8E9490]">
                              / 100
                            </span>
                          </div>
                          <div className="text-[10px] text-[#8E9490]">
                            {Object.keys(p.submissions).length} deliverable(s)
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick Workspace Action Strip */}
                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[#DDD7C9]/70 dark:border-[#2B2F2D] text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedHoldingParticipantId(p.id)}
                      className="text-[#5C615E] dark:text-[#A3A8A5] hover:text-[#1C1B18] dark:hover:text-white font-medium"
                    >
                      {trial.isRealMoney
                        ? 'Inspect Holdings & Thesis'
                        : 'Inspect Evaluation Breakdown'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onJumpToParticipantArena(p.id)}
                      className="inline-flex items-center gap-1 font-semibold text-[#2F5D50] dark:text-[#428E72] hover:underline"
                    >
                      <Terminal className="w-3 h-3" /> Open Arena Chat
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Score breakdown per criterion for the inspected participant */}
      {inspectedParticipant && trial.criteria.length > 0 && (
        <div className="p-5 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: inspectedParticipant.colorHex }} />
            <div>
              <span className="label block">Score breakdown</span>
              <h3 className="text-lg font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
                {inspectedParticipant.pseudonym}
              </h3>
            </div>
          </div>
          <div className="space-y-3">
            {criterionAverages(inspectedParticipant, trial.criteria).map(({ criterion, average }) => (
              <div key={criterion.id}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                    {criterion.name}{' '}
                    <span className="font-mono font-normal text-[#8E9490]">{criterion.weight}%</span>
                  </span>
                  <span className="font-mono tabular-nums text-[#5C615E] dark:text-[#A3A8A5]">
                    {average === null ? 'not scored' : `${average} / 100`}
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label={`${criterion.name} score`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={average ?? 0}
                  className="mt-1.5 h-1.5 rounded-full bg-[#EBE6DB] dark:bg-[#242826] overflow-hidden"
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${average ?? 0}%`, backgroundColor: inspectedParticipant.colorHex }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real-Money Portfolio Holdings & Thesis Ledger (When Real-Money Mode is Active) */}
      {trial.isRealMoney && inspectedParticipant && latestSnapshot && (
        <div className="p-5 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <span
                className="w-3.5 h-3.5 rounded-full"
                style={{ backgroundColor: inspectedParticipant.colorHex }}
              />
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
                  Verified Real-Money Sub-Ledger · Sharpe Est:{' '}
                  {latestSnapshot.sharpeEstimate} · Max DD:{' '}
                  {latestSnapshot.maxDrawdownPct}%
                </span>
                <h3 className="text-lg font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
                  {inspectedParticipant.pseudonym} ({inspectedParticipant.modelName}) — Active Positions
                </h3>
              </div>
            </div>

            {/* Participant Switcher Pills */}
            <div className="flex flex-wrap gap-1.5">
              {trial.participants.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedHoldingParticipantId(p.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                    inspectedParticipant.id === p.id
                      ? 'bg-[#1C1B18] dark:bg-[#F2F0EC] text-white dark:text-[#1C1B18]'
                      : 'bg-[#F4F1EA] dark:bg-[#121413] text-[#5C615E] dark:text-[#A3A8A5]'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: p.colorHex }}
                  />
                  {p.pseudonym}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-[#5C615E] dark:text-[#A3A8A5] mb-4 p-3 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D]">
            <strong className="text-[#1C1B18] dark:text-[#F2F0EC]">
              Latest Rebalance Rationale:
            </strong>{' '}
            {latestSnapshot.rationale}{' '}
            <span className="font-mono text-[11px] text-[#A8502F]">
              ({latestSnapshot.recentTradesSummary})
            </span>
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DDD7C9] dark:border-[#2B2F2D] text-[11px] font-mono uppercase text-[#8E9490]">
                  <th className="py-2 pr-3">Ticker / Asset</th>
                  <th className="py-2 px-3 text-right">Weight</th>
                  <th className="py-2 px-3 text-right">Entry → Mark</th>
                  <th className="py-2 px-3 text-right">Net P&L</th>
                  <th className="py-2 pl-3">Model Thesis & Conviction Trigger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDD7C9]/60 dark:divide-[#2B2F2D] text-xs">
                {latestSnapshot.positions.map((pos, i) => (
                  <tr key={i} className="hover:bg-[#F4F1EA]/50 dark:hover:bg-[#121413]/40">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-[#EBE6DB] dark:bg-[#242826] text-[#1C1B18] dark:text-[#F2F0EC]">
                          {pos.ticker}
                        </span>
                        <span className="font-medium text-[#1C1B18] dark:text-[#F2F0EC]">
                          {pos.assetName}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                      {pos.allocationPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#5C615E] dark:text-[#A3A8A5]">
                      ${pos.entryPrice.toFixed(2)} → ${pos.currentPrice.toFixed(2)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold ${
                        pos.pnlUsd >= 0 ? 'text-[#2A6F4E]' : 'text-[#B93829]'
                      }`}
                    >
                      {pos.pnlUsd >= 0 ? '+' : ''}${pos.pnlUsd.toFixed(1)} (
                      {pos.pnlPct >= 0 ? '+' : ''}
                      {pos.pnlPct.toFixed(2)}%)
                    </td>
                    <td className="py-2.5 pl-3 text-[#5C615E] dark:text-[#A3A8A5] max-w-md">
                      {pos.thesis}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rules, Criteria & Immutable Audit History Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Immutable Rules & Amendments */}
        <div className="p-5 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
                Governance & Constraints
              </span>
              <h3 className="text-lg font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
                Rules, Rubric Weights & Amendments
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setDraftRules(trial.rules);
                setIsAmendingRules(!isAmendingRules);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#2F5D50] dark:text-[#428E72] hover:underline"
            >
              <FileEdit className="w-3.5 h-3.5" />
              {isAmendingRules ? 'Cancel' : 'Record Rule Amendment'}
            </button>
          </div>

          {isAmendingRules ? (
            <form onSubmit={handleSaveAmendment} className="space-y-3 mb-4 p-3.5 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D]">
              <p className="text-[11px] text-[#5C615E] dark:text-[#A3A8A5]">
                Rules are immutable after start; any modification is permanently recorded in the event amendment ledger.
              </p>
              <textarea
                rows={4}
                value={draftRules}
                onChange={(e) => setDraftRules(e.target.value)}
                className="w-full p-2.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
              />
              <input
                type="text"
                required
                placeholder="Reason for amendment (e.g., Clarified T-Bill dividend accrual)"
                value={amendReason}
                onChange={(e) => setAmendReason(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#2F5D50] text-white"
              >
                Commit Timestamped Amendment
              </button>
            </form>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-xs text-[#5C615E] dark:text-[#A3A8A5] leading-relaxed p-3.5 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D]">
              {trial.rules}
            </pre>
          )}

          {/* Weighted Criteria Breakdown */}
          <div className="mt-4 space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
              Evaluation Rubric (100% Total)
            </span>
            {trial.criteria.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between text-xs py-1.5 border-b border-[#DDD7C9]/60 dark:border-[#2B2F2D]"
              >
                <div>
                  <span className="font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                    {c.name}
                  </span>
                  <p className="text-[11px] text-[#8E9490]">{c.description}</p>
                </div>
                <span className="font-mono font-semibold tabular-nums px-2 py-0.5 rounded bg-[#EBE6DB] dark:bg-[#242826]">
                  {c.weight}%
                </span>
              </div>
            ))}
          </div>

          {trial.ruleAmendments.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[#DDD7C9] dark:border-[#2B2F2D]">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#A8502F]">
                Recorded Amendments ({trial.ruleAmendments.length})
              </span>
              {trial.ruleAmendments.map((am) => (
                <div key={am.id} className="mt-1.5 text-xs text-[#5C615E] dark:text-[#A3A8A5]">
                  <span className="font-mono text-[10px] text-[#8E9490]">
                    [{new Date(am.timestamp).toLocaleDateString()}]
                  </span>{' '}
                  {am.reason}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inspectable Event Timeline & All Trials Switcher */}
        <div className="p-5 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
              Transparent Audit Trail
            </span>
            <h3 className="text-lg font-editorial text-[#1C1B18] dark:text-[#F2F0EC] mb-3">
              Event History & Templates
            </h3>

            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {trial.auditLog.slice(0, 8).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2.5 text-xs p-2.5 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                >
                  <Clock className="w-3.5 h-3.5 text-[#8E9490] shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase px-1.5 py-0.2 rounded bg-[#EBE6DB] dark:bg-[#242826] text-[#5C615E] dark:text-[#A3A8A5]">
                        {entry.category}
                      </span>
                      <span className="font-mono text-[10px] text-[#8E9490]">
                        {new Date(entry.timestamp).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[#1C1B18] dark:text-[#F2F0EC] font-medium mt-1">
                      {entry.summary}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick-Launch Competition Templates Strip */}
          <div className="mt-5 pt-4 border-t border-[#DDD7C9] dark:border-[#2B2F2D]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
                Switch Event or Launch From Template
              </span>
              <button
                type="button"
                onClick={() => onOpenNewTrialModal()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#2F5D50] dark:text-[#428E72]"
              >
                <Plus className="w-3.5 h-3.5" /> Custom Trial
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {allTrials.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTrial(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    t.id === trial.id
                      ? 'border-[#2F5D50] bg-[#2F5D50]/10 text-[#2F5D50] dark:text-[#428E72] font-semibold'
                      : 'border-[#DDD7C9] dark:border-[#2B2F2D] text-[#5C615E] dark:text-[#A3A8A5]'
                  }`}
                >
                  {t.title.slice(0, 34)}
                  {t.title.length > 34 ? '…' : ''} ({t.status})
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {COMPETITION_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onOpenNewTrialModal(tpl.id)}
                  className="p-2.5 rounded-xl border border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#F4F1EA] dark:bg-[#121413] hover:border-[#2F5D50] text-left transition-all spring-press"
                >
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                    <Sparkles className="w-3 h-3 text-[#A8502F] shrink-0" />
                    <span className="truncate">{tpl.name.split(' ')[0]} Trial</span>
                  </div>
                  <span className="block text-[10px] text-[#8E9490] truncate mt-0.5">
                    Launch Template →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
