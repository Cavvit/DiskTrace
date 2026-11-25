import React, { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Activity,
  HardDrive,
  RefreshCw,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  AppSettings,
  DriveInfo,
  FileFilterSelection,
  FilteredFilesResult,
  ScanProgress,
  SnapshotComparison,
  SnapshotDetail,
  SnapshotSummary,
  formatBytes,
  formatDeltaBytes,
  formatNumber,
} from "./types";
import { TimelineChart } from "./components/TimelineChart";
import { CategoryBreakdown } from "./components/CategoryBreakdown";
import { DeltaExplorer } from "./components/DeltaExplorer";
import { SettingsModal } from "./components/SettingsModal";

export const App: React.FC = () => {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [activeDrive, setActiveDrive] = useState<string>("C:\\");
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareFromId, setCompareFromId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SnapshotDetail | null>(null);
  const [comparison, setComparison] = useState<SnapshotComparison | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    scanIntervalMinutes: 60,
    monitoredDrives: ["C:\\"],
    autostart: false,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FileFilterSelection | null>(null);
  const [filteredResult, setFilteredResult] = useState<FilteredFilesResult | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);

  const loadDrivesAndSettings = useCallback(async () => {
    try {
      const [dList, cfg] = await Promise.all([
        invoke<DriveInfo[]>("get_drives"),
        invoke<AppSettings>("get_settings"),
      ]);
      setDrives(dList);
      setSettings(cfg);
      if (dList.length > 0) {
        setActiveDrive((prev) =>
          dList.some((d) => d.mountPoint === prev) ? prev : dList[0].mountPoint
        );
      }
    } catch (e) {
      setErrorMsg(String(e));
    }
  }, []);

  const loadSnapshots = useCallback(
    async (drive: string, selectLatest = true) => {
      try {
        const list = await invoke<SnapshotSummary[]>("list_snapshots", {
          drive,
        });
        setSnapshots(list);
        if (list.length === 0) {
          setSelectedId(null);
          setCompareFromId(null);
          setDetail(null);
          setComparison(null);
          return;
        }
        if (selectLatest) {
          const latest = list[list.length - 1];
          setSelectedId(latest.id);
          setCompareFromId(list.length >= 2 ? list[list.length - 2].id : null);
        }
      } catch (e) {
        setErrorMsg(String(e));
      }
    },
    []
  );

  // Initial load + Tauri event subscriptions
  useEffect(() => {
    loadDrivesAndSettings();

    const unlistenProgress = listen<ScanProgress>("scan-progress", (ev) => {
      setScanProgress(ev.payload.active ? ev.payload : null);
    });

    const unlistenCreated = listen<SnapshotSummary>(
      "snapshot-created",
      (ev) => {
        setScanProgress(null);
        loadDrivesAndSettings();
        if (ev.payload.drive.toLowerCase() === activeDrive.toLowerCase()) {
          loadSnapshots(activeDrive, true);
        }
      }
    );

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenCreated.then((fn) => fn());
    };
  }, [activeDrive, loadDrivesAndSettings, loadSnapshots]);

  // Reload snapshots whenever drive changes
  useEffect(() => {
    setActiveFilter(null);
    setFilteredResult(null);
    loadSnapshots(activeDrive, true);
  }, [activeDrive, loadSnapshots]);

  const handleInspectFilter = useCallback(
    async (filter: FileFilterSelection) => {
      setActiveFilter(filter);
      setFilterLoading(true);
      setErrorMsg(null);
      try {
        const res = await invoke<FilteredFilesResult>("list_files_by_filter", {
          drive: activeDrive,
          category: filter.category ?? null,
          extension: filter.extension ?? null,
          limit: 250,
        });
        setFilteredResult(res);
      } catch (e) {
        setErrorMsg(String(e));
        setFilteredResult(null);
      } finally {
        setFilterLoading(false);
      }
    },
    [activeDrive]
  );

  const handleClearFilter = useCallback(() => {
    setActiveFilter(null);
    setFilteredResult(null);
  }, []);

  // Load detail for selected snapshot
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    invoke<SnapshotDetail>("get_snapshot_detail", { id: selectedId })
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((e) => {
        if (!cancelled) setErrorMsg(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Keep compareFromId sensible when selectedId changes
  const handleSelectSnapshot = (id: string) => {
    setSelectedId(id);
    const idx = snapshots.findIndex((s) => s.id === id);
    if (idx > 0) {
      setCompareFromId(snapshots[idx - 1].id);
    } else if (snapshots.length > 1) {
      setCompareFromId(snapshots[1].id);
    } else {
      setCompareFromId(null);
    }
  };

  // Load comparison when both IDs are ready
  useEffect(() => {
    if (!selectedId || !compareFromId || selectedId === compareFromId) {
      setComparison(null);
      return;
    }
    let cancelled = false;
    invoke<SnapshotComparison>("compare_snapshots", {
      fromId: compareFromId,
      toId: selectedId,
    })
      .then((res) => {
        if (!cancelled) setComparison(res);
      })
      .catch(() => {
        if (!cancelled) setComparison(null);
      });
    return () => {
      cancelled = true;
    };
  }, [compareFromId, selectedId]);

  const handleTriggerScan = async () => {
    setErrorMsg(null);
    try {
      await invoke("trigger_scan", { drive: activeDrive });
    } catch (e) {
      setErrorMsg(String(e));
    }
  };

  const handleSaveSettings = async (next: AppSettings) => {
    const saved = await invoke<AppSettings>("save_settings", {
      settings: next,
    });
    setSettings(saved);
  };

  const handleDeleteSnapshot = async (id: string) => {
    await invoke("delete_snapshot", { id });
    await loadSnapshots(activeDrive, true);
  };

  const handleOpenPath = async (path: string) => {
    try {
      await invoke("open_in_explorer", { path });
    } catch (e) {
      setErrorMsg(String(e));
    }
  };

  const currentDriveInfo = useMemo(
    () => drives.find((d) => d.mountPoint === activeDrive) ?? drives[0] ?? null,
    [drives, activeDrive]
  );

  const activeSummary = detail?.summary ?? snapshots[snapshots.length - 1] ?? null;

  const isScanning = scanProgress?.active ?? false;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0B0D10] text-[#E6EDF3]">
      {/* Top Instrument Header */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#252D38] bg-[#0D1015] px-5 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15">
              <Activity className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <h1 className="font-display text-sm leading-none font-bold tracking-tight text-[#E6EDF3]">
                DiskTrace
              </h1>
              <span className="text-[10px] text-[#7D8794]">
                Sistem Tepsisinde Aktif · {settings.scanIntervalMinutes} dk aralık
              </span>
            </div>
          </div>

          <div className="h-5 w-px bg-[#252D38]" />

          {/* Drive Pills */}
          <div className="flex items-center gap-1.5">
            {drives.map((d) => {
              const active = d.mountPoint === activeDrive;
              return (
                <button
                  key={d.mountPoint}
                  onClick={() => setActiveDrive(d.mountPoint)}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition-colors duration-150 ${
                    active
                      ? "border-amber-500/60 bg-amber-500/12 text-amber-200"
                      : "border-[#252D38] bg-[#13171D] text-[#9BA7B4] hover:border-[#384354] hover:text-[#E6EDF3]"
                  }`}
                >
                  <HardDrive className="h-3.5 w-3.5" />
                  <span className="font-mono-num font-semibold">
                    {d.mountPoint}
                  </span>
                  <span className="font-mono-num text-[11px] opacity-80">
                    %{d.usagePercent.toFixed(0)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isScanning && scanProgress && (
            <div className="flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-300">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span className="font-mono-num">
                {formatNumber(scanProgress.filesScanned)} dosya ·{" "}
                {formatBytes(scanProgress.bytesScanned)}
              </span>
            </div>
          )}

          <button
            disabled={isScanning}
            onClick={handleTriggerScan}
            className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-[#0B0D10] transition-colors duration-150 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isScanning ? "animate-spin" : ""}`}
            />
            {isScanning ? "Taranıyor..." : "Şimdi Tara"}
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#252D38] bg-[#13171D] text-[#9BA7B4] transition-colors duration-150 hover:border-[#384354] hover:text-[#E6EDF3]"
            title="Ayarlar"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {errorMsg && (
        <div className="flex items-center justify-between border-b border-rose-500/30 bg-rose-500/10 px-5 py-2 text-xs text-rose-300">
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="underline hover:text-rose-200"
          >
            Kapat
          </button>
        </div>
      )}

      {/* KPI Metric Strip (Hairline grid, no card fatigue) */}
      {currentDriveInfo && (
        <div className="grid shrink-0 grid-cols-4 divide-x divide-[#1E2530] border-b border-[#252D38] bg-[#0E1217]">
          <div className="px-5 py-3">
            <div className="text-[11px] font-medium text-[#7D8794]">
              Kullanılan Alan ({activeSummary ? "Seçili Tarih" : "Anlık"})
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono-num text-lg font-semibold text-[#E6EDF3]">
                {formatBytes(
                  activeSummary?.usedBytes ?? currentDriveInfo.usedBytes
                )}
              </span>
              <span className="font-mono-num text-xs text-amber-400">
                %
                {(
                  ((activeSummary?.usedBytes ?? currentDriveInfo.usedBytes) /
                    Math.max(
                      1,
                      activeSummary?.totalBytes ?? currentDriveInfo.totalBytes
                    )) *
                  100
                ).toFixed(1)}
              </span>
            </div>
          </div>

          <div className="px-5 py-3">
            <div className="text-[11px] font-medium text-[#7D8794]">
              Boş Kapasite
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono-num text-lg font-semibold text-[#E6EDF3]">
                {formatBytes(
                  activeSummary?.availableBytes ??
                    currentDriveInfo.availableBytes
                )}
              </span>
              <span className="font-mono-num text-xs text-[#7D8794]">
                /{" "}
                {formatBytes(
                  activeSummary?.totalBytes ?? currentDriveInfo.totalBytes
                )}
              </span>
            </div>
          </div>

          <div className="px-5 py-3">
            <div className="text-[11px] font-medium text-[#7D8794]">
              Seçili Aralık Değişimi
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              {comparison ? (
                <span
                  className={`font-mono-num text-lg font-semibold ${
                    comparison.totalDeltaBytes > 0
                      ? "text-rose-400"
                      : comparison.totalDeltaBytes < 0
                      ? "text-emerald-400"
                      : "text-[#9BA7B4]"
                  }`}
                >
                  {formatDeltaBytes(comparison.totalDeltaBytes)}
                </span>
              ) : (
                <span className="font-mono-num text-lg font-semibold text-[#6E7781]">
                  —
                </span>
              )}
            </div>
          </div>

          <div className="px-5 py-3">
            <div className="text-[11px] font-medium text-[#7D8794]">
              Kayıtlı Zaman Noktası
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono-num text-lg font-semibold text-[#E6EDF3]">
                {snapshots.length}
              </span>
              <span className="text-xs text-[#7D8794]">
                {activeSummary
                  ? `${formatNumber(activeSummary.fileCount)} dosya`
                  : "Henüz taranmadı"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {snapshots.length === 0 ? (
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
            <Sparkles className="h-6 w-6 text-amber-400" />
          </div>
          <h2 className="font-display mt-4 text-xl font-semibold text-[#E6EDF3]">
            İlk Disk Anlık Görüntüsünü Oluşturun
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[#8B949E]">
            DiskTrace, <span className="font-mono-num text-[#E6EDF3]">{activeDrive}</span>{" "}
            sürücüsündeki klasörleri ve dosya türlerini tarayıp zaman çizelgenizi
            başlatır. Pencereyi kapattığınızda sistem tepsisinde sessizce çalışmaya
            devam eder.
          </p>
          <button
            disabled={isScanning}
            onClick={handleTriggerScan}
            className="mt-6 flex items-center gap-2 rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-[#0B0D10] transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isScanning ? "animate-spin" : ""}`}
            />
            {isScanning
              ? `Taranıyor (${formatNumber(scanProgress?.filesScanned ?? 0)} dosya)...`
              : `${activeDrive} Sürücüsünü Şimdi Tara`}
          </button>
          {isScanning && scanProgress?.currentPath && (
            <p className="font-mono-num mt-3 max-w-lg truncate text-[11px] text-[#6E7781]">
              {scanProgress.currentPath}
            </p>
          )}
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TimelineChart
            snapshots={snapshots}
            selectedId={selectedId}
            compareFromId={compareFromId}
            onSelectSnapshot={handleSelectSnapshot}
          />

          <div className="grid min-h-0 flex-1 grid-cols-12 overflow-hidden">
            <div className="col-span-5 min-h-0 overflow-hidden">
              <CategoryBreakdown
                categories={activeSummary?.categories ?? []}
                scannedBytes={activeSummary?.scannedBytes ?? 0}
                categoryDeltas={comparison?.categoryDeltas}
                activeFilter={activeFilter}
                onInspectFilter={handleInspectFilter}
              />
            </div>
            <div className="col-span-7 min-h-0 overflow-hidden">
              <DeltaExplorer
                snapshots={snapshots}
                detail={detail}
                comparison={comparison}
                compareFromId={compareFromId}
                selectedId={selectedId}
                activeFilter={activeFilter}
                filteredResult={filteredResult}
                filterLoading={filterLoading}
                onClearFilter={handleClearFilter}
                onChangeCompareFrom={setCompareFromId}
                onOpenPath={handleOpenPath}
              />
            </div>
          </div>
        </main>
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          drives={drives}
          snapshots={snapshots}
          onSave={handleSaveSettings}
          onDeleteSnapshot={handleDeleteSnapshot}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};

export default App;
