import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getLive, subscribeLive } from '../services/liveStream';
import { CompareView } from './CompareView';
import {
  Check,
  ClipboardCopy,
  Code2,
  Coins,
  Eye,
  FilePlus2,
  Layers,
  Send,
  Sparkles,
  Terminal,
  UserCheck,
} from 'lucide-react';
import {
  buildSystemPromptForParticipant,
  getParticipantAverageScore,
} from '../services/aiExecutionEngine';
import {
  ChatMessageType,
  ModelDefinition,
  Participant,
  TrialEvent,
} from '../types/trial';

interface ParticipantArenaViewProps {
  trial: TrialEvent;
  models: ModelDefinition[];
  activeParticipantId: string;
  onSelectParticipant: (participantId: string) => void;
  onSendMessage: (params: {
    participantId: string | 'ALL';
    content: string;
    messageType: ChatMessageType;
    isManualAssistantPaste?: boolean;
  }) => Promise<void>;
  onPromoteResponseToSubmission: (
    participantId: string,
    milestoneId: string,
    title: string,
    content: string
  ) => void;
}

export const ParticipantArenaView: React.FC<ParticipantArenaViewProps> = ({
  trial,
  models,
  activeParticipantId,
  onSelectParticipant,
  onSendMessage,
  onPromoteResponseToSubmission,
}) => {
  const activeParticipant: Participant =
    trial.participants.find((p) => p.id === activeParticipantId) ||
    trial.participants[0];

  const [promptInput, setPromptInput] = useState('');
  const [messageType, setMessageType] =
    useState<ChatMessageType>('USER_PROMPT');
  const [broadcastToAll, setBroadcastToAll] = useState(false);
  const [manualPasteMode, setManualPasteMode] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showSystemPromptModal, setShowSystemPromptModal] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [promotedMsgId, setPromotedMsgId] = useState<string | null>(null);
  const liveText = useSyncExternalStore(subscribeLive, () => getLive(activeParticipant?.id));
  const listEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (liveText !== undefined) listEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [liveText]);
  const [compareWithId, setCompareWithId] = useState<string | null>(null);
  const [compareLeftId, setCompareLeftId] = useState<string | null>(null);

  const modelDef = models.find((m) => m.id === activeParticipant?.modelDefId);
  const compiledSystemPrompt = activeParticipant
    ? buildSystemPromptForParticipant(trial, activeParticipant)
    : '';

  const handleCopyCompiledPrompt = () => {
    const fullContext = `${compiledSystemPrompt}\n\n--- LATEST OPERATOR PROMPT ---\n${
      promptInput || '[Enter your prompt here]'
    }`;
    navigator.clipboard.writeText(fullContext);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim() || !activeParticipant) return;
    setIsSending(true);
    try {
      await onSendMessage({
        participantId: broadcastToAll ? 'ALL' : activeParticipant.id,
        content: promptInput.trim(),
        messageType,
        isManualAssistantPaste: manualPasteMode,
      });
      setPromptInput('');
    } finally {
      setIsSending(false);
    }
  };

  const getMessageBadgeStyle = (type: ChatMessageType) => {
    switch (type) {
      case 'USER_PROMPT':
        return 'bg-[#2F5D50]/12 text-[#2F5D50] dark:text-[#5FAE92]';
      case 'SCHEDULED_CHECKIN':
        return 'bg-[#D98A2B]/18 text-[#D98A2B]';
      case 'SYSTEM_INSTRUCTION':
        return 'bg-[#8E9490]/20 text-[#5C615E] dark:text-[#A3A8A5]';
      case 'EVALUATION_FEEDBACK':
        return 'bg-[#A8502F]/18 text-[#A8502F]';
      case 'MODEL_RESPONSE':
      default:
        return 'bg-[#3B6E8C]/15 text-[#3B6E8C] dark:text-[#68A2C4]';
    }
  };

  const activeMilestone =
    trial.milestones.find((m) => m.status === 'DUE') ||
    trial.milestones[trial.milestones.length - 1];

  if (compareWithId && activeParticipant) {
    return (
      <CompareView
        trial={trial}
        leftId={compareLeftId ?? activeParticipant.id}
        rightId={compareWithId}
        onChange={(side, id) =>
          side === 'left' ? setCompareLeftId(id) : setCompareWithId(id)
        }
        onClose={() => {
          setCompareWithId(null);
          setCompareLeftId(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {trial.participants.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() =>
              setCompareWithId(
                trial.participants.find((p) => p.id !== activeParticipant?.id)?.id ?? null
              )
            }
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC] spring-press"
          >
            Compare two
          </button>
        </div>
      )}
      {/* Segmented Participant Switcher Bar */}
      <div className="p-2 rounded-2xl bg-[#EBE6DB] dark:bg-[#242826] border border-[#DDD7C9] dark:border-[#2B2F2D] flex items-center gap-1.5 overflow-x-auto">
        {trial.participants.map((p) => {
          const isSelected = p.id === activeParticipant?.id;
          const pnlPct =
            trial.isRealMoney && p.startingCapitalUsd > 0
              ? ((p.currentEquityUsd - p.startingCapitalUsd) /
                  p.startingCapitalUsd) *
                100
              : null;

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectParticipant(p.id)}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all shrink-0 spring-press ${
                isSelected
                  ? 'bg-[#FAF8F3] dark:bg-[#1B1E1D] text-[#1C1B18] dark:text-[#F2F0EC] shadow-xs border border-[#DDD7C9] dark:border-[#2B2F2D]'
                  : 'text-[#5C615E] dark:text-[#A3A8A5] hover:text-[#1C1B18] dark:hover:text-white'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: p.colorHex }}
              />
              <div className="text-left">
                <div className="font-semibold leading-none">{p.pseudonym}</div>
                <div className="text-[10px] text-[#6A6558] dark:text-[#8E9490] mt-0.5 font-mono">
                  {p.modelName}
                  {pnlPct !== null && (
                    <span
                      className={`ml-1.5 font-semibold ${
                        pnlPct >= 0 ? 'text-[#2A6F4E]' : 'text-[#B93829]'
                      }`}
                    >
                      {pnlPct >= 0 ? '+' : ''}
                      {pnlPct.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Participant Header & Telemetry Bar */}
      {activeParticipant && (
        <div className="p-4 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-mono font-bold text-sm shadow-xs"
              style={{ backgroundColor: activeParticipant.colorHex }}
            >
              {activeParticipant.pseudonym.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
                  {activeParticipant.pseudonym}
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#EBE6DB] dark:bg-[#242826] text-[#5C615E] dark:text-[#A3A8A5]">
                  {activeParticipant.modelName}
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                    modelDef?.connectionStatus === 'ready'
                      ? 'bg-[#2A6F4E]/15 text-[#2A6F4E]'
                      : 'bg-[#D98A2B]/18 text-[#D98A2B]'
                  }`}
                >
                  {modelDef?.connectionStatus === 'ready'
                    ? 'DIRECT / SANDBOX READY'
                    : 'SANDBOX & MANUAL FALLBACK'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-[#6A6558] dark:text-[#8E9490] mt-0.5 tabular-nums">
                {trial.isRealMoney && (
                  <span className="text-[#1C1B18] dark:text-[#F2F0EC] font-semibold flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-[#A8502F]" />
                    Equity: $
                    {activeParticipant.currentEquityUsd.toLocaleString(
                      'en-US',
                      { minimumFractionDigits: 2 }
                    )}
                  </span>
                )}
                <span>
                  Rubric Avg:{' '}
                  <strong className="text-[#1C1B18] dark:text-[#F2F0EC]">
                    {getParticipantAverageScore(activeParticipant).toFixed(1)}
                  </strong>
                  /100
                </span>
                <span>
                  Tokens: {activeParticipant.totalTokens.toLocaleString()}
                </span>
                <span>
                  Est. Cost: ${activeParticipant.estimatedCostUsd.toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSystemPromptModal(!showSystemPromptModal)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC] hover:bg-[#F4F1EA] dark:hover:bg-[#242826]"
            >
              <Code2 className="w-3.5 h-3.5 text-[#2F5D50] dark:text-[#5FAE92]" />
              {showSystemPromptModal
                ? 'Hide Context Prompt'
                : `Inspect ${trial.visibilityMode} Prompt`}
            </button>
            <button
              type="button"
              onClick={handleCopyCompiledPrompt}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#5C615E] dark:text-[#A3A8A5] hover:bg-[#F4F1EA] dark:hover:bg-[#242826]"
              title="Copy full visibility-enforced system context + prompt for external execution"
            >
              {copiedPrompt ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#2A6F4E]" /> Copied!
                </>
              ) : (
                <>
                  <ClipboardCopy className="w-3.5 h-3.5" /> Copy for External Run
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Visibility-Enforced System Prompt Inspector */}
      {showSystemPromptModal && (
        <div className="p-4 rounded-2xl bg-[#1C1B18] text-[#F2F0EC] border border-[#2B2F2D] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#A8502F] flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Compiled {trial.visibilityMode} System Prompt (Isolated Context for{' '}
              {activeParticipant.pseudonym})
            </span>
            <span className="text-[11px] font-mono text-[#6A6558] dark:text-[#8E9490]">
              Enforced automatically on every API / Check-in call
            </span>
          </div>
          <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-[#A3A8A5] max-h-56 overflow-y-auto p-3 rounded-xl bg-black/40 border border-white/10">
            {compiledSystemPrompt}
          </pre>
        </div>
      )}

      {/* Isolated Conversation Thread */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] space-y-4">
        <div className="flex items-center justify-between border-b border-[#DDD7C9] dark:border-[#2B2F2D] pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#2F5D50] dark:text-[#5FAE92]" />
            <span className="text-xs font-mono uppercase tracking-wider text-[#5C615E] dark:text-[#A3A8A5]">
              Independent Execution Thread ({activeParticipant.messages.length}{' '}
              messages)
            </span>
          </div>

          {/* Quick Prompt Presets */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setMessageType('SCHEDULED_CHECKIN');
                setPromptInput(
                  trial.isRealMoney
                    ? 'Provide a mark-to-market review of your open positions, verify your 10% cash/SGOV buffer, and state any rebalance orders for the upcoming milestone.'
                    : 'Provide an updated progress checkpoint against the primary evaluation criteria and highlight key trade-offs.'
                );
              }}
              className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#5C615E] dark:text-[#A3A8A5] hover:border-[#2F5D50]"
            >
              + Load Check-In Template
            </button>
          </div>
        </div>

        {/* Message List */}
        <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1">
          {activeParticipant.messages.map((msg) => {
            const isModel = msg.role === 'assistant';
            const isSystem = msg.role === 'system';

            return (
              <div
                key={msg.id}
                className={`p-4 rounded-xl border transition-all ${
                  isModel
                    ? 'bg-[#F4F1EA] dark:bg-[#121413] border-[#DDD7C9] dark:border-[#2B2F2D] ml-0 sm:mr-6'
                    : isSystem
                    ? 'bg-[#EBE6DB]/60 dark:bg-[#242826]/60 border-dashed border-[#DDD7C9] dark:border-[#2B2F2D]'
                    : 'bg-[#2F5D50]/6 dark:bg-[#367A61]/10 border-[#2F5D50]/25 ml-0 sm:ml-8'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded font-semibold ${getMessageBadgeStyle(
                        msg.messageType
                      )}`}
                    >
                      [{msg.messageType.replace('_', ' ')}]
                    </span>
                    <span className="text-xs font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                      {isModel
                        ? `${activeParticipant.pseudonym} (${activeParticipant.modelName})`
                        : isSystem
                        ? 'Trial Governance Engine'
                        : 'Trial Operator'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] font-mono text-[#6A6558] dark:text-[#8E9490] tabular-nums">
                    {msg.tokensOutput && (
                      <span>
                        {msg.tokensInput}+{msg.tokensOutput} tok ($
                        {msg.estimatedCostUsd?.toFixed(4)})
                      </span>
                    )}
                    <span>
                      {new Date(msg.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                <div className="text-xs sm:text-sm text-[#1C1B18] dark:text-[#F2F0EC] whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </div>

                {/* One-Click Promote Model Response to Versioned Milestone Submission */}
                {isModel && msg.executionMode === 'failed' && (
                  <div className="mt-3 pt-2.5 border-t border-[#DDD7C9] dark:border-[#2B2F2D] text-[11px] font-mono text-[#A8502F]">
                    Failed call · nothing was recorded as a model answer. Retry, or paste the answer manually.
                  </div>
                )}

                {isModel && activeMilestone && msg.executionMode !== 'failed' && (
                  <div className="mt-3 pt-2.5 border-t border-[#DDD7C9] dark:border-[#2B2F2D] flex items-center justify-between">
                    <span className="text-[11px] font-mono text-[#6A6558] dark:text-[#8E9490]">
                      Execution mode:{' '}
                      {msg.executionMode === 'direct_api'
                        ? 'Direct Provider API'
                        : msg.executionMode === 'manual_entry'
                        ? 'Manual Operator Entry'
                        : 'Local Sandbox Adapter'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onPromoteResponseToSubmission(
                          activeParticipant.id,
                          activeMilestone.id,
                          `${activeParticipant.pseudonym} — ${activeMilestone.title} Deliverable`,
                          msg.content
                        );
                        setPromotedMsgId(msg.id);
                        setTimeout(() => setPromotedMsgId(null), 2500);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2F5D50] dark:text-[#5FAE92] hover:underline"
                    >
                      {promotedMsgId === msg.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#2A6F4E]" />
                          Logged as Versioned Submission!
                        </>
                      ) : (
                        <>
                          <FilePlus2 className="w-3.5 h-3.5" />
                          Record as Submission for {activeMilestone.title.split(':')[0]}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {liveText !== undefined && (
            <div
              aria-live="polite"
              className="p-4 rounded-xl border bg-[#F4F1EA] dark:bg-[#121413] border-[#DDD7C9] dark:border-[#2B2F2D] sm:mr-6"
            >
              <span className="block mb-2 font-mono text-[10px] uppercase tracking-wider text-[#2F5D50] dark:text-[#5FAE92]">
                streaming…
              </span>
              <div className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed text-[#1C1B18] dark:text-[#F2F0EC]">
                {liveText}
                <span className="inline-block w-1.5 h-3.5 ml-0.5 align-[-2px] bg-[#2F5D50] animate-pulse" />
              </div>
            </div>
          )}
          <div ref={listEndRef} />
        </div>

        {/* Composer Form */}
        <form
          onSubmit={handleSend}
          className="pt-3 border-t border-[#DDD7C9] dark:border-[#2B2F2D] space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Message Classification Selector */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { type: 'USER_PROMPT', label: 'User Prompt' },
                  { type: 'SCHEDULED_CHECKIN', label: 'Scheduled Check-In' },
                  { type: 'SYSTEM_INSTRUCTION', label: 'System Instruction' },
                  { type: 'EVALUATION_FEEDBACK', label: 'Eval Feedback' },
                ] as const
              ).map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setMessageType(item.type)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all ${
                    messageType === item.type
                      ? 'bg-[#1C1B18] dark:bg-[#F2F0EC] text-white dark:text-[#1C1B18] font-semibold'
                      : 'bg-[#F4F1EA] dark:bg-[#121413] text-[#5C615E] dark:text-[#A3A8A5]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Broadcast & Manual Entry Toggles */}
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs text-[#5C615E] dark:text-[#A3A8A5] cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualPasteMode}
                  onChange={(e) => {
                    setManualPasteMode(e.target.checked);
                    if (e.target.checked) setBroadcastToAll(false);
                  }}
                  className="rounded accent-[#A8502F]"
                />
                <UserCheck className="w-3.5 h-3.5 text-[#A8502F]" />
                Log Manual Model Reply
              </label>

              <label className="inline-flex items-center gap-1.5 text-xs text-[#5C615E] dark:text-[#A3A8A5] cursor-pointer">
                <input
                  type="checkbox"
                  checked={broadcastToAll}
                  disabled={manualPasteMode}
                  onChange={(e) => setBroadcastToAll(e.target.checked)}
                  className="rounded accent-[#2F5D50]"
                />
                <Layers className="w-3.5 h-3.5 text-[#2F5D50] dark:text-[#5FAE92]" />
                Broadcast to All {trial.participants.length} Models
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <textarea
              rows={2}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder={
                manualPasteMode
                  ? `Paste external output from ${activeParticipant.modelName} to record directly in its thread...`
                  : broadcastToAll
                  ? `Broadcast identical ${messageType.toLowerCase().replace('_', ' ')} independently to all ${trial.participants.length} competing models...`
                  : `Message ${activeParticipant.pseudonym} (${activeParticipant.modelName}) in ${trial.visibilityMode} mode...`
              }
              className="flex-1 p-3 text-xs sm:text-sm rounded-xl bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC] focus:outline-none focus:border-[#2F5D50]"
            />
            <button
              type="submit"
              disabled={isSending || !promptInput.trim()}
              className="px-4 py-2 rounded-xl bg-[#2F5D50] hover:bg-[#1E3D34] text-white font-semibold text-xs flex flex-col items-center justify-center gap-1 shrink-0 spring-press disabled:opacity-50"
            >
              {isSending ? (
                <Sparkles className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>
                {manualPasteMode
                  ? 'Record'
                  : broadcastToAll
                  ? 'Broadcast'
                  : 'Execute'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
