import React from 'react';
import {
  LayoutDashboard,
  Scale,
  Shield,
  Terminal,
} from 'lucide-react';
import type { NavTab } from '../types/nav';

interface BottomNavProps {
  activeTab: NavTab;
  missedCount: number;
  setActiveTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  missedCount,
  setActiveTab,
}) => {
  return (
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
                ? 'text-[#2F5D50] dark:text-[#5FAE92] font-semibold'
                : 'text-[#6A6558] dark:text-[#8E9490]'
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
  );
};
