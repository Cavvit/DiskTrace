import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  FileText,
  Folder,
  FolderSearch,
  GitCompareArrows,
  Loader2,
  Search,
  X,
} from "lucide-react";
import {
  CATEGORY_COLORS,
  FileFilterSelection,
  FilteredFilesResult,
  SnapshotComparison,
  SnapshotDetail,
  SnapshotSummary,
  formatBytes,
  formatDeltaBytes,
  formatNumber,
  formatShortTime,
} from "../types";

type ExplorerTab = "delta" | "folders" | "files" | "inspect";
type DepthFilter = "all" | 1 | 2 | 3;

interface DeltaExplorerProps {
  snapshots: SnapshotSummary[];
  detail: SnapshotDetail | null;
  comparison: SnapshotComparison | null;
  compareFromId: string | null;
  selectedId: string | null;
  activeFilter: FileFilterSelection | null;
  filteredResult: FilteredFilesResult | null;
  filterLoading: boolean;
  onClearFilter: () => void;
  onChangeCompareFrom: (id: string) => void;
  onOpenPath: (path: string) => void;
}

export const DeltaExplorer: React.FC<DeltaExplorerProps> = ({
  snapshots,
  detail,
  comparison,
  compareFromId,
  selectedId,
  activeFilter,
  filteredResult,
  filterLoading,
  onClearFilter,
  onChangeCompareFrom,
  onOpenPath,
}) => {
  const [tab, setTab] = useState<ExplorerTab>("delta");
  const [depthFilter, setDepthFilter] = useState<DepthFilter>("all");
  const [onlyGrowth, setOnlyGrowth] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (activeFilter) {
      setTab("inspect");
      setSelectedSource(null);
      setSearchQuery("");
    }
  }, [activeFilter]);

  const displayedFilteredFiles = useMemo(() => {
    if (!filteredResult) return [];
    const q = searchQuery.trim().toLowerCase();
    return filteredResult.files.filter((f) => {
      if (selectedSource && f.source !== selectedSource) return false;
      if (
        q &&
        !f.name.toLowerCase().includes(q) &&
        !f.path.toLowerCase().includes(q) &&
        !(f.source ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [filteredResult, selectedSource, searchQuery]);

  const filteredFolderDeltas = useMemo(() => {
    if (!comparison) return [];
    return comparison.folderDeltas.filter((f) => {
      if (depthFilter !== "all" && f.depth !== depthFilter) return false;
      if (onlyGrowth && f.deltaBytes <= 0) return false;
      return true;
    });
  }, [comparison, depthFilter, onlyGrowth]);

  const maxAbsDelta = useMemo(() => {
    return Math.max(
      1,
      ...filteredFolderDeltas.map((f) => Math.abs(f.deltaBytes))
    );
  }, [filteredFolderDeltas]);

  const filteredFolders = useMemo(() => {
    if (!detail) return [];
    return detail.folders.filter((f) =>
      depthFilter === "all" ? true : f.depth === depthFilter
    );
  }, [detail, depthFilter]);

  const maxFolderBytes = useMemo(() => {
    return Math.max(1, ...filteredFolders.map((f) => f.bytes));
  }, [filteredFolders]);

  const compareCandidates = useMemo(() => {
    return snapshots.filter((s) => s.id !== selectedId);
  }, [snapshots, selectedId]);

  return (
    <div className="flex h-full flex-col bg-[#0B0D10]">
      {/* Tab Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2530] px-5 py-2.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("delta")}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
              tab === "delta"
                ? "bg-amber-500/15 text-amber-300"
                : "text-[#8B949E] hover:bg-[#151A22] hover:text-[#E6EDF3]"
            }`}
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
            Değişim & Nedenler
          </button>
          <button
            onClick={() => setTab("folders")}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
              tab === "folders"
                ? "bg-amber-500/15 text-amber-300"
                : "text-[#8B949E] hover:bg-[#151A22] hover:text-[#E6EDF3]"
            }`}
          >
            <Folder className="h-3.5 w-3.5" />
            Klasörler
          </button>
          <button
            onClick={() => setTab("files")}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
              tab === "files"
                ? "bg-amber-500/15 text-amber-300"
                : "text-[#8B949E] hover:bg-[#151A22] hover:text-[#E6EDF3]"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            En Büyük Dosyalar
          </button>
          <button
            onClick={() => setTab("inspect")}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
              tab === "inspect"
                ? "bg-amber-500/15 text-amber-300"
                : "text-[#8B949E] hover:bg-[#151A22] hover:text-[#E6EDF3]"
            }`}
          >
            <FolderSearch className="h-3.5 w-3.5" />
            Tür Detayı
            {activeFilter && (
              <span className="font-mono-num rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">
                {activeFilter.label}
              </span>
            )}
          </button>
        </div>

        {(tab === "delta" || tab === "folders") && (
          <div className="flex items-center gap-1.5 text-[11px]">
            {(["all", 1, 2, 3] as DepthFilter[]).map((d) => (
              <button
                key={String(d)}
                onClick={() => setDepthFilter(d)}
                className={`rounded border px-2 py-0.5 transition-colors duration-150 ${
                  depthFilter === d
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                    : "border-[#252D38] text-[#8B949E] hover:text-[#E6EDF3]"
                }`}
              >
                {d === "all" ? "Tümü" : `Seviye ${d}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* DELTA TAB */}
      {tab === "delta" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {snapshots.length < 2 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
              <GitCompareArrows className="mb-3 h-8 w-8 text-[#475569]" />
              <p className="text-sm font-medium text-[#C9D1D9]">
                Karşılaştırma için en az 2 anlık görüntü gerekiyor
              </p>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#7D8794]">
                DiskTrace sistem tepsisinde çalışırken belirlediğiniz aralıklarla yeni
                anlık görüntüler alır. İkinci taramadan sonra diskteki artışa tam olarak
                hangi klasör ve dosyaların neden olduğunu burada görebilirsiniz.
              </p>
            </div>
          ) : (
            <>
              {/* Comparison Picker + Net Delta Strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1A2028] bg-[#10141A] px-5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[#8B949E]">Karşılaştır:</span>
                  <select
                    value={compareFromId ?? ""}
                    onChange={(e) => onChangeCompareFrom(e.target.value)}
                    className="font-mono-num rounded border border-[#252D38] bg-[#0B0D10] px-2.5 py-1 text-xs text-sky-300 outline-none focus:border-sky-400"
                  >
                    {compareCandidates.map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatShortTime(s.timestamp)} ({formatBytes(s.usedBytes)})
                      </option>
                    ))}
                  </select>
                  <span className="text-[#6E7781]">→</span>
                  <span className="font-mono-num rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
                    {detail
                      ? `${formatShortTime(detail.summary.timestamp)} (${formatBytes(
                          detail.summary.usedBytes
                        )})`
                      : "Seçili"}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#9BA7B4]">
                    <input
                      type="checkbox"
                      checked={onlyGrowth}
                      onChange={(e) => setOnlyGrowth(e.target.checked)}
                      className="accent-amber-500"
                    />
                    Sadece büyüyenler
                  </label>

                  {comparison && (
                    <div
                      className={`font-mono-num flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold ${
                        comparison.totalDeltaBytes > 0
                          ? "bg-rose-500/15 text-rose-300"
                          : comparison.totalDeltaBytes < 0
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-[#1A2028] text-[#9BA7B4]"
                      }`}
                    >
                      {comparison.totalDeltaBytes > 0 ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : comparison.totalDeltaBytes < 0 ? (
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      ) : null}
                      Net: {formatDeltaBytes(comparison.totalDeltaBytes)}
                    </div>
                  )}
                </div>
              </div>

              {/* Culprit Folders List */}
              <div className="flex-1 overflow-y-auto px-5 py-3">
                {filteredFolderDeltas.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#7D8794]">
                    Seçilen iki tarih arasında klasör düzeyinde anlamlı bir boyut değişimi
                    saptanmadı.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredFolderDeltas.map((item) => {
                      const isGrowth = item.deltaBytes > 0;
                      const barWidth = Math.max(
                        3,
                        (Math.abs(item.deltaBytes) / maxAbsDelta) * 100
                      );
                      return (
                        <div
                          key={item.path}
                          className="group rounded border border-transparent bg-[#10141A] px-3 py-2 transition-colors duration-150 hover:border-[#252D38] hover:bg-[#141921]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-xs font-medium text-[#E6EDF3]">
                                  {item.path}
                                </span>
                                <button
                                  onClick={() => onOpenPath(item.path)}
                                  className="shrink-0 text-[#6E7781] opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:text-amber-300"
                                  title="Dosya Gezgini'nde aç"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <div className="font-mono-num mt-0.5 text-[11px] text-[#7D8794]">
                                {formatBytes(item.beforeBytes)} →{" "}
                                {formatBytes(item.afterBytes)}
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <div
                                className={`font-mono-num text-xs font-semibold ${
                                  isGrowth ? "text-rose-400" : "text-emerald-400"
                                }`}
                              >
                                {formatDeltaBytes(item.deltaBytes)}
                              </div>
                              {item.percentChange !== null && (
                                <div className="font-mono-num text-[10px] text-[#7D8794]">
                                  {item.percentChange > 0 ? "+" : ""}
                                  {item.percentChange.toFixed(1)}%
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#1A2028]">
                            <div
                              className={`h-full rounded-full ${
                                isGrowth ? "bg-rose-500/80" : "bg-emerald-500/80"
                              }`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* New/Grown Large Files */}
                {comparison && comparison.newLargeFiles.length > 0 && (
                  <div className="mt-6 border-t border-[#1E2530] pt-4">
                    <h4 className="mb-2.5 text-xs font-semibold tracking-wide text-[#9BA7B4] uppercase">
                      Yeni veya Büyüyen Büyük Dosyalar
                    </h4>
                    <div className="space-y-1.5">
                      {comparison.newLargeFiles.slice(0, 10).map((f) => (
                        <div
                          key={f.path}
                          className="group flex items-center justify-between gap-3 rounded bg-[#10141A] px-3 py-1.5 text-xs hover:bg-[#141921]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-[#E6EDF3]">
                              {f.name}
                            </div>
                            <div className="truncate font-mono-num text-[10px] text-[#6E7781]">
                              {f.path}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-mono-num font-semibold text-amber-300">
                              {formatBytes(f.bytes)}
                            </span>
                            <button
                              onClick={() => onOpenPath(f.path)}
                              className="text-[#6E7781] opacity-0 transition-opacity group-hover:opacity-100 hover:text-amber-300"
                              title="Dosya Gezgini'nde göster"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* FOLDERS TAB */}
      {tab === "folders" && (
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {filteredFolders.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#7D8794]">
              Bu anlık görüntüde klasör verisi yok.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFolders.slice(0, 60).map((f) => {
                const w = Math.max(2, (f.bytes / maxFolderBytes) * 100);
                return (
                  <div
                    key={f.path}
                    className="group rounded bg-[#10141A] px-3 py-2 transition-colors hover:bg-[#141921]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-xs font-medium text-[#E6EDF3]">
                          {f.path}
                        </span>
                        <button
                          onClick={() => onOpenPath(f.path)}
                          className="shrink-0 text-[#6E7781] opacity-0 transition-opacity group-hover:opacity-100 hover:text-amber-300"
                          title="Dosya Gezgini'nde aç"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="font-mono-num shrink-0 text-xs font-semibold text-[#E6EDF3]">
                        {formatBytes(f.bytes)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#1A2028]">
                      <div
                        className="h-full rounded-full bg-amber-500/75"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FILES TAB */}
      {tab === "files" && (
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {!detail || detail.topFiles.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#7D8794]">
              Büyük dosya kaydı yok.
            </div>
          ) : (
            <div className="space-y-1.5">
              {detail.topFiles.map((f) => {
                const color = CATEGORY_COLORS[f.category] ?? "#64748B";
                return (
                  <div
                    key={f.path}
                    className="group flex items-center justify-between gap-3 rounded bg-[#10141A] px-3 py-2 transition-colors hover:bg-[#141921]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-medium text-[#E6EDF3]">
                            {f.name}
                          </span>
                          {f.source && (
                            <span className="shrink-0 rounded bg-[#1A2028] px-1.5 py-0.5 text-[10px] text-[#9BA7B4]">
                              {f.source}
                            </span>
                          )}
                        </div>
                        <div className="font-mono-num truncate text-[10px] text-[#6E7781]">
                          {f.path}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="font-mono-num text-xs font-semibold text-[#E6EDF3]">
                        {formatBytes(f.bytes)}
                      </span>
                      <button
                        onClick={() => onOpenPath(f.path)}
                        className="text-[#6E7781] opacity-0 transition-opacity group-hover:opacity-100 hover:text-amber-300"
                        title="Dosya Gezgini'nde göster"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* INSPECT TAB (Category / Extension Bulk File Viewer) */}
      {tab === "inspect" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {!activeFilter ? (
            <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
              <FolderSearch className="mb-3 h-8 w-8 text-[#475569]" />
              <p className="text-sm font-medium text-[#C9D1D9]">
                İncelemek için soldan bir uzantı veya kategori seçin
              </p>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#7D8794]">
                Örneğin <span className="font-mono-num text-[#E6EDF3]">.vpk</span>,{" "}
                <span className="font-mono-num text-[#E6EDF3]">.pak</span> veya herhangi
                bir uzantıya tıkladığınızda o türdeki tüm dosyalar ve hangi oyun/uygulamaya
                ait oldukları burada topluca listelenir.
              </p>
            </div>
          ) : filterLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-xs text-[#8B949E]">
              <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
              <span>
                <span className="font-mono-num text-[#E6EDF3]">{activeFilter.label}</span>{" "}
                dosyaları diskte taranıyor ve kaynakları tespit ediliyor...
              </span>
            </div>
          ) : filteredResult ? (
            <>
              {/* Filter Summary Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1A2028] bg-[#10141A] px-5 py-2.5">
                <div className="flex items-center gap-2.5 text-xs">
                  <span className="font-mono-num rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-300">
                    {activeFilter.label}
                  </span>
                  <span className="font-mono-num text-[#E6EDF3]">
                    {formatBytes(filteredResult.totalBytes)}
                  </span>
                  <span className="font-mono-num text-[#7D8794]">
                    · {formatNumber(filteredResult.totalCount)} dosya
                    {filteredResult.totalCount > filteredResult.files.length
                      ? ` (en büyük ${filteredResult.files.length} gösteriliyor)`
                      : ""}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-[#6E7781]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Dosya veya yol ara..."
                      className="w-44 rounded border border-[#252D38] bg-[#0B0D10] py-1 pr-2 pl-6 text-xs text-[#E6EDF3] placeholder-[#6E7781] outline-none focus:border-amber-500/60"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={onClearFilter}
                    className="flex items-center gap-1 rounded border border-[#252D38] px-2 py-1 text-[11px] text-[#8B949E] hover:border-[#384354] hover:text-[#E6EDF3]"
                    title="Filtreyi temizle"
                  >
                    <X className="h-3 w-3" />
                    Temizle
                  </button>
                </div>
              </div>

              {/* Source / App Attribution Strip */}
              {filteredResult.sources.length > 0 && (
                <div className="border-b border-[#1A2028] bg-[#0D1015] px-5 py-2.5">
                  <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-[#7D8794] uppercase">
                    Neye Ait? (Uygulama / Oyun / Klasör Kaynağı)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredResult.sources.map((src) => {
                      const active = selectedSource === src.source;
                      return (
                        <div
                          key={src.source}
                          className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] transition-colors ${
                            active
                              ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
                              : "border-[#252D38] bg-[#13171D] text-[#C9D1D9] hover:border-[#384354]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedSource(active ? null : src.source)
                            }
                            className="flex items-center gap-1.5"
                          >
                            <span className="font-medium">{src.source}</span>
                            <span className="font-mono-num text-[10px] text-[#8B949E]">
                              {formatBytes(src.bytes)} ({formatNumber(src.fileCount)})
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenPath(src.sampleFolder)}
                            className="text-[#6E7781] hover:text-amber-300"
                            title={`Klasörü aç: ${src.sampleFolder}`}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bulk File List */}
              <div className="flex-1 overflow-y-auto px-5 py-3">
                {displayedFilteredFiles.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#7D8794]">
                    Bu filtreye uyan dosya bulunamadı.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {displayedFilteredFiles.map((f) => {
                      const color = CATEGORY_COLORS[f.category] ?? "#64748B";
                      return (
                        <div
                          key={f.path}
                          className="group flex items-center justify-between gap-3 rounded bg-[#10141A] px-3 py-2 transition-colors hover:bg-[#141921]"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-xs font-medium text-[#E6EDF3]">
                                  {f.name}
                                </span>
                                {f.source && (
                                  <span className="shrink-0 rounded bg-[#1A2028] px-1.5 py-0.5 text-[10px] text-[#9BA7B4]">
                                    {f.source}
                                  </span>
                                )}
                              </div>
                              <div className="font-mono-num truncate text-[10px] text-[#6E7781]">
                                {f.path}
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2.5">
                            <span className="font-mono-num text-xs font-semibold text-[#E6EDF3]">
                              {formatBytes(f.bytes)}
                            </span>
                            <button
                              onClick={() => onOpenPath(f.path)}
                              className="text-[#6E7781] opacity-0 transition-opacity group-hover:opacity-100 hover:text-amber-300"
                              title="Dosya Gezgini'nde göster"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};
