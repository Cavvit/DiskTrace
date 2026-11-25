import React, { useState } from "react";
import { Trash2, X } from "lucide-react";
import {
  AppSettings,
  DriveInfo,
  SnapshotSummary,
  formatBytes,
  formatDateTime,
} from "../types";

interface SettingsModalProps {
  settings: AppSettings;
  drives: DriveInfo[];
  snapshots: SnapshotSummary[];
  onSave: (next: AppSettings) => Promise<void>;
  onDeleteSnapshot: (id: string) => Promise<void>;
  onClose: () => void;
}

const INTERVAL_OPTIONS = [
  { label: "15 dakika", value: 15 },
  { label: "30 dakika", value: 30 },
  { label: "1 saat", value: 60 },
  { label: "3 saat", value: 180 },
  { label: "6 saat", value: 360 },
  { label: "24 saat", value: 1440 },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  drives,
  snapshots,
  onSave,
  onDeleteSnapshot,
  onClose,
}) => {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);

  const toggleDrive = (mount: string) => {
    const exists = draft.monitoredDrives.includes(mount);
    if (exists && draft.monitoredDrives.length === 1) return;
    setDraft({
      ...draft,
      monitoredDrives: exists
        ? draft.monitoredDrives.filter((d) => d !== mount)
        : [...draft.monitoredDrives, mount],
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-[#252D38] bg-[#11151B] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1E2530] px-5 py-4">
          <h2 className="font-display text-base font-semibold text-[#E6EDF3]">
            Arka Plan Takip & Ayarlar
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#8B949E] hover:bg-[#1A2028] hover:text-[#E6EDF3]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Scan interval */}
          <div>
            <label className="block text-xs font-semibold text-[#C9D1D9]">
              Otomatik Tarama Aralığı
            </label>
            <p className="mt-0.5 text-[11px] text-[#7D8794]">
              Uygulama sistem tepsisindeyken bu aralıkta otomatik anlık görüntü alır.
            </p>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setDraft({ ...draft, scanIntervalMinutes: opt.value })
                  }
                  className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                    draft.scanIntervalMinutes === opt.value
                      ? "border-amber-500 bg-amber-500/15 text-amber-300"
                      : "border-[#252D38] bg-[#0B0D10] text-[#9BA7B4] hover:border-[#384354]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Monitored drives */}
          <div>
            <label className="block text-xs font-semibold text-[#C9D1D9]">
              Otomatik İzlenen Sürücüler
            </label>
            <div className="mt-2 space-y-1.5">
              {drives.map((d) => {
                const checked = draft.monitoredDrives.includes(d.mountPoint);
                return (
                  <label
                    key={d.mountPoint}
                    className="flex cursor-pointer items-center justify-between rounded border border-[#1E2530] bg-[#0B0D10] px-3 py-2 text-xs hover:border-[#2D3644]"
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDrive(d.mountPoint)}
                        className="accent-amber-500"
                      />
                      <span className="font-mono-num font-semibold text-[#E6EDF3]">
                        {d.mountPoint}
                      </span>
                      {d.name && (
                        <span className="text-[#7D8794]">{d.name}</span>
                      )}
                    </div>
                    <span className="font-mono-num text-[#8B949E]">
                      {formatBytes(d.usedBytes)} / {formatBytes(d.totalBytes)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Autostart */}
          <label className="flex cursor-pointer items-center justify-between rounded border border-[#1E2530] bg-[#0B0D10] px-3.5 py-3">
            <div>
              <div className="text-xs font-semibold text-[#E6EDF3]">
                Windows ile Otomatik Başlat
              </div>
              <div className="mt-0.5 text-[11px] text-[#7D8794]">
                Bilgisayar açıldığında DiskTrace sistem tepsisinde hazır başlar.
              </div>
            </div>
            <input
              type="checkbox"
              checked={draft.autostart}
              onChange={(e) =>
                setDraft({ ...draft, autostart: e.target.checked })
              }
              className="h-4 w-4 accent-amber-500"
            />
          </label>

          {/* Snapshot Management */}
          {snapshots.length > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#C9D1D9]">
                  Kayıtlı Anlık Görüntüler ({snapshots.length})
                </label>
              </div>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded border border-[#1E2530] bg-[#0B0D10] p-2">
                {[...snapshots].reverse().map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-[#141921]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num text-[#C9D1D9]">
                        {formatDateTime(s.timestamp)}
                      </span>
                      <span className="font-mono-num text-[11px] text-[#7D8794]">
                        {formatBytes(s.usedBytes)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteSnapshot(s.id)}
                      className="rounded p-1 text-[#6E7781] hover:bg-rose-500/15 hover:text-rose-400"
                      title="Bu kaydı sil"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#1E2530] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#252D38] px-3.5 py-1.5 text-xs font-medium text-[#9BA7B4] hover:text-[#E6EDF3]"
          >
            İptal
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="rounded bg-amber-500 px-4 py-1.5 text-xs font-semibold text-[#0B0D10] transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
};
