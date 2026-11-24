import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

interface OnboardingProps {
  hasCredential: boolean;
  onPickTemplate: () => void;
  onOpenVault: () => void;
  onOpenArena: () => void;
}

const FLAG = 'model-trials:onboarding';

type Saved = { dismissed?: boolean; template?: boolean; prompt?: boolean };

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(FLAG) || '{}');
  } catch {
    return {};
  }
}
function save(next: Saved) {
  try {
    localStorage.setItem(FLAG, JSON.stringify(next));
  } catch {
    /* private mode: the card just reappears next visit */
  }
}

/** Three steps from empty to a first answer. Hides itself once dismissed. */
export const Onboarding: React.FC<OnboardingProps> = ({
  hasCredential,
  onPickTemplate,
  onOpenVault,
  onOpenArena,
}) => {
  const [state, setState] = useState<Saved>(load);
  if (state.dismissed) return null;

  const update = (patch: Saved) => {
    const next = { ...state, ...patch };
    setState(next);
    save(next);
  };

  const steps = [
    {
      title: 'Choose a template',
      hint: 'Stock trading, content race or research race, ready to edit.',
      done: !!state.template,
      cta: 'Pick one',
      run: () => {
        update({ template: true });
        onPickTemplate();
      },
    },
    {
      title: 'Add an API key',
      hint: 'Encrypted on this device. Or skip it and run participants manually.',
      done: hasCredential,
      cta: 'Open vault',
      run: onOpenVault,
    },
    {
      title: 'Send the first prompt',
      hint: 'Open a participant and ask for their opening move.',
      done: !!state.prompt,
      cta: 'Open arena',
      run: () => {
        update({ prompt: true });
        onOpenArena();
      },
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section
      aria-label="Getting started"
      className="mb-5 p-4 rounded-2xl border border-[#DDD7C9] dark:border-[#2B2F2D] bg-[#FAF8F3] dark:bg-[#1B1E1D]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="label block">Getting started · {doneCount} of 3</span>
          <h2 className="mt-1 text-lg font-editorial text-[#1C1B18] dark:text-[#F2F0EC]">
            From empty to a first answer in a minute
          </h2>
        </div>
        <button
          type="button"
          aria-label="Hide getting started"
          onClick={() => update({ dismissed: true })}
          className="p-1.5 -m-1.5 text-[#6A6558] dark:text-[#8E9490] hover:text-[#1C1B18] dark:hover:text-white spring-press"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ol className="mt-3 space-y-2">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-[#F4F1EA] dark:bg-[#121413]"
          >
            <span
              className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-mono font-bold ${
                step.done
                  ? 'bg-[#2F5D50] text-white'
                  : 'border border-[#DDD7C9] dark:border-[#2B2F2D] text-[#5C615E] dark:text-[#A3A8A5]'
              }`}
            >
              {step.done ? <Check className="w-3.5 h-3.5" aria-label="done" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">{step.title}</div>
              <div className="text-[11px] leading-snug text-[#5C615E] dark:text-[#A3A8A5]">{step.hint}</div>
            </div>
            <button
              type="button"
              onClick={step.run}
              className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold bg-[#1C1B18] text-white dark:bg-[#F2F0EC] dark:text-[#181A19] spring-press"
            >
              {step.cta}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};
