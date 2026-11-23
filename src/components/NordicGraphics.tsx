import React, { useState } from 'react';
import { Participant } from '../types/trial';

interface MiniSparklineProps {
  points: number[];
  color: string;
  width?: number;
  height?: number;
}

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  points,
  color,
  width = 88,
  height = 28,
}) => {
  if (!points || points.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min === 0 ? 1 : max - min;
  const padY = 4;
  const usableHeight = height - padY * 2;

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * (width - 6) + 3;
    const y = padY + usableHeight - ((val - min) / range) * usableHeight;
    return { x, y };
  });

  const pathD = coords
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');

  const lastPt = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={lastPt.x}
        cy={lastPt.y}
        r={2.6}
        fill={color}
      />
    </svg>
  );
};

interface EquityComparisonChartProps {
  participants: Participant[];
  isRealMoney: boolean;
  startingCapital: number;
  currency?: string;
}

export const EquityComparisonChart: React.FC<EquityComparisonChartProps> = ({
  participants,
  isRealMoney,
  startingCapital,
}) => {
  const [metricMode, setMetricMode] = useState<'equity' | 'score'>(
    isRealMoney ? 'equity' : 'score'
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Collect max length of equity curve points
  const maxSteps = Math.max(
    ...participants.map((p) => p.equityCurve?.length || 0),
    0
  );

  if (maxSteps < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-[#DDD7C9] dark:border-[#2B2F2D] rounded-xl bg-[#F4F1EA]/60 dark:bg-[#121413]/40">
        <NordicRadarIllustration className="w-12 h-12 mb-2 text-[#8E9490]" />
        <p className="text-sm font-medium text-[#5C615E] dark:text-[#A3A8A5]">
          Awaiting Milestone 1 Telemetry
        </p>
        <p className="text-xs text-[#8E9490] mt-1 max-w-xs">
          Log a portfolio snapshot or rubric evaluation to plot multi-agent performance trajectories.
        </p>
      </div>
    );
  }

  const referenceCurve =
    participants.find((p) => p.equityCurve.length === maxSteps)?.equityCurve || [];

  const allValues: number[] = [];
  participants.forEach((p) => {
    p.equityCurve.forEach((pt) => {
      allValues.push(metricMode === 'equity' ? pt.value : pt.score);
    });
  });

  if (metricMode === 'equity' && isRealMoney) {
    allValues.push(startingCapital);
  }

  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const padding = (rawMax - rawMin) * 0.12 || 10;
  const minVal = rawMin - padding;
  const maxVal = rawMax + padding;
  const valRange = maxVal - minVal || 1;

  const svgWidth = 680;
  const svgHeight = 220;
  const padLeft = 58;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 30;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const getX = (idx: number) =>
    padLeft + (idx / Math.max(1, maxSteps - 1)) * plotW;
  const getY = (val: number) =>
    padTop + plotH - ((val - minVal) / valRange) * plotH;

  const baselineY =
    metricMode === 'equity' && isRealMoney ? getY(startingCapital) : null;

  const inspectedIdx =
    activeIndex !== null ? activeIndex : maxSteps - 1;
  const inspectedPointMeta = referenceCurve[inspectedIdx];

  return (
    <div className="w-full">
      {/* Top Controls & Live Scrubber Readout */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#8E9490]">
            Checkpoint:
          </span>
          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-[#EBE6DB] dark:bg-[#242826] text-[#1C1B18] dark:text-[#F2F0EC]">
            {inspectedPointMeta?.date} · {inspectedPointMeta?.label}
          </span>
        </div>

        {isRealMoney && (
          <div className="inline-flex rounded-lg p-0.5 bg-[#EBE6DB] dark:bg-[#242826] border border-[#DDD7C9] dark:border-[#2B2F2D]">
            <button
              type="button"
              onClick={() => setMetricMode('equity')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                metricMode === 'equity'
                  ? 'bg-[#FAF8F3] dark:bg-[#1B1E1D] text-[#1C1B18] dark:text-[#F2F0EC] shadow-xs'
                  : 'text-[#5C615E] dark:text-[#A3A8A5]'
              }`}
            >
              NAV ($ USD)
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('score')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                metricMode === 'score'
                  ? 'bg-[#FAF8F3] dark:bg-[#1B1E1D] text-[#1C1B18] dark:text-[#F2F0EC] shadow-xs'
                  : 'text-[#5C615E] dark:text-[#A3A8A5]'
              }`}
            >
              Rubric Score
            </button>
          </div>
        )}
      </div>

      {/* Interactive Scrubber Legend Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {participants.map((p) => {
          const pt =
            p.equityCurve[Math.min(inspectedIdx, p.equityCurve.length - 1)];
          const val = pt
            ? metricMode === 'equity'
              ? pt.value
              : pt.score
            : 0;
          const deltaPct =
            metricMode === 'equity' && p.startingCapitalUsd > 0
              ? ((val - p.startingCapitalUsd) / p.startingCapitalUsd) * 100
              : null;

          return (
            <div
              key={p.id}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#F4F1EA] dark:bg-[#121413] border border-[#DDD7C9] dark:border-[#2B2F2D]"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: p.colorHex }}
                />
                <span className="text-xs font-medium truncate text-[#1C1B18] dark:text-[#F2F0EC]">
                  {p.pseudonym}
                </span>
              </div>
              <div className="text-right font-mono tabular-nums ml-2 shrink-0">
                <span className="text-xs font-semibold text-[#1C1B18] dark:text-[#F2F0EC]">
                  {metricMode === 'equity'
                    ? `$${val.toLocaleString('en-US', {
                        maximumFractionDigits: 0,
                      })}`
                    : `${val.toFixed(1)}`}
                </span>
                {deltaPct !== null && (
                  <span
                    className={`block text-[10px] ${
                      deltaPct >= 0 ? 'text-[#2A6F4E]' : 'text-[#B93829]'
                    }`}
                  >
                    {deltaPct >= 0 ? '+' : ''}
                    {deltaPct.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto select-none touch-pan-y"
          onMouseLeave={() => setActiveIndex(null)}
        >
          {/* Horizontal Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = padTop + ratio * plotH;
            const labelVal = maxVal - ratio * valRange;
            return (
              <g key={i}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-[#DDD7C9] dark:text-[#2B2F2D]"
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-[#8E9490] font-mono text-[10px] tabular-nums"
                >
                  {metricMode === 'equity'
                    ? `$${(labelVal / 1000).toFixed(1)}k`
                    : `${labelVal.toFixed(0)}`}
                </text>
              </g>
            );
          })}

          {/* Starting Capital Baseline ($10k) */}
          {baselineY !== null &&
            baselineY >= padTop &&
            baselineY <= padTop + plotH && (
              <line
                x1={padLeft}
                y1={baselineY}
                x2={svgWidth - padRight}
                y2={baselineY}
                stroke="#A8502F"
                strokeWidth={1.2}
                strokeDasharray="4 4"
                opacity={0.75}
              />
            )}

          {/* Active Vertical Crosshair */}
          <line
            x1={getX(inspectedIdx)}
            y1={padTop}
            x2={getX(inspectedIdx)}
            y2={padTop + plotH}
            stroke="#8E9490"
            strokeWidth={1}
            strokeDasharray="3 3"
          />

          {/* Participant Trajectories */}
          {participants.map((p) => {
            const pts = p.equityCurve.map((pt, idx) => ({
              x: getX(idx),
              y: getY(metricMode === 'equity' ? pt.value : pt.score),
            }));
            if (pts.length === 0) return null;

            const d = pts
              .map(
                (c, idx) =>
                  `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`
              )
              .join(' ');

            const inspectedCoord =
              pts[Math.min(inspectedIdx, pts.length - 1)];

            return (
              <g key={p.id}>
                <path
                  d={d}
                  fill="none"
                  stroke={p.colorHex}
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {pts.map((c, idx) => (
                  <circle
                    key={idx}
                    cx={c.x}
                    cy={c.y}
                    r={idx === inspectedIdx ? 4.5 : 2.5}
                    fill={idx === inspectedIdx ? p.colorHex : '#FAF8F3'}
                    stroke={p.colorHex}
                    strokeWidth={2}
                  />
                ))}
                {inspectedCoord && (
                  <circle
                    cx={inspectedCoord.x}
                    cy={inspectedCoord.y}
                    r={7}
                    fill={p.colorHex}
                    opacity={0.18}
                  />
                )}
              </g>
            );
          })}

          {/* X-Axis Labels & Invisible Hover Hit Columns */}
          {referenceCurve.map((pt, idx) => {
            const x = getX(idx);
            const colWidth = plotW / Math.max(1, maxSteps - 1);
            return (
              <g key={idx}>
                <text
                  x={x}
                  y={svgHeight - 8}
                  textAnchor="middle"
                  className={`font-mono text-[10px] transition-colors ${
                    idx === inspectedIdx
                      ? 'fill-[#1C1B18] dark:fill-[#F2F0EC] font-semibold'
                      : 'fill-[#8E9490]'
                  }`}
                >
                  {pt.date}
                </text>
                <rect
                  x={x - colWidth / 2}
                  y={padTop}
                  width={colWidth}
                  height={plotH}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => setActiveIndex(idx)}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export const NordicRadarIllustration: React.FC<{ className?: string }> = ({
  className = 'w-10 h-10',
}) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle
      cx="24"
      cy="24"
      r="20"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray="3 3"
    />
    <circle cx="24" cy="24" r="12" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="24" cy="24" r="3" fill="#A8502F" />
    <path
      d="M24 4V12M24 36V44M4 24H12M36 24H44"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M24 24L36 14"
      stroke="#2F5D50"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const NordicVaultSeal: React.FC<{ className?: string }> = ({
  className = 'w-8 h-8',
}) => (
  <svg
    viewBox="0 0 36 36"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="4"
      y="8"
      width="28"
      height="22"
      rx="4"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M12 8V6C12 4.34315 13.3431 3 15 3H21C22.6569 3 24 4.34315 24 6V8"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <circle cx="18" cy="19" r="4" stroke="#2F5D50" strokeWidth="1.75" />
    <circle cx="18" cy="19" r="1.5" fill="#A8502F" />
  </svg>
);
