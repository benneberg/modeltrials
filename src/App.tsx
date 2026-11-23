import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Coins,
  Download,
  LayoutDashboard,
  Moon,
  Plus,
  Scale,
  Shield,
  Sun,
  Terminal,
} from 'lucide-react';
import { CreateTrialModal } from './components/CreateTrialModal';
import { MilestonesEvalView } from './components/MilestonesEvalView';
import { ModelsVaultView } from './components/ModelsVaultView';
import { ParticipantArenaView } from './components/ParticipantArenaView';
import { setLive } from './services/liveStream';
import { Onboarding } from './components/Onboarding';
import { TrialsOverviewView } from './components/TrialsOverviewView';
import {
  INITIAL_MODEL_DEFINITIONS,
  INITIAL_TRIAL_EVENTS,
} from './data/seedTrials';
import { executeParticipantPrompt } from './services/aiExecutionEngine';
import {
  deleteCredentialFromDb,
  deleteModelFromDb,
  exportSingleTrialJson,
  importTrialBundleJson,
  initializeAndLoadDatabase,
  saveCredentialToDb,
  saveModelToDb,
  saveTrialToDb,
} from './services/indexedDbStore';
import {
  ChatMessage,
  ChatMessageType,
  DeliverableType,
  EncryptedCredential,
  EvaluationScore,
  EventLifecycle,
  Milestone,
  ModelDefinition,
  Participant,
  ScheduledCheckIn,
  SubmissionVersion,
  TrialEvent,
} from './types/trial';

type NavTab = 'trials' | 'arena' | 'milestones' | 'vault';

export function App() {
  const [trials, setTrials] = useState<TrialEvent[]>(INITIAL_TRIAL_EVENTS);
  const [models, setModels] = useState<ModelDefinition[]>(
    INITIAL_MODEL_DEFINITIONS
  );
  const [credentials, setCredentials] = useState<EncryptedCredential[]>([]);
  const [activeTrialId, setActiveTrialId] = useState<string>(
    INITIAL_TRIAL_EVENTS[0].id
  );
  const [activeTab, setActiveTab] = useState<NavTab>('trials');
  const [activeParticipantId, setActiveParticipantId] = useState<string>(
    INITIAL_TRIAL_EVENTS[0].participants[0].id
  );
  const [darkMode, setDarkMode] = useState<boolean>(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );
  const [isNewTrialModalOpen, setIsNewTrialModalOpen] = useState(false);
  const [modalInitialTemplateId, setModalInitialTemplateId] = useState<
    string | undefined
  >(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // Load persisted data from IndexedDB on startup & check missed schedules
  useEffect(() => {
    let mounted = true;
    initializeAndLoadDatabase()
      .then(({ trials: dbTrials, models: dbModels, credentials: dbCreds }) => {
        if (!mounted) return;
        const now = Date.now();
        // Check for pending schedules whose deadline passed while tab was closed
        const checkedTrials = dbTrials.map((t) => {
          let changed = false;
          const updatedSchedules = t.schedules.map((sc) => {
            if (
              sc.status === 'PENDING' &&
              new Date(sc.nextRunAt).getTime() < now
            ) {
              changed = true;
              return {
                ...sc,
                status: 'MISSED' as const,
                missedCount: (sc.missedCount || 0) + 1,
              };
            }
            return sc;
          });
          if (changed) {
            const updatedTrial: TrialEvent = {
              ...t,
              schedules: updatedSchedules,
            };
            saveTrialToDb(updatedTrial);
            return updatedTrial;
          }
          return t;
        });

        setTrials(checkedTrials);
        setModels(dbModels);
        setCredentials(dbCreds);
        if (checkedTrials[0]) {
          setActiveTrialId(checkedTrials[0].id);
          if (checkedTrials[0].participants[0]) {
            setActiveParticipantId(checkedTrials[0].participants[0].id);
          }
        }
      })
      .catch(() => {
        // Fallback to in-memory seed if IndexedDB is restricted
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Toggle dark class on documentElement
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const activeTrial: TrialEvent =
    trials.find((t) => t.id === activeTrialId) || trials[0];

  const persistUpdatedTrial = async (updated: TrialEvent) => {
    setTrials((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t))
    );
    await saveTrialToDb(updated);
  };

  const handleSelectTrial = (trialId: string) => {
    setActiveTrialId(trialId);
    const found = trials.find((t) => t.id === trialId);
    if (found && found.participants[0]) {
      setActiveParticipantId(found.participants[0].id);
    }
  };

  const handleCreateNewTrial = async (newTrial: TrialEvent) => {
    await saveTrialToDb(newTrial);
    setTrials((prev) => [newTrial, ...prev]);
    setActiveTrialId(newTrial.id);
    if (newTrial.participants[0]) {
      setActiveParticipantId(newTrial.participants[0].id);
    }
    setActiveTab('trials');
    showToast(`Launched "${newTrial.title}"`);
  };

  // Send message or broadcast across participants
  const handleSendMessage = async (params: {
    participantId: string | 'ALL';
    content: string;
    messageType: ChatMessageType;
    isManualAssistantPaste?: boolean;
  }) => {
    const { participantId, content, messageType, isManualAssistantPaste } =
      params;
    const nowIso = new Date().toISOString();

    const targetIds =
      participantId === 'ALL'
        ? activeTrial.participants.map((p) => p.id)
        : [participantId];

    // If operator is pasting a manual response from an external run
    if (isManualAssistantPaste && participantId !== 'ALL') {
      const updatedParticipants = activeTrial.participants.map((p) => {
        if (p.id !== participantId) return p;
        const manualMsg: ChatMessage = {
          id: `msg_man_${Date.now()}`,
          participantId: p.id,
          role: 'assistant',
          messageType: 'MODEL_RESPONSE',
          content,
          timestamp: nowIso,
          executionMode: 'manual_entry',
        };
        return {
          ...p,
          status: 'SUBMITTED' as const,
          messages: [...p.messages, manualMsg],
        };
      });

      const updatedTrial: TrialEvent = {
        ...activeTrial,
        participants: updatedParticipants,
        auditLog: [
          {
            id: `log_${Date.now()}`,
            timestamp: nowIso,
            category: 'SYSTEM',
            actor: 'Trial Operator',
            summary: `Recorded manual model output for ${
              activeTrial.participants.find((p) => p.id === participantId)
                ?.pseudonym
            }.`,
          },
          ...activeTrial.auditLog,
        ],
      };
      await persistUpdatedTrial(updatedTrial);
      showToast('Manual model response recorded in thread.');
      return;
    }

    // Standard or Broadcast execution
    const updatedParticipants: Participant[] = [];
    for (const p of activeTrial.participants) {
      if (!targetIds.includes(p.id)) {
        updatedParticipants.push(p);
        continue;
      }

      const userMsg: ChatMessage = {
        id: `msg_u_${Date.now()}_${p.id}`,
        participantId: p.id,
        role: messageType === 'SYSTEM_INSTRUCTION' ? 'system' : 'user',
        messageType,
        content,
        timestamp: nowIso,
      };

      const modelDef = models.find((m) => m.id === p.modelDefId);
      const cred = credentials.find((c) => c.id === modelDef?.credentialId);

      // Manual / Human participants only receive reminders, no automated AI generation
      if (modelDef?.provider === 'manual') {
        updatedParticipants.push({
          ...p,
          status: 'AWAITING_MANUAL',
          messages: [...p.messages, userMsg],
        });
        continue;
      }

      let execResult: Awaited<ReturnType<typeof executeParticipantPrompt>>;
      try {
        execResult = await executeParticipantPrompt({
          trial: activeTrial,
          participant: { ...p, messages: [...p.messages, userMsg] },
          modelDef,
          credential: cred,
          userPrompt: content,
          onToken: (t) => setLive(p.id, t),
        });
      } finally {
        setLive(p.id, null);
      }

      const assistantMsg: ChatMessage = {
        id: `msg_a_${Date.now()}_${p.id}`,
        participantId: p.id,
        role: 'assistant',
        messageType: 'MODEL_RESPONSE',
        content: execResult.content,
        timestamp: new Date().toISOString(),
        tokensInput: execResult.tokensInput,
        tokensOutput: execResult.tokensOutput,
        estimatedCostUsd: execResult.estimatedCostUsd,
        executionMode: execResult.executionMode,
      };

      updatedParticipants.push({
        ...p,
        status: 'IDLE',
        totalTokens:
          p.totalTokens + execResult.tokensInput + execResult.tokensOutput,
        estimatedCostUsd: Number(
          (p.estimatedCostUsd + execResult.estimatedCostUsd).toFixed(4)
        ),
        messages: [...p.messages, userMsg, assistantMsg],
      });
    }

    const updatedTrial: TrialEvent = {
      ...activeTrial,
      participants: updatedParticipants,
      auditLog: [
        {
          id: `log_msg_${Date.now()}`,
          timestamp: nowIso,
          category:
            messageType === 'SCHEDULED_CHECKIN' ? 'SCHEDULE' : 'SYSTEM',
          actor: 'Trial Operator',
          summary:
            participantId === 'ALL'
              ? `Broadcasted [${messageType}] to all ${targetIds.length} participants.`
              : `Executed [${messageType}] with ${
                  activeTrial.participants.find((p) => p.id === participantId)
                    ?.pseudonym
                }.`,
        },
        ...activeTrial.auditLog,
      ],
    };

    await persistUpdatedTrial(updatedTrial);
    showToast(
      participantId === 'ALL'
        ? `Broadcast completed across all ${targetIds.length} models.`
        : 'Response generated & logged to IndexedDB.'
    );
  };

  // Resume or trigger a scheduled check-in
  const handleRunOrResumeSchedule = async (scheduleId: string) => {
    const targetSched = activeTrial.schedules.find(
      (s) => s.id === scheduleId
    );
    if (!targetSched) return;

    await handleSendMessage({
      participantId: 'ALL',
      content: targetSched.promptTemplate,
      messageType: 'SCHEDULED_CHECKIN',
    });

    const nowIso = new Date().toISOString();
    const nextOffsetDays =
      targetSched.frequency === 'DAILY'
        ? 1
        : targetSched.frequency === 'WEEKLY'
        ? 7
        : 14;

    setTrials((prev) =>
      prev.map((t) => {
        if (t.id !== activeTrial.id) return t;
        const updated: TrialEvent = {
          ...t,
          schedules: t.schedules.map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  status:
                    s.frequency === 'ONE_OFF' ? 'EXECUTED' : 'PENDING',
                  lastRunAt: nowIso,
                  nextRunAt: new Date(
                    Date.now() + nextOffsetDays * 86400000
                  ).toISOString(),
                }
              : s
          ),
          auditLog: [
            {
              id: `log_sched_${Date.now()}`,
              timestamp: nowIso,
              category: 'SCHEDULE',
              actor: 'Client Scheduler',
              summary: `Executed scheduled check-in "${targetSched.title}" across all participants.`,
            },
            ...t.auditLog,
          ],
        };
        saveTrialToDb(updated);
        return updated;
      })
    );

    showToast(`Check-In "${targetSched.title}" executed across all models.`);
  };

  // Lifecycle state transition
  const handleUpdateLifecycle = async (
    newStatus: EventLifecycle,
    winnerId?: string
  ) => {
    const nowIso = new Date().toISOString();
    const winner = activeTrial.participants.find((p) => p.id === winnerId);
    const updated: TrialEvent = {
      ...activeTrial,
      status: newStatus,
      winnerParticipantId:
        newStatus === 'COMPLETED' ? winnerId : activeTrial.winnerParticipantId,
      auditLog: [
        {
          id: `log_lc_${Date.now()}`,
          timestamp: nowIso,
          category: 'LIFECYCLE',
          actor: 'Trial Operator',
          summary: `Trial status changed from ${activeTrial.status} → ${newStatus}${
            winner ? `. Winner declared: ${winner.pseudonym} (${winner.modelName})` : ''
          }.`,
        },
        ...activeTrial.auditLog,
      ],
    };
    await persistUpdatedTrial(updated);
    showToast(`Trial marked ${newStatus}.`);
  };

  // Amend immutable rules with audit record
  const handleAmendRules = async (newRules: string, reason: string) => {
    const nowIso = new Date().toISOString();
    const updated: TrialEvent = {
      ...activeTrial,
      rules: newRules,
      ruleAmendments: [
        ...activeTrial.ruleAmendments,
        {
          id: `amend_${Date.now()}`,
          timestamp: nowIso,
          reason,
          previousRules: activeTrial.rules,
          newRules,
        },
      ],
      auditLog: [
        {
          id: `log_amend_${Date.now()}`,
          timestamp: nowIso,
          category: 'RULE_AMENDMENT',
          actor: 'Trial Operator',
          summary: `Rules amended: ${reason}`,
        },
        ...activeTrial.auditLog,
      ],
    };
    await persistUpdatedTrial(updated);
    showToast('Rule amendment permanently logged.');
  };

  // Add versioned submission (+ optional real-money portfolio update)
  const handleAddSubmission = async (params: {
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
  }) => {
    const {
      participantId,
      milestoneId,
      title,
      deliverableType,
      content,
      notes,
      portfolioUpdate,
    } = params;
    const nowIso = new Date().toISOString();

    const updatedParticipants = activeTrial.participants.map((p) => {
      if (p.id !== participantId) return p;
      const existingVersions = p.submissions[milestoneId] || [];
      const nextVersionNum = existingVersions.length + 1;

      const newSub: SubmissionVersion = {
        id: `sub_${p.id}_${milestoneId}_v${nextVersionNum}_${Date.now()}`,
        version: nextVersionNum,
        milestoneId,
        participantId: p.id,
        submittedAt: nowIso,
        title,
        deliverableType,
        content,
        notes,
      };

      let nextEquity = p.currentEquityUsd;
      let nextCurve = [...p.equityCurve];
      let nextPortfolios = [...p.portfolioHistory];

      if (portfolioUpdate && activeTrial.isRealMoney) {
        nextEquity = portfolioUpdate.newEquityUsd;
        const lastScore =
          p.equityCurve[p.equityCurve.length - 1]?.score || 85;
        nextCurve.push({
          date: new Date().toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
          }),
          label: `v${nextVersionNum}`,
          value: nextEquity,
          score: lastScore,
        });

        const prevSnap = p.portfolioHistory[p.portfolioHistory.length - 1];
        const cumReturn =
          p.startingCapitalUsd > 0
            ? Number(
                (
                  ((nextEquity - p.startingCapitalUsd) /
                    p.startingCapitalUsd) *
                  100
                ).toFixed(2)
              )
            : 0;

        nextPortfolios.push({
          id: `snap_${Date.now()}`,
          timestamp: nowIso,
          milestoneId,
          totalEquityUsd: nextEquity,
          cashUsd: portfolioUpdate.cashUsd,
          cumulativeReturnPct: cumReturn,
          maxDrawdownPct: portfolioUpdate.maxDrawdownPct,
          sharpeEstimate: portfolioUpdate.sharpeEstimate,
          positions: prevSnap ? prevSnap.positions : [],
          recentTradesSummary: portfolioUpdate.recentTradesSummary,
          rationale: content,
        });
      }

      return {
        ...p,
        status: 'SUBMITTED' as const,
        currentEquityUsd: nextEquity,
        equityCurve: nextCurve,
        portfolioHistory: nextPortfolios,
        submissions: {
          ...p.submissions,
          [milestoneId]: [...existingVersions, newSub],
        },
      };
    });

    const partName = activeTrial.participants.find(
      (p) => p.id === participantId
    )?.pseudonym;

    const updatedTrial: TrialEvent = {
      ...activeTrial,
      participants: updatedParticipants,
      auditLog: [
        {
          id: `log_sub_${Date.now()}`,
          timestamp: nowIso,
          category: 'SUBMISSION',
          actor: partName || 'Participant',
          summary: `Submitted versioned deliverable "${title}"${
            portfolioUpdate
              ? ` (Marked Equity: $${portfolioUpdate.newEquityUsd.toLocaleString()})`
              : ''
          }.`,
        },
        ...activeTrial.auditLog,
      ],
    };

    await persistUpdatedTrial(updatedTrial);
    showToast(`Recorded submission for ${partName}.`);
  };

  // Save Weighted Rubric Evaluation
  const handleSaveEvaluation = async (evaluation: EvaluationScore) => {
    const nowIso = new Date().toISOString();
    const updatedParticipants = activeTrial.participants.map((p) => {
      if (p.id !== evaluation.participantId) return p;

      const updatedCurve = p.equityCurve.map((pt, idx) =>
        idx === p.equityCurve.length - 1
          ? {
              ...pt,
              score: evaluation.weightedTotal,
              value: activeTrial.isRealMoney
                ? pt.value
                : evaluation.weightedTotal,
            }
          : pt
      );

      const evalMsg: ChatMessage = {
        id: `msg_eval_${Date.now()}`,
        participantId: p.id,
        role: 'system',
        messageType: 'EVALUATION_FEEDBACK',
        content: `RUBRIC EVALUATION RECORDED (${
          evaluation.judgeType
        }): Composite Score ${evaluation.weightedTotal.toFixed(
          2
        )} / 100. Notes: ${evaluation.evidenceNotes}`,
        timestamp: nowIso,
        relatedMilestoneId: evaluation.milestoneId,
      };

      return {
        ...p,
        equityCurve: updatedCurve,
        messages: [...p.messages, evalMsg],
        evaluations: {
          ...p.evaluations,
          [evaluation.milestoneId]: evaluation,
        },
      };
    });

    const partName = activeTrial.participants.find(
      (p) => p.id === evaluation.participantId
    )?.pseudonym;

    const updatedTrial: TrialEvent = {
      ...activeTrial,
      participants: updatedParticipants,
      auditLog: [
        {
          id: `log_eval_${Date.now()}`,
          timestamp: nowIso,
          category: 'EVALUATION',
          actor: evaluation.judgeModelName || 'Trial Operator',
          summary: `Scored ${partName}: ${evaluation.weightedTotal.toFixed(
            2
          )} / 100 pts.`,
        },
        ...activeTrial.auditLog,
      ],
    };

    await persistUpdatedTrial(updatedTrial);
    showToast(
      `Saved ${evaluation.weightedTotal.toFixed(2)}/100 score for ${partName}.`
    );
  };

  const handleExportCurrentTrial = () => {
    const json = exportSingleTrialJson(activeTrial, models);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTrial.id}_export.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported complete event JSON.');
  };

  const missedCount = activeTrial.schedules.filter(
    (s) => s.status === 'MISSED'
  ).length;

  const getLifecycleBadgeClass = (status: EventLifecycle) => {
    switch (status) {
      case 'RUNNING':
        return 'bg-[#2F5D50] text-white';
      case 'COMPLETED':
        return 'bg-[#2A6F4E]/15 text-[#2A6F4E]';
      case 'PAUSED':
        return 'bg-[#D98A2B]/20 text-[#D98A2B]';
      default:
        return 'bg-[#EBE6DB] text-[#5C615E]';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F1EA] dark:bg-[#121413] text-[#1C1B18] dark:text-[#F2F0EC] transition-colors">
      {/* Top Contextual Header (56px height) */}
      <header className="sticky top-0 z-30 h-14 px-4 lg:px-6 bg-[#F4F1EA]/90 dark:bg-[#121413]/90 backdrop-blur-md border-b border-[#DDD7C9] dark:border-[#2B2F2D] flex items-center justify-between gap-3">
        {/* Left: Brand Identity + Active Trial Selector */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            onClick={() => setActiveTab('trials')}
            className="flex items-center gap-2 cursor-pointer shrink-0"
          >
            <div className="w-8 h-8 rounded-lg bg-[#2F5D50] flex items-center justify-center shadow-xs">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 text-[#F4F1EA]"
                fill="none"
              >
                <path
                  d="M4 17L9.5 9L14 14L20 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="20" cy="6" r="2" fill="#A8502F" />
              </svg>
            </div>
            <div className="hidden sm:block">
              <span className="font-editorial text-lg tracking-tight leading-none block">
                Model Trials
              </span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#8E9490] block">
                v0.3.0 · Local IndexedDB
              </span>
            </div>
          </div>

          <div className="h-5 w-[1px] bg-[#DDD7C9] dark:bg-[#2B2F2D] hidden sm:block" />

          {/* Active Trial Dropdown Switcher */}
          <div className="relative flex items-center min-w-0">
            <select
              aria-label="Select Active Competition"
              value={activeTrial.id}
              onChange={(e) => handleSelectTrial(e.target.value)}
              className="appearance-none pr-7 pl-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC] truncate max-w-[200px] sm:max-w-[320px] cursor-pointer focus:outline-none focus:border-[#2F5D50]"
            >
              {trials.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.status})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#8E9490] absolute right-2 pointer-events-none" />
          </div>

          {/* Status Pill */}
          <span
            className={`hidden md:inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold shrink-0 ${getLifecycleBadgeClass(
              activeTrial.status
            )}`}
          >
            {activeTrial.status === 'RUNNING' && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#FAF8F3] animate-pulse" />
            )}
            {activeTrial.status}
          </span>

          {activeTrial.isRealMoney && (
            <span className="hidden xl:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#A8502F]/15 text-[#A8502F] font-semibold shrink-0">
              <Coins className="w-3 h-3" /> Real-Money Ledger
            </span>
          )}
        </div>

        {/* Right: Quick Actions & Theme Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setModalInitialTemplateId(undefined);
              setIsNewTrialModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2F5D50] hover:bg-[#1E3D34] text-white shadow-xs spring-press"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Trial</span>
          </button>

          <button
            type="button"
            onClick={handleExportCurrentTrial}
            className="hidden sm:inline-flex items-center gap-1 p-1.5 rounded-lg border border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#FAF8F3] dark:bg-[#1B1E1D] text-[#5C615E] dark:text-[#A3A8A5] hover:text-[#1C1B18]"
            title="One-Click JSON Export"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setDarkMode(!darkMode)}
            className="p-1.5 rounded-lg border border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#FAF8F3] dark:bg-[#1B1E1D] text-[#5C615E] dark:text-[#A3A8A5] hover:text-[#1C1B18] dark:hover:text-white"
            title="Toggle Nordic Light / Dark Theme"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-[#C48B37]" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Main Centered 1280px Shell */}
      <div className="flex-1 w-full max-w-[1280px] mx-auto flex">
        {/* Desktop Left Navigation Rail (>= 1024px) */}
        <aside className="hidden lg:flex flex-col justify-between w-60 shrink-0 p-4 border-r border-[#DDD7C9] dark:border-[#2B2F2D]">
          <div className="space-y-6">
            <nav className="space-y-1">
              {(
                [
                  {
                    id: 'trials' as NavTab,
                    label: 'Trials Overview',
                    sub: 'Leaderboard & P&L',
                    icon: LayoutDashboard,
                    badge: undefined as number | undefined,
                  },
                  {
                    id: 'arena' as NavTab,
                    label: 'Participant Arena',
                    sub: `${activeTrial.participants.length} Isolated Threads`,
                    icon: Terminal,
                    badge: undefined as number | undefined,
                  },
                  {
                    id: 'milestones' as NavTab,
                    label: 'Milestones & Eval',
                    sub: 'Rubric & Schedules',
                    icon: Scale,
                    badge: missedCount > 0 ? missedCount : undefined,
                  },
                  {
                    id: 'vault' as NavTab,
                    label: 'Models & Vault',
                    sub: 'AES-GCM Keys & JSON',
                    icon: Shield,
                    badge: undefined as number | undefined,
                  },
                ]
              ).map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all spring-press ${
                      isActive
                        ? 'bg-[#2F5D50] text-white shadow-xs'
                        : 'text-[#5C615E] dark:text-[#A3A8A5] hover:bg-[#EBE6DB] dark:hover:bg-[#1B1E1D]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold leading-none">
                          {item.label}
                        </div>
                        <div
                          className={`text-[10px] mt-0.5 font-mono ${
                            isActive ? 'text-white/75' : 'text-[#8E9490]'
                          }`}
                        >
                          {item.sub}
                        </div>
                      </div>
                    </div>
                    {item.badge && (
                      <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-[#D98A2B] text-white">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Quick Participant Jump List in Left Rail */}
            <div className="pt-4 border-t border-[#DDD7C9] dark:border-[#2B2F2D]">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-[#8E9490] px-2 mb-2">
                Active Competitors ({activeTrial.visibilityMode})
              </span>
              <div className="space-y-1">
                {activeTrial.participants.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setActiveParticipantId(p.id);
                      setActiveTab('arena');
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      activeTab === 'arena' && activeParticipantId === p.id
                        ? 'bg-[#EBE6DB] dark:bg-[#242826] font-semibold text-[#1C1B18] dark:text-[#F2F0EC]'
                        : 'text-[#5C615E] dark:text-[#A3A8A5] hover:bg-[#EBE6DB]/60 dark:hover:bg-[#1B1E1D]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: p.colorHex }}
                      />
                      <span className="truncate">{p.pseudonym}</span>
                    </div>
                    <span className="font-mono text-[10px] text-[#8E9490] tabular-nums ml-1">
                      {activeTrial.isRealMoney
                        ? `$${(p.currentEquityUsd / 1000).toFixed(1)}k`
                        : p.modelName.split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Local Storage / Zero-Backend Guarantee Footer */}
          <div className="p-3 rounded-xl bg-[#EBE6DB]/70 dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[11px] text-[#5C615E] dark:text-[#A3A8A5] space-y-1">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#2F5D50] dark:text-[#428E72] font-semibold">
              100% Client-Side Static
            </div>
            <p className="leading-snug text-[11px]">
              All conversations, P&L ledgers, and AES-GCM encrypted keys remain strictly inside your browser&apos;s IndexedDB.
            </p>
          </div>
        </aside>

        {/* Primary Workspace Content Area */}
        <main
          key={activeTab}
          className="view-enter flex-1 min-w-0 p-4 sm:p-6 pb-24 lg:pb-8"
        >
          {activeTab === 'trials' && (
            <Onboarding
              hasCredential={credentials.length > 0}
              onPickTemplate={() => {
                setModalInitialTemplateId(undefined);
                setIsNewTrialModalOpen(true);
              }}
              onOpenVault={() => setActiveTab('vault')}
              onOpenArena={() => setActiveTab('arena')}
            />
          )}
          {activeTab === 'trials' && (
            <TrialsOverviewView
              trial={activeTrial}
              allTrials={trials}
              onSelectTrial={handleSelectTrial}
              onOpenNewTrialModal={(tplId) => {
                setModalInitialTemplateId(tplId);
                setIsNewTrialModalOpen(true);
              }}
              onJumpToParticipantArena={(pId) => {
                setActiveParticipantId(pId);
                setActiveTab('arena');
              }}
              onJumpToMilestones={() => setActiveTab('milestones')}
              onResumeMissedSchedule={handleRunOrResumeSchedule}
              onUpdateLifecycle={handleUpdateLifecycle}
              onAmendRules={handleAmendRules}
              onExportCurrentTrial={handleExportCurrentTrial}
            />
          )}

          {activeTab === 'arena' && (
            <ParticipantArenaView
              trial={activeTrial}
              models={models}
              activeParticipantId={activeParticipantId}
              onSelectParticipant={setActiveParticipantId}
              onSendMessage={handleSendMessage}
              onPromoteResponseToSubmission={(pId, mId, title, content) =>
                handleAddSubmission({
                  participantId: pId,
                  milestoneId: mId,
                  title,
                  deliverableType: activeTrial.isRealMoney
                    ? 'PORTFOLIO_SNAPSHOT'
                    : 'RESEARCH_REPORT',
                  content,
                  notes: 'Promoted directly from Arena workspace thread.',
                })
              }
            />
          )}

          {activeTab === 'milestones' && (
            <MilestonesEvalView
              trial={activeTrial}
              onAddMilestone={async (ms: Milestone) => {
                const updated: TrialEvent = {
                  ...activeTrial,
                  milestones: [...activeTrial.milestones, ms],
                };
                await persistUpdatedTrial(updated);
                showToast(`Added milestone "${ms.title}".`);
              }}
              onToggleMilestoneStatus={async (mId: string) => {
                const updated: TrialEvent = {
                  ...activeTrial,
                  milestones: activeTrial.milestones.map((m) =>
                    m.id === mId
                      ? {
                          ...m,
                          status:
                            m.status === 'COMPLETED' ? 'DUE' : 'COMPLETED',
                        }
                      : m
                  ),
                };
                await persistUpdatedTrial(updated);
              }}
              onAddSchedule={async (sc: ScheduledCheckIn) => {
                const updated: TrialEvent = {
                  ...activeTrial,
                  schedules: [...activeTrial.schedules, sc],
                };
                await persistUpdatedTrial(updated);
                showToast(`Scheduled "${sc.title}".`);
              }}
              onRunScheduleNow={handleRunOrResumeSchedule}
              onAddSubmission={handleAddSubmission}
              onSaveEvaluation={handleSaveEvaluation}
            />
          )}

          {activeTab === 'vault' && (
            <ModelsVaultView
              trial={activeTrial}
              allTrials={trials}
              models={models}
              credentials={credentials}
              onSaveModel={async (m) => {
                await saveModelToDb(m);
                setModels((prev) => {
                  const exists = prev.some((item) => item.id === m.id);
                  return exists
                    ? prev.map((item) => (item.id === m.id ? m : item))
                    : [...prev, m];
                });
                showToast(`Saved model "${m.name}".`);
              }}
              onDeleteModel={async (mId) => {
                await deleteModelFromDb(mId);
                setModels((prev) => prev.filter((m) => m.id !== mId));
                showToast('Removed model definition.');
              }}
              onSaveCredential={async (cred) => {
                await saveCredentialToDb(cred);
                setCredentials((prev) => [...prev, cred]);
                showToast(`Encrypted "${cred.label}" in IndexedDB.`);
              }}
              onDeleteCredential={async (cId) => {
                await deleteCredentialFromDb(cId);
                setCredentials((prev) => prev.filter((c) => c.id !== cId));
                showToast('Deleted encrypted key from IndexedDB.');
              }}
              onImportJson={async (rawJson, duplicateAsNew) => {
                const { importedEvents, importedModels } =
                  await importTrialBundleJson(rawJson, duplicateAsNew);
                if (importedModels.length > 0) {
                  const dbState = await initializeAndLoadDatabase();
                  setModels(dbState.models);
                  setTrials(dbState.trials);
                } else {
                  setTrials((prev) => [...importedEvents, ...prev]);
                }
                if (importedEvents[0]) {
                  setActiveTrialId(importedEvents[0].id);
                }
                showToast(
                  `Imported ${importedEvents.length} competition(s) into IndexedDB.`
                );
                return { count: importedEvents.length };
              }}
            />
          )}
        </main>
      </div>

      {/* Mobile Persistent Bottom Navigation Bar (< 1024px, height: 64px) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-[calc(4rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] bg-[#FAF8F3]/95 dark:bg-[#1B1E1D]/95 backdrop-blur-md border-t border-[#DDD7C9] dark:border-[#2B2F2D] grid grid-cols-4 px-2">
        {(
          [
            {
              id: 'trials' as NavTab,
              label: 'Trials',
              icon: LayoutDashboard,
              badge: undefined as number | undefined,
            },
            {
              id: 'arena' as NavTab,
              label: 'Arena',
              icon: Terminal,
              badge: undefined as number | undefined,
            },
            {
              id: 'milestones' as NavTab,
              label: 'Milestones',
              icon: Scale,
              badge: missedCount > 0 ? missedCount : undefined,
            },
            {
              id: 'vault' as NavTab,
              label: 'Models & Vault',
              icon: Shield,
              badge: undefined as number | undefined,
            },
          ]
        ).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`relative flex flex-col items-center justify-center gap-1 transition-colors ${
                isActive
                  ? 'text-[#2F5D50] dark:text-[#428E72] font-semibold'
                  : 'text-[#8E9490]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] tracking-tight">{item.label}</span>
              {item.badge && (
                <span className="absolute top-1.5 right-5 w-4 h-4 rounded-full bg-[#D98A2B] text-white text-[9px] font-mono font-bold flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Toast Feedback Micro-Interaction */}
      {toastMessage && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1C1B18] dark:bg-[#F2F0EC] text-[#F4F1EA] dark:text-[#1C1B18] text-xs font-medium shadow-lg border border-white/10 spring-transition">
          <CheckCircle2 className="w-4 h-4 text-[#2A6F4E] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* New Trial / Template Creation Studio Modal */}
      <CreateTrialModal
        isOpen={isNewTrialModalOpen}
        onClose={() => setIsNewTrialModalOpen(false)}
        models={models}
        onCreateTrial={handleCreateNewTrial}
        initialTemplateId={modalInitialTemplateId}
      />
    </div>
  );
}

export default App;
