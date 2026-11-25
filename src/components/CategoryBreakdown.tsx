import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderSearch, Layers } from "lucide-react";
import {
  CATEGORY_COLORS,
  CategoryDelta,
  CategoryStat,
  FileFilterSelection,
  formatBytes,
  formatDeltaBytes,
  formatNumber,
} from "../types";

interface CategoryBreakdownProps {
  categories: CategoryStat[];
  scannedBytes: number;
  categoryDeltas?: CategoryDelta[];
  activeFilter: FileFilterSelection | null;
  onInspectFilter: (filter: FileFilterSelection) => void;
}

export const CategoryBreakdown: React.FC<CategoryBreakdownProps> = ({
  categories,
  scannedBytes,
  categoryDeltas,
  activeFilter,
  onInspectFilter,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(
    categories[0]?.id ?? null
  );

  const deltaMap = useMemo(() => {
    const map = new Map<string, CategoryDelta>();
    for (const d of categoryDeltas ?? []) {
      map.set(d.id, d);
    }
    return map;
  }, [categoryDeltas]);

  const total = scannedBytes > 0 ? scannedBytes : 1;

  return (
    <div className="flex h-full flex-col border-r border-[#252D38] bg-[#0E1217]">
      <div className="flex items-center justify-between border-b border-[#1E2530] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-amber-400" />
          <h3 className="font-display text-sm font-semibold text-[#E6EDF3]">
            Dosya Türüne Göre Dağılım
          </h3>
        </div>
        <span className="font-mono-num text-xs text-[#8B949E]">
          Taranan: {formatBytes(scannedBytes)}
        </span>
      </div>

      {/* Stacked Proportional Bar */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex h-3 w-full overflow-hidden rounded-sm bg-[#1A2028]">
          {categories.map((cat) => {
            const pct = (cat.bytes / total) * 100;
            if (pct < 0.4) return null;
            const color = CATEGORY_COLORS[cat.id] ?? "#64748B";
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() =>
                  setExpandedId(expandedId === cat.id ? null : cat.id)
                }
                style={{ width: `${pct}%`, backgroundColor: color }}
                className="h-full transition-opacity duration-150 hover:opacity-80"
                title={`${cat.label}: ${formatBytes(cat.bytes)} (${pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>
      </div>

      {/* Category Rows */}
      <div className="flex-1 divide-y divide-[#1A2028] overflow-y-auto px-2 pb-3">
        {categories.map((cat) => {
          const pct = (cat.bytes / total) * 100;
          const color = CATEGORY_COLORS[cat.id] ?? "#64748B";
          const isOpen = expandedId === cat.id;
          const delta = deltaMap.get(cat.id);

          const isCatSelected =
            activeFilter?.category === cat.id && !activeFilter.extension;

          return (
            <div key={cat.id} className="px-2 py-1">
              <div
                className={`group flex w-full items-center justify-between rounded px-2 py-2 transition-colors duration-150 ${
                  isCatSelected
                    ? "bg-amber-500/12 ring-1 ring-amber-500/40"
                    : "hover:bg-[#161C24]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : cat.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-xs"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate text-sm font-medium text-[#E6EDF3]">
                    {cat.label}
                  </span>
                  <span className="font-mono-num text-[11px] text-[#6E7781]">
                    {formatNumber(cat.fileCount)} dosya
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onInspectFilter({ category: cat.id, label: cat.label })
                    }
                    className="rounded p-1 text-[#6E7781] opacity-0 transition-all duration-150 group-hover:opacity-100 hover:bg-[#222A35] hover:text-amber-300"
                    title={`${cat.label} dosyalarını topluca listele`}
                  >
                    <FolderSearch className="h-3.5 w-3.5" />
                  </button>
                  {delta && delta.deltaBytes !== 0 && (
                    <span
                      className={`font-mono-num rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        delta.deltaBytes > 0
                          ? "bg-rose-500/15 text-rose-300"
                          : "bg-emerald-500/15 text-emerald-300"
                      }`}
                    >
                      {formatDeltaBytes(delta.deltaBytes)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : cat.id)}
                    className="flex items-center gap-2 text-right"
                  >
                    <div>
                      <div className="font-mono-num text-xs font-semibold text-[#E6EDF3]">
                        {formatBytes(cat.bytes)}
                      </div>
                      <div className="font-mono-num text-[10px] text-[#7D8794]">
                        %{pct.toFixed(1)}
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-[#7D8794]" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-[#7D8794]" />
                    )}
                  </button>
                </div>
              </div>

              {/* Top Extensions Drawer */}
              {isOpen && cat.topExtensions.length > 0 && (
                <div className="mt-1 mb-2 ml-6 space-y-1 border-l border-[#252D38] pl-2.5">
                  {cat.topExtensions.map((ext) => {
                    const extPct = cat.bytes > 0 ? (ext.bytes / cat.bytes) * 100 : 0;
                    const isExtSelected = activeFilter?.extension === ext.ext;
                    return (
                      <button
                        key={ext.ext}
                        type="button"
                        onClick={() =>
                          onInspectFilter({
                            extension: ext.ext,
                            label: ext.ext,
                          })
                        }
                        className={`block w-full rounded px-2 py-1.5 text-left transition-colors duration-150 ${
                          isExtSelected
                            ? "bg-amber-500/15 ring-1 ring-amber-500/40"
                            : "hover:bg-[#161C24]"
                        }`}
                        title={`${ext.ext} uzantılı tüm dosyaları ve kaynaklarını incele`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span
                              className={`font-mono-num font-medium ${
                                isExtSelected ? "text-amber-300" : "text-[#C9D1D9]"
                              }`}
                            >
                              {ext.ext}
                            </span>
                            <span className="font-mono-num text-[10px] text-[#6E7781]">
                              ({formatNumber(ext.fileCount)})
                            </span>
                            {ext.topSources && ext.topSources.length > 0 && (
                              <span className="truncate rounded bg-[#1A2028] px-1.5 py-0.5 text-[10px] text-[#8B949E]">
                                {ext.topSources.join(" · ")}
                              </span>
                            )}
                          </div>
                          <span className="font-mono-num shrink-0 text-[#9BA7B4]">
                            {formatBytes(ext.bytes)}
                          </span>
                        </div>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#1A2028]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(2, extPct)}%`,
                              backgroundColor: color,
                              opacity: 0.78,
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
