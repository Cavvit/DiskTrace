use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    pub mount_point: String,
    pub name: String,
    pub file_system: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_bytes: u64,
    pub usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionStat {
    pub ext: String,
    pub bytes: u64,
    pub file_count: u64,
    #[serde(default)]
    pub top_sources: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryStat {
    pub id: String,
    pub label: String,
    pub bytes: u64,
    pub file_count: u64,
    pub top_extensions: Vec<ExtensionStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderStat {
    pub path: String,
    pub name: String,
    pub depth: usize,
    pub bytes: u64,
    pub file_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub path: String,
    pub name: String,
    pub bytes: u64,
    pub category: String,
    #[serde(default)]
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceGroupStat {
    pub source: String,
    pub bytes: u64,
    pub file_count: u64,
    pub sample_folder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilteredFilesResult {
    pub drive: String,
    pub category: Option<String>,
    pub extension: Option<String>,
    pub total_bytes: u64,
    pub total_count: u64,
    pub sources: Vec<SourceGroupStat>,
    pub files: Vec<FileStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotSummary {
    pub id: String,
    pub timestamp: i64,
    pub drive: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub scanned_bytes: u64,
    pub file_count: u64,
    pub duration_ms: u64,
    pub categories: Vec<CategoryStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotDetail {
    pub summary: SnapshotSummary,
    pub folders: Vec<FolderStat>,
    pub top_files: Vec<FileStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryDelta {
    pub id: String,
    pub label: String,
    pub before_bytes: u64,
    pub after_bytes: u64,
    pub delta_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderDelta {
    pub path: String,
    pub name: String,
    pub depth: usize,
    pub before_bytes: u64,
    pub after_bytes: u64,
    pub delta_bytes: i64,
    pub percent_change: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotComparison {
    pub from_id: String,
    pub to_id: String,
    pub from_timestamp: i64,
    pub to_timestamp: i64,
    pub drive: String,
    pub total_delta_bytes: i64,
    pub scanned_delta_bytes: i64,
    pub category_deltas: Vec<CategoryDelta>,
    pub folder_deltas: Vec<FolderDelta>,
    pub new_large_files: Vec<FileStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub scan_interval_minutes: u64,
    pub monitored_drives: Vec<String>,
    pub autostart: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            scan_interval_minutes: 60,
            monitored_drives: vec!["C:\\".to_string()],
            autostart: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub drive: String,
    pub files_scanned: u64,
    pub bytes_scanned: u64,
    pub current_path: String,
    pub active: bool,
}
