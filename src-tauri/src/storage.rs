use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

use crate::models::{
    AppSettings, CategoryDelta, FileStat, FolderDelta, SnapshotComparison, SnapshotDetail,
    SnapshotSummary,
};
use crate::scanner::CATEGORY_ORDER;

pub struct Storage {
    base_dir: PathBuf,
}

impl Storage {
    pub fn new() -> Result<Self, String> {
        let base = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("DiskTrace");
        let snaps = base.join("snapshots");
        fs::create_dir_all(&snaps).map_err(|e| format!("Veri klasörü oluşturulamadı: {}", e))?;
        Ok(Self { base_dir: base })
    }

    fn index_path(&self) -> PathBuf {
        self.base_dir.join("index.json")
    }

    fn settings_path(&self) -> PathBuf {
        self.base_dir.join("settings.json")
    }

    fn snapshot_path(&self, id: &str) -> PathBuf {
        self.base_dir
            .join("snapshots")
            .join(format!("snap_{}.json", id))
    }

    fn write_atomic(path: &PathBuf, content: &str) -> Result<(), String> {
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, content).map_err(|e| format!("Dosya yazılamadı: {}", e))?;
        fs::rename(&tmp, path).map_err(|e| format!("Dosya güncellenemedi: {}", e))?;
        Ok(())
    }

    pub fn load_settings(&self) -> AppSettings {
        let path = self.settings_path();
        if let Ok(raw) = fs::read_to_string(path) {
            if let Ok(parsed) = serde_json::from_str::<AppSettings>(&raw) {
                return parsed;
            }
        }
        AppSettings::default()
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<(), String> {
        let raw = serde_json::to_string_pretty(settings)
            .map_err(|e| format!("Ayarlar serileştirilemedi: {}", e))?;
        Self::write_atomic(&self.settings_path(), &raw)
    }

    pub fn list_summaries(&self, drive: Option<&str>) -> Result<Vec<SnapshotSummary>, String> {
        let path = self.index_path();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let raw = fs::read_to_string(&path).map_err(|e| format!("İndeks okunamadı: {}", e))?;
        let mut items: Vec<SnapshotSummary> =
            serde_json::from_str(&raw).map_err(|e| format!("İndeks bozuk: {}", e))?;
        if let Some(d) = drive {
            items.retain(|s| s.drive.eq_ignore_ascii_case(d));
        }
        items.sort_by_key(|s| s.timestamp);
        Ok(items)
    }

    pub fn save_snapshot(&self, detail: &SnapshotDetail) -> Result<(), String> {
        let detail_json = serde_json::to_string(detail)
            .map_err(|e| format!("Snapshot serileştirilemedi: {}", e))?;
        Self::write_atomic(&self.snapshot_path(&detail.summary.id), &detail_json)?;

        let mut summaries = self.list_summaries(None).unwrap_or_default();
        summaries.retain(|s| s.id != detail.summary.id);
        summaries.push(detail.summary.clone());
        summaries.sort_by_key(|s| s.timestamp);

        let index_json = serde_json::to_string_pretty(&summaries)
            .map_err(|e| format!("İndeks serileştirilemedi: {}", e))?;
        Self::write_atomic(&self.index_path(), &index_json)?;
        Ok(())
    }

    pub fn load_detail(&self, id: &str) -> Result<SnapshotDetail, String> {
        let path = self.snapshot_path(id);
        let raw =
            fs::read_to_string(&path).map_err(|e| format!("Snapshot okunamadı ({}): {}", id, e))?;
        serde_json::from_str(&raw).map_err(|e| format!("Snapshot çözümlenemedi: {}", e))
    }

    pub fn delete_snapshot(&self, id: &str) -> Result<(), String> {
        let path = self.snapshot_path(id);
        if path.exists() {
            let _ = fs::remove_file(path);
        }
        let mut summaries = self.list_summaries(None)?;
        summaries.retain(|s| s.id != id);
        let index_json = serde_json::to_string_pretty(&summaries)
            .map_err(|e| format!("İndeks serileştirilemedi: {}", e))?;
        Self::write_atomic(&self.index_path(), &index_json)
    }

    pub fn compare_snapshots(
        &self,
        from_id: &str,
        to_id: &str,
    ) -> Result<SnapshotComparison, String> {
        let from = self.load_detail(from_id)?;
        let to = self.load_detail(to_id)?;

        let total_delta_bytes =
            to.summary.used_bytes as i64 - from.summary.used_bytes as i64;
        let scanned_delta_bytes =
            to.summary.scanned_bytes as i64 - from.summary.scanned_bytes as i64;

        // Category deltas
        let from_cats: HashMap<&str, u64> = from
            .summary
            .categories
            .iter()
            .map(|c| (c.id.as_str(), c.bytes))
            .collect();
        let to_cats: HashMap<&str, u64> = to
            .summary
            .categories
            .iter()
            .map(|c| (c.id.as_str(), c.bytes))
            .collect();

        let mut category_deltas: Vec<CategoryDelta> = CATEGORY_ORDER
            .iter()
            .map(|(id, label)| {
                let b = from_cats.get(id).copied().unwrap_or(0);
                let a = to_cats.get(id).copied().unwrap_or(0);
                CategoryDelta {
                    id: (*id).to_string(),
                    label: (*label).to_string(),
                    before_bytes: b,
                    after_bytes: a,
                    delta_bytes: a as i64 - b as i64,
                }
            })
            .collect();
        category_deltas.sort_by(|a, b| b.delta_bytes.abs().cmp(&a.delta_bytes.abs()));

        // Folder deltas
        let mut before_folders: HashMap<&str, (&str, usize, u64)> = HashMap::new();
        for f in &from.folders {
            before_folders.insert(f.path.as_str(), (f.name.as_str(), f.depth, f.bytes));
        }

        let mut seen: HashSet<&str> = HashSet::new();
        let mut folder_deltas: Vec<FolderDelta> = Vec::new();

        for f in &to.folders {
            seen.insert(f.path.as_str());
            let before = before_folders
                .get(f.path.as_str())
                .map(|(_, _, b)| *b)
                .unwrap_or(0);
            let delta = f.bytes as i64 - before as i64;
            if delta == 0 {
                continue;
            }
            let pct = if before > 0 {
                Some(((delta as f64 / before as f64) * 1000.0).round() / 10.0)
            } else {
                None
            };
            folder_deltas.push(FolderDelta {
                path: f.path.clone(),
                name: f.name.clone(),
                depth: f.depth,
                before_bytes: before,
                after_bytes: f.bytes,
                delta_bytes: delta,
                percent_change: pct,
            });
        }

        for f in &from.folders {
            if seen.contains(f.path.as_str()) {
                continue;
            }
            let delta = -(f.bytes as i64);
            if delta == 0 {
                continue;
            }
            folder_deltas.push(FolderDelta {
                path: f.path.clone(),
                name: f.name.clone(),
                depth: f.depth,
                before_bytes: f.bytes,
                after_bytes: 0,
                delta_bytes: delta,
                percent_change: Some(-100.0),
            });
        }

        // Sort: biggest absolute impact first
        folder_deltas.sort_by(|a, b| b.delta_bytes.abs().cmp(&a.delta_bytes.abs()));
        folder_deltas.truncate(60);

        // New or grown large files
        let before_files: HashMap<&str, u64> = from
            .top_files
            .iter()
            .map(|f| (f.path.as_str(), f.bytes))
            .collect();
        let mut new_large_files: Vec<FileStat> = to
            .top_files
            .iter()
            .filter(|f| {
                before_files
                    .get(f.path.as_str())
                    .map(|prev| f.bytes > *prev)
                    .unwrap_or(true)
            })
            .cloned()
            .collect();
        new_large_files.sort_by(|a, b| b.bytes.cmp(&a.bytes));
        new_large_files.truncate(20);

        Ok(SnapshotComparison {
            from_id: from.summary.id,
            to_id: to.summary.id,
            from_timestamp: from.summary.timestamp,
            to_timestamp: to.summary.timestamp,
            drive: to.summary.drive,
            total_delta_bytes,
            scanned_delta_bytes,
            category_deltas,
            folder_deltas,
            new_large_files,
        })
    }
}
