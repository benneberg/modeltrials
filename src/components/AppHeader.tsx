import React from 'react';
import {
  ChevronDown,
  Coins,
  Download,
  Moon,
  Plus,
  Sun,
} from 'lucide-react';
import type { TrialEvent } from '../types/trial';
import type { NavTab } from '../types/nav';
import { getLifecycleBadgeClass } from '../lib/lifecycle';

interface AppHeaderProps {
  activeTrial: TrialEvent;
  trials: TrialEvent[];
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
  handleExportCurrentTrial: () => void;
  handleSelectTrial: (trialId: string) => void;
  setActiveTab: (tab: NavTab) => void;
  setIsNewTrialModalOpen: (open: boolean) => void;
  setModalInitialTemplateId: (id: string | undefined) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  activeTrial,
  trials,
  darkMode,
  setDarkMode,
  handleExportCurrentTrial,
  handleSelectTrial,
  setActiveTab,
  setIsNewTrialModalOpen,
  setModalInitialTemplateId,
}) => {
  return (
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
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#6A6558] dark:text-[#8E9490] block">
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
          <ChevronDown className="w-3.5 h-3.5 text-[#6A6558] dark:text-[#8E9490] absolute right-2 pointer-events-none" />
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
  );
};
