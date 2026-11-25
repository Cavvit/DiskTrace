export interface DriveInfo {
  mountPoint: string;
  name: string;
  fileSystem: string;
  totalBytes: number;
  availableBytes: number;
  usedBytes: number;
  usagePercent: number;
}

export interface ExtensionStat {
  ext: string;
  bytes: number;
  fileCount: number;
  topSources?: string[];
}

export interface CategoryStat {
  id: string;
  label: string;
  bytes: number;
  fileCount: number;
  topExtensions: ExtensionStat[];
}

export interface FolderStat {
  path: string;
  name: string;
  depth: number;
  bytes: number;
  fileCount: number;
}

export interface FileStat {
  path: string;
  name: string;
  bytes: number;
  category: string;
  source?: string;
}

export interface SourceGroupStat {
  source: string;
  bytes: number;
  fileCount: number;
  sampleFolder: string;
}

export interface FilteredFilesResult {
  drive: string;
  category: string | null;
  extension: string | null;
  totalBytes: number;
  totalCount: number;
  sources: SourceGroupStat[];
  files: FileStat[];
}

export interface FileFilterSelection {
  category?: string;
  extension?: string;
  label: string;
}

export interface SnapshotSummary {
  id: string;
  timestamp: number;
  drive: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  scannedBytes: number;
  fileCount: number;
  durationMs: number;
  categories: CategoryStat[];
}

export interface SnapshotDetail {
  summary: SnapshotSummary;
  folders: FolderStat[];
  topFiles: FileStat[];
}

export interface CategoryDelta {
  id: string;
  label: string;
  beforeBytes: number;
  afterBytes: number;
  deltaBytes: number;
}

export interface FolderDelta {
  path: string;
  name: string;
  depth: number;
  beforeBytes: number;
  afterBytes: number;
  deltaBytes: number;
  percentChange: number | null;
}

export interface SnapshotComparison {
  fromId: string;
  toId: string;
  fromTimestamp: number;
  toTimestamp: number;
  drive: string;
  totalDeltaBytes: number;
  scannedDeltaBytes: number;
  categoryDeltas: CategoryDelta[];
  folderDeltas: FolderDelta[];
  newLargeFiles: FileStat[];
}

export interface AppSettings {
  scanIntervalMinutes: number;
  monitoredDrives: string[];
  autostart: boolean;
}

export interface ScanProgress {
  drive: string;
  filesScanned: number;
  bytesScanned: number;
  currentPath: string;
  active: boolean;
}

export const CATEGORY_COLORS: Record<string, string> = {
  game: "#14B8A6",     // Teal
  video: "#F59E0B",    // Amber
  archive: "#F97316",  // Orange
  code: "#38BDF8",     // Sky Cyan
  cad: "#A3E635",      // Technical Lime
  system: "#94A3B8",   // Crisp Slate
  image: "#10B981",    // Emerald
  document: "#EAB308", // Warm Yellow
  audio: "#FB7185",    // Rose
  other: "#64748B",    // Neutral Gray
};

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes === 0) return "0 B";
  const sign = bytes < 0 ? "-" : "";
  const abs = Math.abs(bytes);
  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(abs) / Math.log(k)));
  const val = abs / Math.pow(k, i);
  const d = i === 0 ? 0 : decimals;
  return `${sign}${val.toFixed(d)} ${units[i]}`;
}

export function formatDeltaBytes(delta: number): string {
  if (delta === 0) return "0 B";
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${formatBytes(delta)}`;
}

export function formatDateTime(ts: number): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function formatShortTime(ts: number): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("tr-TR").format(n);
}
