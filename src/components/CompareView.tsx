import React from 'react';
import { ArrowLeft } from 'lucide-react';
import type { ChatMessage, Participant, TrialEvent } from '../types/trial';
import { averageScore } from '../services/ranking';

interface Turn {
  prompt?: ChatMessage;
  responses: ChatMessage[];
}

/** A turn starts at each non-assistant message and collects the replies that follow it. */
export function groupTurns(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role === 'assistant') {
      if (!turns.length) turns.push({ responses: [] });
      turns[turns.length - 1].responses.push(m);
    } else if (m.role === 'user') {
      turns.push({ prompt: m, responses: [] });
    }
    // system instructions are shared setup, not part of the comparison
  }
  return turns;
}

interface CompareViewProps {
  trial: TrialEvent;
  leftId: string;
  rightId: string;
  onChange: (side: 'left' | 'right', id: string) => void;
  onClose: () => void;
}

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <span className="label block">{label}</span>
    <span className="font-mono text-sm tabular-nums text-[#1C1B18] dark:text-[#F2F0EC]">{value}</span>
  </div>
);

const Column: React.FC<{ p: Participant; turn?: Turn }> = ({ p, turn }) => (
  <div
    className="p-3.5 rounded-xl border border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#F4F1EA] dark:bg-[#121413]"
    style={{ borderTopColor: p.colorHex, borderTopWidth: 3 }}
  >
    <div className="flex items-center justify-between gap-2 mb-2">
      <span className="text-xs font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">{p.pseudonym}</span>
      {turn && turn.responses.length > 0 && (
        <span className="font-mono text-[10px] text-[#8E9490] tabular-nums">
          {turn.responses.reduce((n, r) => n + (r.tokensOutput || 0), 0).toLocaleString()} tok · $
          {turn.responses.reduce((n, r) => n + (r.estimatedCostUsd || 0), 0).toFixed(3)}
        </span>
      )}
    </div>
    {!turn || turn.responses.length === 0 ? (
      <p className="text-xs italic text-[#8E9490]">No response for this turn.</p>
    ) : (
      turn.responses.map((r) => (
        <div key={r.id} className="mb-2 last:mb-0">
          {r.executionMode === 'failed' && (
            <span className="block mb-1 font-mono text-[10px] text-[#A8502F]">failed call</span>
          )}
          {r.executionMode === 'simulated_sandbox' && (
            <span className="block mb-1 font-mono text-[10px] text-[#8E9490]">simulated</span>
          )}
          <div className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap text-[#1C1B18] dark:text-[#F2F0EC]">
            {r.content}
          </div>
        </div>
      ))
    )}
  </div>
);

export const CompareView: React.FC<CompareViewProps> = ({ trial, leftId, rightId, onChange, onClose }) => {
  const left = trial.participants.find((p) => p.id === leftId) ?? trial.participants[0];
  const right =
    trial.participants.find((p) => p.id === rightId) ??
    trial.participants.find((p) => p.id !== left.id) ??
    trial.participants[0];

  const lt = groupTurns(left.messages);
  const rt = groupTurns(right.messages);
  const count = Math.max(lt.length, rt.length);

  const select = (side: 'left' | 'right', value: string, other: string) => (
    <select
      aria-label={`${side} participant`}
      value={value}
      onChange={(e) => onChange(side, e.target.value)}
      className="min-w-0 flex-1 px-2.5 py-2 text-xs rounded-lg bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC]"
    >
      {trial.participants.map((p) => (
        <option key={p.id} value={p.id} disabled={p.id === other}>
          {p.pseudonym}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#1C1B18] dark:text-[#F2F0EC] spring-press"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Thread
        </button>
        {select('left', left.id, right.id)}
        <span className="label">vs</span>
        {select('right', right.id, left.id)}
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-[#FAF8F3] dark:bg-[#1B1E1D] border border-[#DDD7C9] dark:border-[#2B2F2D]">
        {[left, right].map((p) => (
          <div key={p.id} className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.colorHex }} />
              <span className="text-sm font-editorial text-[#1C1B18] dark:text-[#F2F0EC] truncate">{p.pseudonym}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Score" value={averageScore(p).toFixed(1)} />
              <Stat label="Tokens" value={p.totalTokens.toLocaleString()} />
              <Stat label="Cost" value={`$${p.estimatedCostUsd.toFixed(3)}`} />
            </div>
          </div>
        ))}
      </div>

      {count === 0 ? (
        <p className="p-6 text-center text-sm text-[#8E9490]">
          Nothing to compare yet. Use “Broadcast to all” on a prompt so both participants answer the same thing.
        </p>
      ) : (
        Array.from({ length: count }, (_, i) => {
          const a = lt[i];
          const b = rt[i];
          const prompt = a?.prompt ?? b?.prompt;
          const differs = a?.prompt && b?.prompt && a.prompt.content.trim() !== b.prompt.content.trim();
          return (
            <section key={i} aria-label={`Turn ${i + 1}`} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="label">Turn {i + 1}</span>
                {differs && (
                  <span className="font-mono text-[10px] text-[#A8502F]">prompts differ</span>
                )}
              </div>
              {prompt && (
                <div className="p-3 rounded-xl border border-[#2F5D50]/25 bg-[#2F5D50]/6 text-xs whitespace-pre-wrap text-[#1C1B18] dark:text-[#F2F0EC]">
                  {prompt.content}
                </div>
              )}
              {differs && (
                <div className="p-3 rounded-xl border border-dashed border-[#A8502F]/40 text-xs whitespace-pre-wrap text-[#5C615E] dark:text-[#A3A8A5]">
                  {right.pseudonym} was asked: {b!.prompt!.content}
                </div>
              )}
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Column p={left} turn={a} />
                <Column p={right} turn={b} />
              </div>
            </section>
          );
        })
      )}
    </div>
  );
};
