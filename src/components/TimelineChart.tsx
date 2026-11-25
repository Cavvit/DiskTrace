import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, History } from "lucide-react";
import {
  SnapshotSummary,
  formatBytes,
  formatDateTime,
  formatDeltaBytes,
  formatShortTime,
} from "../types";

type RangeFilter = "24h" | "7d" | "30d" | "all";

interface TimelineChartProps {
  snapshots: SnapshotSummary[];
  selectedId: string | null;
  compareFromId: string | null;
  onSelectSnapshot: (id: string) => void;
}

const RANGE_OPTIONS: { key: RangeFilter; label: string; ms: number | null }[] = [
  { key: "24h", label: "24S", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "7G", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "30G", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "Tümü", ms: null },
];

export const TimelineChart: React.FC<TimelineChartProps> = ({
  snapshots,
  selectedId,
  compareFromId,
  onSelectSnapshot,
}) => {
  const [range, setRange] = useState<RangeFilter>("all");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const visible = useMemo(() => {
    if (snapshots.length === 0) return [];
    const opt = RANGE_OPTIONS.find((o) => o.key === range);
    if (!opt || opt.ms === null) return snapshots;
    const latestTs = snapshots[snapshots.length - 1].timestamp;
    const cutoff = latestTs - opt.ms;
    const filtered = snapshots.filter((s) => s.timestamp >= cutoff);
    return filtered.length > 0 ? filtered : snapshots.slice(-1);
  }, [snapshots, range]);

  const selectedIndex = useMemo(
    () => snapshots.findIndex((s) => s.id === selectedId),
    [snapshots, selectedId]
  );

  const width = 920;
  const height = 228;
  const padL = 62;
  const padR = 24;
  const padT = 20;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const { minY, maxY, points, yTicks } = useMemo(() => {
    if (visible.length === 0) {
      return { minY: 0, maxY: 1, points: [], yTicks: [] };
    }
    const vals = visible.map((s) => s.usedBytes);
    const totalCap = visible[visible.length - 1].totalBytes || Math.max(...vals, 1);
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const span = rawMax - rawMin;

    // Give breathing room while keeping small real-world changes clearly visible
    const padding = span > 0 ? span * 0.22 : Math.max(totalCap * 0.04, 1024 * 1024 * 512);
    const lo = Math.max(0, rawMin - padding);
    const hi = Math.min(totalCap, rawMax + padding);
    const effectiveHi = hi <= lo ? lo + Math.max(totalCap * 0.05, 1) : hi;

    const pts = visible.map((s, idx) => {
      const x =
        visible.length === 1
          ? padL + plotW / 2
          : padL + (idx / (visible.length - 1)) * plotW;
      const ratio = (s.usedBytes - lo) / (effectiveHi - lo);
      const y = padT + plotH - ratio * plotH;
      return { x, y, snap: s, idx };
    });

    const ticks = [0, 0.33, 0.66, 1].map((t) => {
      const val = lo + t * (effectiveHi - lo);
      const y = padT + plotH - t * plotH;
      return { val, y };
    });

    return { minY: lo, maxY: effectiveHi, points: pts, yTicks: ticks };
  }, [visible, plotW, plotH]);

  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    const baseY = padT + plotH;
    const first = points[0];
    const last = points[points.length - 1];
    return `${linePath} L ${last.x.toFixed(1)} ${baseY} L ${first.x.toFixed(1)} ${baseY} Z`;
  }, [linePath, points, plotH]);

  const compareSpan = useMemo(() => {
    if (!compareFromId || !selectedId || compareFromId === selectedId) return null;
    const a = points.find((p) => p.snap.id === compareFromId);
    const b = points.find((p) => p.snap.id === selectedId);
    if (!a || !b) return null;
    return {
      x1: Math.min(a.x, b.x),
      x2: Math.max(a.x, b.x),
    };
  }, [points, compareFromId, selectedId]);

  const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] ?? null : null;
  const activeSnap =
    selectedIndex >= 0 ? snapshots[selectedIndex] : snapshots[snapshots.length - 1] ?? null;

  const canPrev = selectedIndex > 0;
  const canNext = selectedIndex >= 0 && selectedIndex < snapshots.length - 1;

  return (
    <section className="border-b border-[#252D38] bg-[#10141A]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          <History className="h-4 w-4 text-amber-400" />
          <h2 className="font-display text-sm font-semibold tracking-tight text-[#E6EDF3]">
            Zaman İçinde Disk Doluluğu
          </h2>
          {activeSnap && (
            <span className="font-mono-num rounded bg-[#1A2028] px-2 py-0.5 text-[11px] text-[#9BA7B4]">
              {formatDateTime(activeSnap.timestamp)}
              {selectedIndex === snapshots.length - 1 ? " · Güncel" : " · Geçmiş Görünüm"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-md border border-[#252D38] bg-[#0B0D10] p-0.5">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setRange(opt.key)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                range === opt.key
                  ? "bg-amber-500/20 text-amber-300"
                  : "text-[#8B949E] hover:text-[#E6EDF3]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative px-3 pb-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[228px] w-full select-none overflow-visible"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="diskAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid + Y Axis Labels */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={padL}
                y1={t.y}
                x2={width - padR}
                y2={t.y}
                stroke="#1E2530"
                strokeWidth="1"
                strokeDasharray={i === 0 ? undefined : "3 4"}
              />
              <text
                x={padL - 8}
                y={t.y + 4}
                textAnchor="end"
                className="font-mono-num fill-[#7D8794] text-[10px]"
              >
                {formatBytes(t.val, 1)}
              </text>
            </g>
          ))}

          {/* Comparison Window Highlight */}
          {compareSpan && (
            <rect
              x={compareSpan.x1}
              y={padT}
              width={Math.max(2, compareSpan.x2 - compareSpan.x1)}
              height={plotH}
              fill="#38BDF8"
              fillOpacity="0.08"
              stroke="#38BDF8"
              strokeOpacity="0.25"
              strokeWidth="1"
            />
          )}

          {/* Area + Line */}
          {points.length > 1 && <path d={areaPath} fill="url(#diskAreaFill)" />}
          {points.length > 1 && (
            <path
              d={linePath}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* X-axis timestamps (first, mid, last) */}
          {points.length > 0 &&
            Array.from(
              new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])
            ).map((idx) => {
              const pt = points[idx];
              if (!pt) return null;
              return (
                <text
                  key={idx}
                  x={pt.x}
                  y={height - 10}
                  textAnchor={
                    idx === 0
                      ? "start"
                      : idx === points.length - 1
                      ? "end"
                      : "middle"
                  }
                  className="font-mono-num fill-[#7D8794] text-[10px]"
                >
                  {formatShortTime(pt.snap.timestamp)}
                </text>
              );
            })}

          {/* Hover vertical guideline */}
          {hoveredPoint && (
            <line
              x1={hoveredPoint.x}
              y1={padT}
              x2={hoveredPoint.x}
              y2={padT + plotH}
              stroke="#475569"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
          )}

          {/* Interactive Data Points */}
          {points.map((pt) => {
            const isSelected = pt.snap.id === selectedId;
            const isCompareFrom = pt.snap.id === compareFromId && !isSelected;
            const isHovered = hoveredIdx === pt.idx;

            return (
              <g
                key={pt.snap.id}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(pt.idx)}
                onClick={() => onSelectSnapshot(pt.snap.id)}
              >
                {/* Larger invisible hit target */}
                <circle cx={pt.x} cy={pt.y} r="14" fill="transparent" />

                {isSelected && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="9"
                    fill="#F59E0B"
                    fillOpacity="0.22"
                  />
                )}
                {isCompareFrom && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="8"
                    fill="#38BDF8"
                    fillOpacity="0.22"
                  />
                )}

                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isSelected ? 5 : isCompareFrom || isHovered ? 4.5 : 3}
                  fill={
                    isSelected
                      ? "#F59E0B"
                      : isCompareFrom
                      ? "#38BDF8"
                      : isHovered
                      ? "#FBBF24"
                      : "#0B0D10"
                  }
                  stroke={
                    isCompareFrom ? "#38BDF8" : "#F59E0B"
                  }
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Hover Readout */}
        {hoveredPoint && (
          <div className="pointer-events-none absolute top-3 right-6 rounded-md border border-[#2D3644] bg-[#0B0D10]/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
            <div className="font-mono-num text-[11px] text-[#9BA7B4]">
              {formatDateTime(hoveredPoint.snap.timestamp)}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono-num text-sm font-semibold text-amber-400">
                {formatBytes(hoveredPoint.snap.usedBytes)}
              </span>
              <span className="font-mono-num text-[11px] text-[#8B949E]">
                / {formatBytes(hoveredPoint.snap.totalBytes)} (
                {hoveredPoint.snap.totalBytes > 0
                  ? (
                      (hoveredPoint.snap.usedBytes / hoveredPoint.snap.totalBytes) *
                      100
                    ).toFixed(1)
                  : "0.0"}
                %)
              </span>
            </div>
            {hoveredPoint.idx > 0 && (() => {
              const prev = points[hoveredPoint.idx - 1].snap;
              const diff = hoveredPoint.snap.usedBytes - prev.usedBytes;
              return (
                <div
                  className={`font-mono-num mt-0.5 text-[11px] ${
                    diff > 0
                      ? "text-rose-400"
                      : diff < 0
                      ? "text-emerald-400"
                      : "text-[#7D8794]"
                  }`}
                >
                  Öncekine göre: {formatDeltaBytes(diff)}
                </div>
              );
            })()}
          </div>
        )}

        {/* Scale note when range is zoomed */}
        {points.length > 0 && maxY > minY && (
          <div className="sr-only">
            Aralık {formatBytes(minY)} - {formatBytes(maxY)}
          </div>
        )}
      </div>

      {/* Time-Travel Scrubber */}
      {snapshots.length > 1 && (
        <div className="flex items-center gap-3 border-t border-[#1D232D] bg-[#0D1015] px-5 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-[#8B949E]">
            <Clock className="h-3.5 w-3.5 text-sky-400" />
            <span className="font-medium text-[#C9D1D9]">Zaman Gezgini</span>
          </div>

          <button
            disabled={!canPrev}
            onClick={() => canPrev && onSelectSnapshot(snapshots[selectedIndex - 1].id)}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#252D38] bg-[#13171D] text-[#C9D1D9] transition-colors duration-150 hover:border-amber-500/50 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-35"
            title="Önceki anlık görüntü"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <input
            type="range"
            min={0}
            max={snapshots.length - 1}
            value={selectedIndex >= 0 ? selectedIndex : snapshots.length - 1}
            onChange={(e) => {
              const idx = Number(e.target.value);
              if (snapshots[idx]) onSelectSnapshot(snapshots[idx].id);
            }}
            className="scrubber flex-1"
            aria-label="Geçmiş anlık görüntülerde gezin"
          />

          <button
            disabled={!canNext}
            onClick={() => canNext && onSelectSnapshot(snapshots[selectedIndex + 1].id)}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#252D38] bg-[#13171D] text-[#C9D1D9] transition-colors duration-150 hover:border-amber-500/50 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-35"
            title="Sonraki anlık görüntü"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <span className="font-mono-num min-w-[74px] text-right text-xs text-[#8B949E]">
            {(selectedIndex >= 0 ? selectedIndex : snapshots.length - 1) + 1} /{" "}
            {snapshots.length}
          </span>
        </div>
      )}
    </section>
  );
};
