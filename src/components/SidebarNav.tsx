import React from 'react';
import {
  LayoutDashboard,
  Scale,
  Shield,
  Terminal,
} from 'lucide-react';
import type { TrialEvent } from '../types/trial';
import type { NavTab } from '../types/nav';

interface SidebarNavProps {
  activeParticipantId: string;
  activeTab: NavTab;
  activeTrial: TrialEvent;
  missedCount: number;
  setActiveParticipantId: (id: string) => void;
  setActiveTab: (tab: NavTab) => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeParticipantId,
  activeTab,
  activeTrial,
  missedCount,
  setActiveParticipantId,
  setActiveTab,
}) => {
  return (
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
                        isActive ? 'text-white/75' : 'text-[#6A6558] dark:text-[#8E9490]'
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
          <span className="block text-[10px] font-mono uppercase tracking-wider text-[#6A6558] dark:text-[#8E9490] px-2 mb-2">
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
                <span className="font-mono text-[10px] text-[#6A6558] dark:text-[#8E9490] tabular-nums ml-1">
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
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#2F5D50] dark:text-[#5FAE92] font-semibold">
          100% Client-Side Static
        </div>
        <p className="leading-snug text-[11px]">
          All conversations, P&L ledgers, and AES-GCM encrypted keys remain strictly inside your browser&apos;s IndexedDB.
        </p>
      </div>
    </aside>
  );
};
