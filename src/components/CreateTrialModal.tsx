import React, { useState } from 'react';
import {
  AlertTriangle,
  Coins,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Scale,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { COMPETITION_TEMPLATES } from '../data/seedTrials';
import {
  CompetitionTemplate,
  EvaluationCriterion,
  ModelDefinition,
  NORDIC_PARTICIPANT_PALETTE,
  Participant,
  TrialEvent,
  VisibilityMode,
} from '../types/trial';

interface CreateTrialModalProps {
  isOpen: boolean;
  onClose: () => void;
  models: ModelDefinition[];
  onCreateTrial: (trial: TrialEvent) => void;
  initialTemplateId?: string;
}

export const CreateTrialModal: React.FC<CreateTrialModalProps> = ({
  isOpen,
  onClose,
  models,
  onCreateTrial,
  initialTemplateId,
}) => {
  const defaultTemplate =
    COMPETITION_TEMPLATES.find((t) => t.id === initialTemplateId) ||
    COMPETITION_TEMPLATES[0];

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    defaultTemplate.id
  );
  const [title, setTitle] = useState(defaultTemplate.name);
  const [category, setCategory] = useState(defaultTemplate.category);
  const [objective, setObjective] = useState(defaultTemplate.objective);
  const [rules, setRules] = useState(defaultTemplate.rules);
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>(
    defaultTemplate.visibilityMode
  );
  const [isRealMoney, setIsRealMoney] = useState<boolean>(
    defaultTemplate.isRealMoney
  );
  const [startingCapital, setStartingCapital] = useState<number>(
    defaultTemplate.defaultStartingCapital || 10000
  );
  const [successConditions, setSuccessConditions] = useState(
    defaultTemplate.successConditions
  );
  const [tieBreakerRule, setTieBreakerRule] = useState(
    defaultTemplate.tieBreakerRule
  );
  const [riskAcknowledged, setRiskAcknowledged] = useState<boolean>(true);

  const [criteria, setCriteria] = useState<EvaluationCriterion[]>(
    defaultTemplate.criteria.map((c, i) => ({
      ...c,
      id: `crit_new_${i}_${Date.now()}`,
    }))
  );

  const [participantDrafts, setParticipantDrafts] = useState<
    { modelDefId: string; pseudonym: string }[]
  >(() =>
    models.slice(0, 3).map((m, idx) => ({
      modelDefId: m.id,
      pseudonym:
        idx === 0
          ? 'Alpha Strategist'
          : idx === 1
          ? 'Beta Quant'
          : 'Gamma Synthesizer',
    }))
  );

  if (!isOpen) return null;

  const applyTemplate = (tpl: CompetitionTemplate) => {
    setSelectedTemplateId(tpl.id);
    setTitle(tpl.name);
    setCategory(tpl.category);
    setObjective(tpl.objective);
    setRules(tpl.rules);
    setVisibilityMode(tpl.visibilityMode);
    setIsRealMoney(tpl.isRealMoney);
    setStartingCapital(tpl.defaultStartingCapital || 10000);
    setSuccessConditions(tpl.successConditions);
    setTieBreakerRule(tpl.tieBreakerRule);
    setCriteria(
      tpl.criteria.map((c, i) => ({
        ...c,
        id: `crit_tpl_${i}_${Date.now()}`,
      }))
    );
  };

  const totalWeight = criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0);

  const normalizeWeightsTo100 = () => {
    if (criteria.length === 0) return;
    if (totalWeight === 0) {
      const equal = Math.floor(100 / criteria.length);
      setCriteria(
        criteria.map((c, idx) => ({
          ...c,
          weight:
            idx === 0 ? 100 - equal * (criteria.length - 1) : equal,
        }))
      );
      return;
    }
    const scaled = criteria.map((c) => ({
      ...c,
      weight: Math.round((c.weight / totalWeight) * 100),
    }));
    const diff = 100 - scaled.reduce((s, c) => s + c.weight, 0);
    scaled[0].weight += diff;
    setCriteria(scaled);
  };

  const handleAddParticipant = () => {
    if (participantDrafts.length >= 5) return;
    const nextModel =
      models[participantDrafts.length % models.length] || models[0];
    setParticipantDrafts([
      ...participantDrafts,
      {
        modelDefId: nextModel.id,
        pseudonym: `Agent #${participantDrafts.length + 1}`,
      },
    ]);
  };

  const handleRemoveParticipant = (idx: number) => {
    if (participantDrafts.length <= 2) return;
    setParticipantDrafts(participantDrafts.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalWeight !== 100) {
      normalizeWeightsTo100();
    }

    const activeTpl = COMPETITION_TEMPLATES.find(
      (t) => t.id === selectedTemplateId
    );
    const nowIso = new Date().toISOString();
    const cap = isRealMoney ? Number(startingCapital) || 10000 : 0;

    const builtParticipants: Participant[] = participantDrafts.map(
      (draft, idx) => {
        const modelDef =
          models.find((m) => m.id === draft.modelDefId) || models[0];
        const palette =
          NORDIC_PARTICIPANT_PALETTE[idx % NORDIC_PARTICIPANT_PALETTE.length];
        const pId = `part_${Date.now()}_${idx}`;

        return {
          id: pId,
          modelDefId: modelDef.id,
          modelName: modelDef.name,
          provider: modelDef.provider,
          pseudonym: draft.pseudonym.trim() || modelDef.name,
          colorHex: palette.hex,
          colorName: palette.name,
          status: 'IDLE',
          startingCapitalUsd: cap,
          currentEquityUsd: cap,
          equityCurve: [
            {
              date: 'Start',
              label: 'Init',
              value: isRealMoney ? cap : 75,
              score: 75,
            },
          ],
          messages: [
            {
              id: `msg_init_${pId}`,
              participantId: pId,
              role: 'system',
              messageType: 'SYSTEM_INSTRUCTION',
              content: `TRIAL INITIALIZED [${visibilityMode} MODE]: Objective: "${title}". ${
                isRealMoney
                  ? `Allocated Starting Capital: $${cap.toLocaleString()} USD.`
                  : 'Standard benchmark scoring active.'
              }`,
              timestamp: nowIso,
            },
          ],
          submissions: {},
          evaluations: {},
          portfolioHistory: isRealMoney
            ? [
                {
                  id: `snap_init_${pId}`,
                  timestamp: nowIso,
                  totalEquityUsd: cap,
                  cashUsd: cap,
                  cumulativeReturnPct: 0,
                  maxDrawdownPct: 0,
                  sharpeEstimate: 0,
                  positions: [
                    {
                      ticker: 'CASH',
                      assetName: 'Unallocated USD Capital Reserve',
                      direction: 'CASH_YIELD',
                      allocationPct: 100,
                      entryPrice: 1,
                      currentPrice: 1,
                      quantity: cap,
                      pnlUsd: 0,
                      pnlPct: 0,
                      thesis: 'Initial dry powder awaiting Milestone 1 deployment.',
                    },
                  ],
                  recentTradesSummary: 'Account funded with initial starting capital.',
                  rationale: 'Awaiting initial prompt and Milestone 1 allocation.',
                },
              ]
            : [],
          totalTokens: 0,
          estimatedCostUsd: 0,
        };
      }
    );

    const builtMilestones = (activeTpl?.milestones || [
      {
        title: 'M1: Initial Execution & Deliverable Submission',
        description: 'First structured deliverable evaluated against weighted criteria.',
        daysOffset: 3,
        requiredDeliverable: isRealMoney
          ? 'Portfolio Snapshot & Thesis'
          : 'Structured Deliverable v1',
        deliverableType: isRealMoney ? 'PORTFOLIO_SNAPSHOT' : 'RESEARCH_REPORT',
      },
    ]).map((m, idx) => ({
      id: `ms_${Date.now()}_${idx}`,
      title: m.title,
      description: m.description,
      deadline: new Date(
        Date.now() + m.daysOffset * 86400000
      ).toISOString(),
      requiredDeliverable: m.requiredDeliverable,
      deliverableType: m.deliverableType,
      status: idx === 0 ? ('DUE' as const) : ('UPCOMING' as const),
      order: idx + 1,
    }));

    const builtSchedules = (activeTpl?.schedules || []).map((s, idx) => ({
      id: `sched_${Date.now()}_${idx}`,
      title: s.title,
      promptTemplate: s.promptTemplate,
      frequency: s.frequency,
      nextRunAt: new Date(Date.now() + 86400000).toISOString(),
      status: 'PENDING' as const,
      missedCount: 0,
      targetParticipantIds: ['ALL'],
    }));

    const newTrial: TrialEvent = {
      id: `trial_${Date.now()}`,
      title: title.trim() || 'Untitled Model Trial',
      category: category.trim() || 'Custom Benchmark',
      templateId: selectedTemplateId,
      status: 'RUNNING',
      objective,
      rules,
      ruleAmendments: [],
      visibilityMode,
      isRealMoney,
      startingCapitalPerParticipant: cap,
      currency: 'USD',
      startDate: nowIso,
      endDate: new Date(Date.now() + 21 * 86400000).toISOString(),
      successConditions,
      tieBreakerRule,
      criteria,
      participants: builtParticipants,
      milestones: builtMilestones,
      schedules: builtSchedules,
      auditLog: [
        {
          id: `log_create_${Date.now()}`,
          timestamp: nowIso,
          category: 'LIFECYCLE',
          actor: 'Trial Operator',
          summary: `Created & launched trial "${title}" with ${builtParticipants.length} participants (${visibilityMode} visibility).`,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    onCreateTrial(newTrial);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] shadow-2xl">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[#FAF8F3]/95 dark:bg-[#1B1E1D]/95 backdrop-blur-md border-b border-[#DDD7C9] dark:border-[#2B2F2D]">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-[#2F5D50] dark:text-[#428E72] font-semibold">
              Specification Studio
            </span>
            <h2 className="text-xl font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
              Configure New Model Trial
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#5C615E] hover:bg-[#EBE6DB] dark:hover:bg-[#242826] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-6">
          {/* 1. Lightweight Competition Templates */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#5C615E] dark:text-[#A3A8A5] mb-2">
              1. Quick-Start Competition Template
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {COMPETITION_TEMPLATES.map((tpl) => {
                const isSelected = selectedTemplateId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className={`text-left p-3 rounded-xl border transition-all spring-press ${
                      isSelected
                        ? 'border-[#2F5D50] bg-[#2F5D50]/6 dark:bg-[#367A61]/15'
                        : 'border-[#DDD7C9] dark:border-[#2B2F2D] hover:bg-[#F4F1EA] dark:hover:bg-[#242826]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-[#1C1B18] dark:text-[#F2F0EC] line-clamp-1">
                        {tpl.name}
                      </span>
                      {tpl.isRealMoney && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#A8502F]/15 text-[#A8502F] font-semibold">
                          $ REAL
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#5C615E] dark:text-[#A3A8A5] line-clamp-2">
                      {tpl.tagline}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Title, Objective & Rules */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#5C615E] dark:text-[#A3A8A5] mb-1">
                Trial Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC] focus:outline-none focus:border-[#2F5D50]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5C615E] dark:text-[#A3A8A5] mb-1">
                Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC] focus:outline-none focus:border-[#2F5D50]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5C615E] dark:text-[#A3A8A5] mb-1">
                Shared Objective (Identical for all models)
              </label>
              <textarea
                rows={3}
                required
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="w-full px-3 py-2 text-xs leading-relaxed rounded-lg bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC] focus:outline-none focus:border-[#2F5D50]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5C615E] dark:text-[#A3A8A5] mb-1">
                Immutable Rules & Constraints (Amendments logged)
              </label>
              <textarea
                rows={3}
                required
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                className="w-full px-3 py-2 text-xs leading-relaxed rounded-lg bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC] focus:outline-none focus:border-[#2F5D50]"
              />
            </div>
          </div>

          {/* 3. Real-Money Mode & Visibility Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D]">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold flex items-center gap-1.5 text-[#1C1B18] dark:text-[#F2F0EC]">
                  <Coins className="w-4 h-4 text-[#A8502F]" />
                  Real-Money Capital Tracking
                </span>
                <button
                  type="button"
                  onClick={() => setIsRealMoney(!isRealMoney)}
                  className={`w-11 h-6 rounded-full transition-colors p-0.5 ${
                    isRealMoney ? 'bg-[#A8502F]' : 'bg-[#8E9490]/40'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-[#FAF8F3] transition-transform ${
                      isRealMoney ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {isRealMoney ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#5C615E] dark:text-[#A3A8A5]">
                      Starting Capital / Model ($ USD):
                    </span>
                    <input
                      type="number"
                      min={100}
                      step={500}
                      value={startingCapital}
                      onChange={(e) =>
                        setStartingCapital(Number(e.target.value))
                      }
                      className="w-28 px-2.5 py-1 text-xs font-mono font-semibold rounded bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                    />
                  </div>
                  <p className="text-[11px] text-[#A8502F] leading-snug">
                    Platform tracks decisions, positions & P&L only. Never holds funds or executes brokerage orders.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[#5C615E] dark:text-[#A3A8A5]">
                  Purely experimental competition scored on weighted evaluation criteria (0–100 pts).
                </p>
              )}
            </div>

            <div>
              <span className="block text-xs font-semibold text-[#1C1B18] dark:text-[#F2F0EC] mb-2">
                Visibility Mode (Enforced in Prompts & UI)
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    {
                      mode: 'ISOLATED',
                      label: 'Isolated',
                      icon: Lock,
                      desc: 'Zero awareness of peers',
                    },
                    {
                      mode: 'BLIND',
                      label: 'Blind',
                      icon: EyeOff,
                      desc: 'Anon rank dispersion',
                    },
                    {
                      mode: 'OPEN',
                      label: 'Open',
                      icon: Eye,
                      desc: 'Full peer transparency',
                    },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const active = visibilityMode === item.mode;
                  return (
                    <button
                      key={item.mode}
                      type="button"
                      onClick={() => setVisibilityMode(item.mode)}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        active
                          ? 'border-[#2F5D50] bg-[#2F5D50] text-white'
                          : 'border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#FAF8F3] dark:bg-[#1B1E1D] text-[#1C1B18] dark:text-[#F2F0EC]'
                      }`}
                    >
                      <div className="flex items-center gap-1 text-xs font-semibold">
                        <Icon className="w-3.5 h-3.5" />
                        {item.label}
                      </div>
                      <span
                        className={`block text-[10px] mt-0.5 ${
                          active ? 'text-white/80' : 'text-[#8E9490]'
                        }`}
                      >
                        {item.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4. Participants (2–5 Models) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-mono uppercase tracking-wider text-[#5C615E] dark:text-[#A3A8A5]">
                2. Competing Participants ({participantDrafts.length} / 5 Models)
              </label>
              {participantDrafts.length < 5 && (
                <button
                  type="button"
                  onClick={handleAddParticipant}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#2F5D50] dark:text-[#428E72] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Model Slot
                </button>
              )}
            </div>
            <div className="space-y-2">
              {participantDrafts.map((p, idx) => {
                const palette =
                  NORDIC_PARTICIPANT_PALETTE[
                    idx % NORDIC_PARTICIPANT_PALETTE.length
                  ];
                return (
                  <div
                    key={idx}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 p-2.5 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: palette.hex }}
                      title={palette.name}
                    />
                    <span className="text-xs font-mono text-[#8E9490] w-6">
                      #{idx + 1}
                    </span>
                    <select
                      value={p.modelDefId}
                      onChange={(e) => {
                        const next = [...participantDrafts];
                        next[idx].modelDefId = e.target.value;
                        setParticipantDrafts(next);
                      }}
                      className="flex-1 min-w-[160px] px-2.5 py-1.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC]"
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.provider.toUpperCase()})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Pseudonym (e.g. Nordic Value Desk)"
                      value={p.pseudonym}
                      onChange={(e) => {
                        const next = [...participantDrafts];
                        next[idx].pseudonym = e.target.value;
                        setParticipantDrafts(next);
                      }}
                      className="flex-1 min-w-[150px] px-2.5 py-1.5 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC]"
                    />
                    {participantDrafts.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(idx)}
                        className="p-1.5 text-[#8E9490] hover:text-[#B93829]"
                        title="Remove participant"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 5. Weighted Evaluation Criteria (Must Sum to 100%) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-mono uppercase tracking-wider text-[#5C615E] dark:text-[#A3A8A5] flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" />
                3. Weighted Evaluation Criteria (Sum = 100%)
              </label>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded font-semibold tabular-nums ${
                    totalWeight === 100
                      ? 'bg-[#2A6F4E]/15 text-[#2A6F4E]'
                      : 'bg-[#D98A2B]/20 text-[#D98A2B]'
                  }`}
                >
                  Total: {totalWeight}%
                </span>
                {totalWeight !== 100 && (
                  <button
                    type="button"
                    onClick={normalizeWeightsTo100}
                    className="text-xs font-mono underline text-[#2F5D50] dark:text-[#428E72]"
                  >
                    Auto-Balance 100%
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2.5">
              {criteria.map((c, idx) => (
                <div
                  key={c.id}
                  className="p-3 rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D]"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <input
                      type="text"
                      value={c.name}
                      onChange={(e) => {
                        const next = [...criteria];
                        next[idx].name = e.target.value;
                        setCriteria(next);
                      }}
                      className="flex-1 text-xs font-semibold bg-transparent border-b border-transparent focus:border-[#2F5D50] focus:outline-none text-[#1C1B18] dark:text-[#F2F0EC]"
                    />
                    <span className="text-xs font-mono font-bold tabular-nums text-[#2F5D50] dark:text-[#428E72] w-12 text-right">
                      {c.weight}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={90}
                    step={5}
                    value={c.weight}
                    onChange={(e) => {
                      const next = [...criteria];
                      next[idx].weight = Number(e.target.value);
                      setCriteria(next);
                    }}
                    className="w-full nordic-slider bg-[#DDD7C9] dark:bg-[#2B2F2D] rounded-lg"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Real-Money Risk & Compliance Disclaimer */}
          {isRealMoney && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#A8502F]/10 border border-[#A8502F]/30">
              <AlertTriangle className="w-4 h-4 text-[#A8502F] shrink-0 mt-0.5" />
              <div className="flex-1 text-xs text-[#1C1B18] dark:text-[#F2F0EC]">
                <span className="font-semibold">
                  Capital & Regulatory Compliance Notice:
                </span>{' '}
                Model Trials records model advice, portfolio snapshots, and reported outcomes only. You are solely responsible for all external capital execution, risk management, and regulatory compliance.
                <label className="flex items-center gap-2 mt-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={riskAcknowledged}
                    onChange={(e) => setRiskAcknowledged(e.target.checked)}
                    required
                    className="rounded accent-[#2F5D50]"
                  />
                  I acknowledge sole responsibility for all external capital and risk.
                </label>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#DDD7C9] dark:border-[#2B2F2D]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#5C615E] dark:text-[#A3A8A5]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold rounded-lg bg-[#2F5D50] hover:bg-[#1E3D34] text-white shadow-sm spring-press"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Launch Model Trial
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
