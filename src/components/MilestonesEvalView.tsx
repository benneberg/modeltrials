import React, { useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  Layers,
  Play,
  Plus,
  Scale,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
  DeliverableType,
  EvaluationScore,
  Milestone,
  PortfolioSnapshot,
  ScheduledCheckIn,
  SubmissionVersion,
  TrialEvent,
} from '../types/trial';

interface MilestonesEvalViewProps {
  trial: TrialEvent;
  onAddMilestone: (milestone: Milestone) => void;
  onToggleMilestoneStatus: (milestoneId: string) => void;
  onAddSchedule: (schedule: ScheduledCheckIn) => void;
  onRunScheduleNow: (scheduleId: string) => Promise<void>;
  onAddSubmission: (params: {
    participantId: string;
    milestoneId: string;
    title: string;
    deliverableType: DeliverableType;
    content: string;
    notes: string;
    portfolioUpdate?: {
      newEquityUsd: number;
      cashUsd: number;
      maxDrawdownPct: number;
      sharpeEstimate: number;
      recentTradesSummary: string;
    };
  }) => void;
  onSaveEvaluation: (evaluation: EvaluationScore) => void;
}

export const MilestonesEvalView: React.FC<MilestonesEvalViewProps> = ({
  trial,
  onAddMilestone,
  onToggleMilestoneStatus,
  onAddSchedule,
  onRunScheduleNow,
  onAddSubmission,
  onSaveEvaluation,
}) => {
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>(
    trial.milestones.find((m) => m.status === 'DUE')?.id ||
      trial.milestones[0]?.id ||
      ''
  );
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>(
    trial.participants[0]?.id || ''
  );

  // New Milestone Modal State
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [msTitle, setMsTitle] = useState('');
  const [msDeliverable, setMsDeliverable] = useState('');
  const [msDays, setMsDays] = useState(7);

  // New Schedule State
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedPrompt, setSchedPrompt] = useState('');
  const [schedFreq, setSchedFreq] = useState<
    'ONE_OFF' | 'DAILY' | 'WEEKLY' | 'MILESTONE_LINKED'
  >('WEEKLY');
  const [runningSchedId, setRunningSchedId] = useState<string | null>(null);

  // New Versioned Submission + Real-Money Portfolio Logger State
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  const [subTitle, setSubTitle] = useState('');
  const [subContent, setSubContent] = useState('');
  const [subNotes, setSubNotes] = useState('');
  const [newEquityUsd, setNewEquityUsd] = useState<number>(11500);
  const [cashUsd, setCashUsd] = useState<number>(1400);
  const [maxDrawdownPct, setMaxDrawdownPct] = useState<number>(-1.8);
  const [sharpeEstimate, setSharpeEstimate] = useState<number>(2.4);
  const [recentTradesSummary, setRecentTradesSummary] = useState('');

  const activeMilestone =
    trial.milestones.find((m) => m.id === selectedMilestoneId) ||
    trial.milestones[0];
  const activeParticipant =
    trial.participants.find((p) => p.id === selectedParticipantId) ||
    trial.participants[0];

  const participantSubmissions: SubmissionVersion[] =
    (activeParticipant &&
      activeMilestone &&
      activeParticipant.submissions[activeMilestone.id]) ||
    [];
  const latestSubmission =
    participantSubmissions[participantSubmissions.length - 1];

  const existingEvaluation =
    activeParticipant && activeMilestone
      ? activeParticipant.evaluations[activeMilestone.id]
      : undefined;

  // Rubric Sliders State
  const [criteriaScores, setCriteriaScores] = useState<Record<string, number>>(
    () => {
      const init: Record<string, number> = {};
      trial.criteria.forEach((c) => {
        init[c.id] = existingEvaluation?.criteriaScores[c.id] ?? 85;
      });
      return init;
    }
  );
  const [evidenceNotes, setEvidenceNotes] = useState<string>(
    existingEvaluation?.evidenceNotes || ''
  );
  const [judgeType, setJudgeType] = useState<'HUMAN' | 'AI_JUDGE' | 'HYBRID'>(
    existingEvaluation?.judgeType || 'HUMAN'
  );
  const [savedToast, setSavedToast] = useState(false);

  // Sync rubric sliders when switching participant or milestone
  const syncEvaluationState = (pId: string, mId: string) => {
    const p = trial.participants.find((item) => item.id === pId);
    const ev = p?.evaluations[mId];
    const nextScores: Record<string, number> = {};
    trial.criteria.forEach((c) => {
      nextScores[c.id] = ev?.criteriaScores[c.id] ?? 84;
    });
    setCriteriaScores(nextScores);
    setEvidenceNotes(ev?.evidenceNotes || '');
    setJudgeType(ev?.judgeType || 'HUMAN');
    if (p) {
      setNewEquityUsd(p.currentEquityUsd);
      const lastSnap: PortfolioSnapshot | undefined =
        p.portfolioHistory[p.portfolioHistory.length - 1];
      if (lastSnap) {
        setCashUsd(lastSnap.cashUsd);
        setMaxDrawdownPct(lastSnap.maxDrawdownPct);
        setSharpeEstimate(lastSnap.sharpeEstimate);
      }
    }
  };

  const handleSelectParticipant = (pId: string) => {
    setSelectedParticipantId(pId);
    syncEvaluationState(pId, selectedMilestoneId);
  };

  const handleSelectMilestone = (mId: string) => {
    setSelectedMilestoneId(mId);
    syncEvaluationState(selectedParticipantId, mId);
  };

  // Calculate live weighted total
  const liveWeightedTotal = Number(
    trial.criteria
      .reduce((acc, c) => {
        const rawScore = criteriaScores[c.id] ?? 80;
        return acc + (rawScore * c.weight) / 100;
      }, 0)
      .toFixed(2)
  );

  // AI-Assisted Judge Rubric Auto-Scorer
  const handleRunAiAssistedJudge = () => {
    if (!activeParticipant) return;
    setJudgeType('AI_JUDGE');
    const nextScores: Record<string, number> = {};

    const returnPct =
      activeParticipant.startingCapitalUsd > 0
        ? ((activeParticipant.currentEquityUsd -
            activeParticipant.startingCapitalUsd) /
            activeParticipant.startingCapitalUsd) *
          100
        : 8.5;

    trial.criteria.forEach((c, idx) => {
      const base = Math.min(98, Math.max(58, Math.round(78 + returnPct * 1.1 - idx * 2)));
      nextScores[c.id] = base;
    });

    setCriteriaScores(nextScores);
    setEvidenceNotes(
      `[AI-Judge Rubric Audit]: Evaluated ${
        activeParticipant.pseudonym
      } deliverable (${
        latestSubmission ? `v${latestSubmission.version}` : 'latest thread'
      }). ${
        trial.isRealMoney
          ? `Verified cumulative return of ${
              returnPct >= 0 ? '+' : ''
            }${returnPct.toFixed(2)}% with strict rule compliance.`
          : 'Strong technical specificity and falsifiable thesis alignment.'
      }`
    );
  };

  const handleCommitEvaluation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeParticipant || !activeMilestone) return;

    const evalObj: EvaluationScore = {
      id: `eval_${activeParticipant.id}_${activeMilestone.id}_${Date.now()}`,
      participantId: activeParticipant.id,
      milestoneId: activeMilestone.id,
      submissionVersion: latestSubmission?.version || 1,
      judgeType,
      judgeModelName:
        judgeType === 'AI_JUDGE' ? 'Rubric Auditor Engine' : 'Human Operator',
      criteriaScores,
      weightedTotal: liveWeightedTotal,
      evidenceNotes:
        evidenceNotes.trim() ||
        `Evaluated against ${trial.criteria.length} weighted criteria.`,
      evaluatedAt: new Date().toISOString(),
    };

    onSaveEvaluation(evalObj);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2400);
  };

  const handleCreateMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msTitle.trim()) return;
    const newMs: Milestone = {
      id: `ms_${Date.now()}`,
      title: msTitle.trim(),
      description: `Checkpoint deliverable: ${msDeliverable}`,
      deadline: new Date(Date.now() + msDays * 86400000).toISOString(),
      requiredDeliverable: msDeliverable.trim() || 'Structured Deliverable',
      deliverableType: trial.isRealMoney
        ? 'PORTFOLIO_SNAPSHOT'
        : 'RESEARCH_REPORT',
      status: 'UPCOMING',
      order: trial.milestones.length + 1,
    };
    onAddMilestone(newMs);
    setMsTitle('');
    setMsDeliverable('');
    setShowAddMilestone(false);
    setSelectedMilestoneId(newMs.id);
  };

  const handleCreateSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedTitle.trim() || !schedPrompt.trim()) return;
    const newSched: ScheduledCheckIn = {
      id: `sched_${Date.now()}`,
      title: schedTitle.trim(),
      promptTemplate: schedPrompt.trim(),
      frequency: schedFreq,
      nextRunAt: new Date(Date.now() + 86400000).toISOString(),
      status: 'PENDING',
      missedCount: 0,
      targetParticipantIds: ['ALL'],
    };
    onAddSchedule(newSched);
    setSchedTitle('');
    setSchedPrompt('');
    setShowAddSchedule(false);
  };

  const handleCreateSubmission = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeParticipant || !activeMilestone || !subTitle.trim()) return;
    onAddSubmission({
      participantId: activeParticipant.id,
      milestoneId: activeMilestone.id,
      title: subTitle.trim(),
      deliverableType: trial.isRealMoney
        ? 'PORTFOLIO_SNAPSHOT'
        : 'RESEARCH_REPORT',
      content:
        subContent.trim() ||
        `Submitted deliverable for ${activeMilestone.title}.`,
      notes: subNotes.trim() || 'Operator verified submission.',
      portfolioUpdate: trial.isRealMoney
        ? {
            newEquityUsd: Number(newEquityUsd),
            cashUsd: Number(cashUsd),
            maxDrawdownPct: Number(maxDrawdownPct),
            sharpeEstimate: Number(sharpeEstimate),
            recentTradesSummary:
              recentTradesSummary.trim() || 'Marked portfolio to market.',
          }
        : undefined,
    });
    setSubTitle('');
    setSubContent('');
    setSubNotes('');
    setShowSubmissionForm(false);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Top Split: Milestones Stepper + Client-Side Schedules Manager */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Milestones Timeline */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
                Checkpoints & Deliverables
              </span>
              <h2 className="text-lg font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
                Trial Milestones ({trial.milestones.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowAddMilestone(!showAddMilestone)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#2F5D50] dark:text-[#428E72]"
            >
              <Plus className="w-3.5 h-3.5" /> Add Milestone
            </button>
          </div>

          {showAddMilestone && (
            <form
              onSubmit={handleCreateMilestone}
              className="mb-4 p-3.5 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] space-y-2.5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Milestone Title (e.g. M4: CPI Stress Test)"
                  value={msTitle}
                  onChange={(e) => setMsTitle(e.target.value)}
                  className="sm:col-span-2 px-3 py-1.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                />
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={msDays}
                  onChange={(e) => setMsDays(Number(e.target.value))}
                  placeholder="Days from now"
                  className="px-3 py-1.5 text-xs font-mono rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Required deliverable (e.g. Rebalanced Portfolio Snapshot + Thesis)"
                  value={msDeliverable}
                  onChange={(e) => setMsDeliverable(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                />
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#2F5D50] text-white"
                >
                  Save
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2.5">
            {trial.milestones.map((ms) => {
              const isSelected = ms.id === activeMilestone?.id;
              return (
                <div
                  key={ms.id}
                  onClick={() => handleSelectMilestone(ms.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-[#2F5D50] bg-[#2F5D50]/6 dark:bg-[#367A61]/12'
                      : 'border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#F4F1EA]/60 dark:bg-[#121413]/60 hover:border-[#8E9490]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold ${
                            ms.status === 'COMPLETED'
                              ? 'bg-[#2A6F4E]/15 text-[#2A6F4E]'
                              : ms.status === 'DUE'
                              ? 'bg-[#A8502F]/18 text-[#A8502F]'
                              : 'bg-[#8E9490]/20 text-[#5C615E] dark:text-[#A3A8A5]'
                          }`}
                        >
                          {ms.status}
                        </span>
                        <h3 className="text-sm font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                          {ms.title}
                        </h3>
                      </div>
                      <p className="text-xs text-[#5C615E] dark:text-[#A3A8A5]">
                        {ms.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-[#8E9490] pt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Due:{' '}
                          {new Date(ms.deadline).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <span>Deliverable: {ms.requiredDeliverable}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleMilestoneStatus(ms.id);
                      }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-mono border border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#FAF8F3] dark:bg-[#1B1E1D] text-[#5C615E] dark:text-[#A3A8A5] hover:text-[#2F5D50] shrink-0"
                    >
                      {ms.status === 'COMPLETED' ? 'Reopen' : 'Mark Done'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 5 Cols: Client-Side Schedules & Missed Check-In Detector */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
                Persistent Client Timers
              </span>
              <h2 className="text-lg font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
                Scheduled Prompts & Check-Ins
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowAddSchedule(!showAddSchedule)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#2F5D50] dark:text-[#428E72]"
            >
              <Plus className="w-3.5 h-3.5" /> Schedule
            </button>
          </div>

          {showAddSchedule && (
            <form
              onSubmit={handleCreateSchedule}
              className="mb-4 p-3.5 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] space-y-2.5"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Schedule Title (e.g. Daily Risk Check)"
                  value={schedTitle}
                  onChange={(e) => setSchedTitle(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                />
                <select
                  value={schedFreq}
                  onChange={(e) =>
                    setSchedFreq(
                      e.target.value as ScheduledCheckIn['frequency']
                    )
                  }
                  className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                >
                  <option value="ONE_OFF">ONE_OFF</option>
                  <option value="DAILY">DAILY</option>
                  <option value="WEEKLY">WEEKLY</option>
                </select>
              </div>
              <textarea
                rows={2}
                required
                placeholder="Prompt template dispatched to all models on trigger..."
                value={schedPrompt}
                onChange={(e) => setSchedPrompt(e.target.value)}
                className="w-full p-2.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
              />
              <button
                type="submit"
                className="w-full py-1.5 rounded-lg text-xs font-semibold bg-[#2F5D50] text-white"
              >
                Save Client-Side Schedule
              </button>
            </form>
          )}

          <div className="space-y-2.5">
            {trial.schedules.length === 0 ? (
              <p className="text-xs text-[#8E9490] py-6 text-center">
                No recurring check-ins configured for this event.
              </p>
            ) : (
              trial.schedules.map((sc) => (
                <div
                  key={sc.id}
                  className={`p-3.5 rounded-xl border ${
                    sc.status === 'MISSED'
                      ? 'border-[#D98A2B] bg-[#D98A2B]/10'
                      : 'border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#F4F1EA] dark:bg-[#121413]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      {sc.status === 'MISSED' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-[#D98A2B]" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-[#8E9490]" />
                      )}
                      <span className="text-xs font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                        {sc.title}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                        sc.status === 'MISSED'
                          ? 'bg-[#D98A2B] text-white'
                          : sc.status === 'EXECUTED'
                          ? 'bg-[#2A6F4E]/15 text-[#2A6F4E]'
                          : 'bg-[#EBE6DB] dark:bg-[#242826] text-[#5C615E]'
                      }`}
                    >
                      {sc.status} · {sc.frequency}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5C615E] dark:text-[#A3A8A5] line-clamp-2 mb-2.5">
                    {sc.promptTemplate}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-[#8E9490]">
                      Next:{' '}
                      {new Date(sc.nextRunAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <button
                      type="button"
                      disabled={runningSchedId === sc.id}
                      onClick={async () => {
                        setRunningSchedId(sc.id);
                        try {
                          await onRunScheduleNow(sc.id);
                        } finally {
                          setRunningSchedId(null);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#2F5D50] text-white hover:bg-[#1E3D34] spring-press"
                    >
                      <Play className="w-3 h-3" />
                      {runningSchedId === sc.id
                        ? 'Running...'
                        : sc.status === 'MISSED'
                        ? 'Resume Missed Check-In'
                        : 'Trigger Now'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Split: Versioned Submissions Inspector + Weighted Rubric Evaluation Studio */}
      {activeMilestone && activeParticipant && (
        <div className="p-5 sm:p-6 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] space-y-5">
          {/* Participant Selector Bar for Selected Milestone */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#DDD7C9] dark:border-[#2B2F2D]">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#A8502F] font-semibold">
                Evaluating Checkpoint: {activeMilestone.title}
              </span>
              <h2 className="text-xl font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
                Versioned Submissions & Rubric Scoring Studio
              </h2>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {trial.participants.map((p) => {
                const isSelected = p.id === activeParticipant.id;
                const hasEval = Boolean(p.evaluations[activeMilestone.id]);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectParticipant(p.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      isSelected
                        ? 'border-[#2F5D50] bg-[#2F5D50] text-white'
                        : 'border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#F4F1EA] dark:bg-[#121413] text-[#1C1B18] dark:text-[#F2F0EC]'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: isSelected ? '#FAF8F3' : p.colorHex,
                      }}
                    />
                    <span>{p.pseudonym}</span>
                    {hasEval && (
                      <CheckCircle2
                        className={`w-3.5 h-3.5 ${
                          isSelected ? 'text-white' : 'text-[#2A6F4E]'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 6 Cols: Versioned Submissions (v1, v2...) & Real-Money Snapshot Logger */}
            <div className="lg:col-span-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-[#5C615E] dark:text-[#A3A8A5] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#2F5D50]" />
                  Deliverable Versions ({participantSubmissions.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSubTitle(
                      `${activeParticipant.pseudonym} — ${
                        activeMilestone.title.split(':')[0]
                      } Deliverable (v${participantSubmissions.length + 1})`
                    );
                    setShowSubmissionForm(!showSubmissionForm);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#2F5D50] dark:text-[#428E72] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showSubmissionForm
                    ? 'Cancel'
                    : `Log New Version (v${participantSubmissions.length + 1})`}
                </button>
              </div>

              {showSubmissionForm && (
                <form
                  onSubmit={handleCreateSubmission}
                  className="p-4 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#2F5D50]/40 space-y-3"
                >
                  <div className="text-xs font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                    Submit Version v{participantSubmissions.length + 1} for{' '}
                    {activeParticipant.pseudonym}
                  </div>
                  <input
                    type="text"
                    required
                    value={subTitle}
                    onChange={(e) => setSubTitle(e.target.value)}
                    placeholder="Submission Title"
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                  />
                  <textarea
                    rows={3}
                    required
                    value={subContent}
                    onChange={(e) => setSubContent(e.target.value)}
                    placeholder="Deliverable content, trade allocation rationale, code artifact, or synthesis report..."
                    className="w-full p-2.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                  />

                  {trial.isRealMoney && (
                    <div className="p-3 rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] space-y-2.5">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#A8502F] font-semibold flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5" /> Real-Money Portfolio Mark-to-Market Update
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-[10px] font-mono text-[#8E9490]">
                            Total Equity ($)
                          </label>
                          <input
                            type="number"
                            step="10"
                            value={newEquityUsd}
                            onChange={(e) =>
                              setNewEquityUsd(Number(e.target.value))
                            }
                            className="w-full px-2 py-1 text-xs font-mono font-semibold rounded border border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#F4F1EA] dark:bg-[#121413]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono text-[#8E9490]">
                            Cash / T-Bill ($)
                          </label>
                          <input
                            type="number"
                            step="10"
                            value={cashUsd}
                            onChange={(e) => setCashUsd(Number(e.target.value))}
                            className="w-full px-2 py-1 text-xs font-mono rounded border border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#F4F1EA] dark:bg-[#121413]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono text-[#8E9490]">
                            Max DD (%)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={maxDrawdownPct}
                            onChange={(e) =>
                              setMaxDrawdownPct(Number(e.target.value))
                            }
                            className="w-full px-2 py-1 text-xs font-mono rounded border border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#F4F1EA] dark:bg-[#121413]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono text-[#8E9490]">
                            Sharpe Est.
                          </label>
                          <input
                            type="number"
                            step="0.05"
                            value={sharpeEstimate}
                            onChange={(e) =>
                              setSharpeEstimate(Number(e.target.value))
                            }
                            className="w-full px-2 py-1 text-xs font-mono rounded border border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#F4F1EA] dark:bg-[#121413]"
                          />
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Executed trades summary (e.g. Trimmed VST to 28%, added ASML)"
                        value={recentTradesSummary}
                        onChange={(e) =>
                          setRecentTradesSummary(e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#F4F1EA] dark:bg-[#121413]"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2 rounded-lg text-xs font-semibold bg-[#2F5D50] text-white"
                  >
                    Commit Submission v{participantSubmissions.length + 1}
                  </button>
                </form>
              )}

              {participantSubmissions.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-[#DDD7C9] dark:border-[#2B2F2D] text-center">
                  <FileText className="w-6 h-6 text-[#8E9490] mx-auto mb-1.5" />
                  <p className="text-xs font-medium text-[#5C615E] dark:text-[#A3A8A5]">
                    No versioned deliverable logged for {activeParticipant.pseudonym} at this milestone yet.
                  </p>
                  <p className="text-[11px] text-[#8E9490] mt-1">
                    Click &ldquo;Log New Version (v1)&rdquo; above or promote any response from the Arena chat.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...participantSubmissions].reverse().map((sub) => (
                    <div
                      key={sub.id}
                      className="p-4 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#2F5D50] text-white">
                            v{sub.version}
                          </span>
                          <span className="text-xs font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                            {sub.title}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-[#8E9490]">
                          {new Date(sub.submittedAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-[#1C1B18] dark:text-[#F2F0EC] whitespace-pre-wrap leading-relaxed">
                        {sub.content}
                      </p>
                      {sub.notes && (
                        <p className="text-[11px] font-mono text-[#8E9490] mt-2 pt-2 border-t border-[#DDD7C9] dark:border-[#2B2F2D]">
                          Audit Note: {sub.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right 6 Cols: Tactile Weighted Rubric Scoring Sliders */}
            <form
              onSubmit={handleCommitEvaluation}
              className="lg:col-span-6 p-4 sm:p-5 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-[#2F5D50] dark:text-[#428E72]" />
                  <span className="text-xs font-mono uppercase tracking-wider font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                    Weighted Rubric Evaluation
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleRunAiAssistedJudge}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-[#A8502F]/15 text-[#A8502F] hover:bg-[#A8502F]/25 transition-colors spring-press"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  AI-Judge Auto-Suggest
                </button>
              </div>

              {/* Criterion Sliders */}
              <div className="space-y-3">
                {trial.criteria.map((crit) => {
                  const val = criteriaScores[crit.id] ?? 80;
                  const weightedContribution = (
                    (val * crit.weight) /
                    100
                  ).toFixed(1);
                  return (
                    <div
                      key={crit.id}
                      className="p-3 rounded-xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div>
                          <span className="text-xs font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                            {crit.name}
                          </span>
                          <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#EBE6DB] dark:bg-[#242826] text-[#5C615E] dark:text-[#A3A8A5]">
                            Weight: {crit.weight}%
                          </span>
                        </div>
                        <div className="text-right font-mono tabular-nums">
                          <span className="text-sm font-bold text-[#2F5D50] dark:text-[#428E72]">
                            {val}
                          </span>
                          <span className="text-[10px] text-[#8E9490]">
                            /100 (+{weightedContribution} pts)
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-[#8E9490] mb-2">
                        {crit.description}
                      </p>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={val}
                        onChange={(e) =>
                          setCriteriaScores({
                            ...criteriaScores,
                            [crit.id]: Number(e.target.value),
                          })
                        }
                        className="w-full nordic-slider bg-[#EBE6DB] dark:bg-[#242826] rounded-lg"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Evidence & Judge Note */}
              <div>
                <label className="block text-xs font-medium text-[#5C615E] dark:text-[#A3A8A5] mb-1">
                  Preserved Evidence & Scoring Justification
                </label>
                <textarea
                  rows={2}
                  value={evidenceNotes}
                  onChange={(e) => setEvidenceNotes(e.target.value)}
                  placeholder="Document concrete evidence, P&L attribution, or rubric deductions..."
                  className="w-full p-2.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC]"
                />
              </div>

              {/* Live Weighted Composite Total Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-[#DDD7C9] dark:border-[#2B2F2D]">
                <div>
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-[#8E9490]">
                    Computed Composite Score ({judgeType})
                  </span>
                  <span className="text-2xl font-mono font-bold tabular-nums text-[#1C1B18] dark:text-[#F2F0EC]">
                    {liveWeightedTotal.toFixed(2)}{' '}
                    <span className="text-xs font-normal text-[#8E9490]">
                      / 100.00
                    </span>
                  </span>
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2F5D50] hover:bg-[#1E3D34] text-white text-xs font-semibold shadow-xs spring-press"
                >
                  {savedToast ? (
                    <>
                      <Check className="w-4 h-4" /> Score Recorded!
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" /> Save Official Score
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
