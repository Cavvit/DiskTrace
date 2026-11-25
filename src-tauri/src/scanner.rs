use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};

use chrono::Utc;
use jwalk::WalkDir;
use sysinfo::Disks;

use crate::models::{
    CategoryStat, DriveInfo, ExtensionStat, FileStat, FilteredFilesResult, FolderStat,
    ScanProgress, SnapshotDetail, SnapshotSummary, SourceGroupStat,
};

pub const CATEGORY_ORDER: &[(&str, &str)] = &[
    ("game", "Oyun & Varlık"),
    ("video", "Video"),
    ("image", "Görsel"),
    ("audio", "Ses"),
    ("document", "Belge"),
    ("archive", "Arşiv & Kurulum"),
    ("code", "Kod & Geliştirme"),
    ("cad", "3D & CAD"),
    ("system", "Sistem & Önbellek"),
    ("other", "Diğer"),
];

pub fn list_drives() -> Vec<DriveInfo> {
    let disks = Disks::new_with_refreshed_list();
    let mut result: Vec<DriveInfo> = disks
        .iter()
        .filter(|d| d.total_space() > 0)
        .map(|d| {
            let total = d.total_space();
            let avail = d.available_space();
            let used = total.saturating_sub(avail);
            let pct = if total > 0 {
                (used as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            let mount = d.mount_point().to_string_lossy().to_string();
            let name = d.name().to_string_lossy().to_string();
            let fs = d.file_system().to_string_lossy().to_string();
            DriveInfo {
                mount_point: mount,
                name,
                file_system: fs,
                total_bytes: total,
                available_bytes: avail,
                used_bytes: used,
                usage_percent: (pct * 10.0).round() / 10.0,
            }
        })
        .collect();
    result.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));
    result
}

pub fn detect_source_label(path: &Path) -> String {
    let comps: Vec<String> = path
        .parent()
        .map(|p| {
            p.components()
                .filter_map(|c| match c {
                    Component::Normal(s) => Some(s.to_string_lossy().to_string()),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default();

    if comps.is_empty() {
        return "Kök Dizin".to_string();
    }

    let lower: Vec<String> = comps.iter().map(|s| s.to_ascii_lowercase()).collect();

    for (i, seg) in lower.iter().enumerate() {
        if seg == "steamapps" {
            if let Some(sub) = lower.get(i + 1) {
                if sub == "common" {
                    if let Some(game) = comps.get(i + 2) {
                        return format!("Steam: {}", game);
                    }
                } else if sub == "workshop" {
                    return "Steam Workshop".to_string();
                } else if sub == "shadercache" {
                    return "Steam Shader Cache".to_string();
                }
            }
            return "Steam".to_string();
        }
        if seg == "epic games" {
            if let Some(game) = comps.get(i + 1) {
                return format!("Epic: {}", game);
            }
            return "Epic Games".to_string();
        }
        if seg == "xboxgames" {
            if let Some(game) = comps.get(i + 1) {
                return format!("Xbox: {}", game);
            }
            return "Xbox Games".to_string();
        }
        if seg == "riot games" {
            if let Some(game) = comps.get(i + 1) {
                return format!("Riot: {}", game);
            }
            return "Riot Games".to_string();
        }
        if seg == "gog games" {
            if let Some(game) = comps.get(i + 1) {
                return format!("GOG: {}", game);
            }
            return "GOG Games".to_string();
        }
        if seg == "ea games" || seg == "origin games" {
            if let Some(game) = comps.get(i + 1) {
                return format!("EA: {}", game);
            }
            return "EA Games".to_string();
        }
        if seg == "my games" {
            if let Some(game) = comps.get(i + 1) {
                return format!("Oyun Verisi: {}", game);
            }
        }
    }

    // Standard Windows roots
    let first = lower[0].as_str();
    if first == "program files" || first == "program files (x86)" {
        if let Some(app) = comps.get(1) {
            return app.clone();
        }
    }
    if first == "windows" {
        if let Some(sub) = comps.get(1) {
            return format!("Windows\\{}", sub);
        }
        return "Windows".to_string();
    }
    if first == "programdata" {
        if let Some(app) = comps.get(1) {
            return format!("ProgramData: {}", app);
        }
    }
    if first == "users" && comps.len() >= 3 {
        let third_l = lower[2].as_str();
        if third_l == "appdata" && comps.len() >= 5 {
            return format!("AppData: {}", comps[4]);
        }
        return comps[2].clone();
    }

    if comps.len() >= 2 {
        format!("{}\\{}", comps[0], comps[1])
    } else {
        comps[0].clone()
    }
}

fn classify_file(path: &Path, ext_lower: &str) -> &'static str {
    let path_lower = path.to_string_lossy().to_ascii_lowercase();

    // Path-aware game libraries
    if path_lower.contains("\\steamapps\\common\\")
        || path_lower.contains("\\steamapps\\workshop\\")
        || path_lower.contains("\\epic games\\")
        || path_lower.contains("\\xboxgames\\")
        || path_lower.contains("\\riot games\\")
        || path_lower.contains("\\gog games\\")
        || path_lower.contains("\\ea games\\")
        || path_lower.contains("\\origin games\\")
        || path_lower.contains("\\ubisoft\\")
        || path_lower.contains("\\my games\\")
        || path_lower.contains("\\battle.net\\")
        || path_lower.contains("\\curseforge\\")
    {
        return "game";
    }

    // Path-aware dev folders
    if path_lower.contains("\\node_modules\\")
        || path_lower.contains("\\.git\\")
        || path_lower.contains("\\target\\debug\\")
        || path_lower.contains("\\target\\release\\")
        || path_lower.contains("\\.venv\\")
        || path_lower.contains("\\__pycache__\\")
        || path_lower.contains("\\.cargo\\")
    {
        return "code";
    }

    // Path-aware 3D/CAD libraries
    if path_lower.contains("\\3dshapes\\") {
        return "cad";
    }

    match ext_lower {
        "vpk" | "pak" | "dlc" | "shapes" | "grle" | "i3d" | "dds" | "uasset" | "umap" | "upk"
        | "ucas" | "utoc" | "unity3d" | "assets" | "ress" | "rpf" | "bsa" | "ba2" | "esm"
        | "esp" | "wad" | "bik" | "bk2" | "bnk" | "pck" | "forge" | "cas" | "sb" | "toc"
        | "sav" | "gdm" | "scs" | "big" | "mix" | "mpq" | "vdf" | "gcf" | "ncf" | "bsp"
        | "mdl" | "vtf" | "vmt" | "nav" | "dem" => "game",

        "step" | "stp" | "stl" | "obj" | "fbx" | "blend" | "blend1" | "glb" | "gltf" | "iges"
        | "igs" | "dwg" | "dxf" | "3mf" | "skp" | "max" | "c4d" | "ma" | "mb" | "dae" | "ply"
        | "kicad_pcb" | "kicad_sch" | "kicad_mod" | "kicad_pro" | "kicad_sym" | "sch" | "brd"
        | "gbr" | "wrl" | "sldprt" | "sldasm" | "f3d" | "fcstd" | "ipt" | "iam" => "cad",

        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "mpg" | "mpeg" | "ts"
        | "3gp" => "video",

        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "ico" | "tif" | "tiff"
        | "psd" | "ai" | "heic" | "heif" | "raw" | "cr2" | "nef" | "dng" | "avif" => "image",

        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "wma" | "opus" | "aiff" | "mid" => {
            "audio"
        }

        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "rtf" | "odt"
        | "ods" | "odp" | "csv" | "epub" | "mobi" | "tex" | "pages" => "document",

        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "zst" | "iso" | "img" | "exe"
        | "msi" | "msix" | "appx" | "cab" | "dmg" | "pkg" | "deb" | "rpm" => "archive",

        "rs" | "js" | "jsx" | "mjs" | "cjs" | "py" | "java" | "c" | "cpp" | "cc" | "h" | "hpp"
        | "cs" | "go" | "rb" | "php" | "swift" | "kt" | "scala" | "html" | "css" | "scss"
        | "sass" | "less" | "json" | "yaml" | "yml" | "toml" | "xml" | "sql" | "sh" | "ps1"
        | "bat" | "cmd" | "vue" | "svelte" | "tsx" | "wasm" | "lock" | "map" | "rlib" | "pdb"
        | "o" | "a" | "lib" | "pyc" | "class" | "jar" | "whl" | "nupkg" => "code",

        "dll" | "sys" | "drv" | "ocx" | "cpl" | "log" | "tmp" | "temp" | "cache" | "bak"
        | "old" | "dmp" | "evtx" | "etl" | "mui" | "cat" | "inf" | "pnf" | "vhd" | "vhdx"
        | "vmdk" | "vdi" | "wim" | "esd" | "swm" | "dat" | "regtrans-ms" | "blf" => "system",

        _ => "other",
    }
}

#[derive(Eq, PartialEq)]
struct SizedFile {
    bytes: u64,
    path: String,
    name: String,
    category: &'static str,
    source: String,
}

impl Ord for SizedFile {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.bytes.cmp(&other.bytes)
    }
}

impl PartialOrd for SizedFile {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

/// Computes ancestor folder keys up to max_depth relative to the drive root.
fn collect_folder_ancestors(root: &Path, file_path: &Path, max_depth: usize) -> Vec<(String, String, usize)> {
    let mut out = Vec::with_capacity(max_depth);
    let Ok(rel) = file_path.strip_prefix(root) else {
        return out;
    };
    let Some(parent) = rel.parent() else {
        return out;
    };

    let mut current = PathBuf::from(root);
    let mut depth = 0usize;
    for comp in parent.components() {
        if let Component::Normal(seg) = comp {
            depth += 1;
            if depth > max_depth {
                break;
            }
            current.push(seg);
            let name = seg.to_string_lossy().to_string();
            let full = current.to_string_lossy().to_string();
            out.push((full, name, depth));
        }
    }
    out
}

pub fn scan_drive<F>(drive: &str, mut on_progress: F) -> Result<SnapshotDetail, String>
where
    F: FnMut(ScanProgress),
{
    let start = Instant::now();
    let root = PathBuf::from(drive);
    if !root.exists() {
        return Err(format!("Sürücü bulunamadı: {}", drive));
    }

    // Grab OS-level drive totals
    let drives = list_drives();
    let drive_info = drives
        .iter()
        .find(|d| d.mount_point.eq_ignore_ascii_case(drive))
        .cloned()
        .unwrap_or(DriveInfo {
            mount_point: drive.to_string(),
            name: String::new(),
            file_system: String::new(),
            total_bytes: 0,
            available_bytes: 0,
            used_bytes: 0,
            usage_percent: 0.0,
        });

    let mut cat_bytes: HashMap<&'static str, (u64, u64)> = HashMap::new();
    let mut cat_exts: HashMap<&'static str, HashMap<String, (u64, u64)>> = HashMap::new();
    let mut ext_sources: HashMap<(&'static str, String), HashMap<String, u64>> = HashMap::new();
    let mut folder_map: HashMap<String, (String, usize, u64, u64)> = HashMap::new();
    let mut top_files_heap: BinaryHeap<Reverse<SizedFile>> = BinaryHeap::with_capacity(64);
    const MAX_TOP_FILES: usize = 60;

    let mut scanned_bytes: u64 = 0;
    let mut file_count: u64 = 0;
    let mut last_emit = Instant::now();

    on_progress(ScanProgress {
        drive: drive.to_string(),
        files_scanned: 0,
        bytes_scanned: 0,
        current_path: drive.to_string(),
        active: true,
    });

    let walker = WalkDir::new(&root)
        .follow_links(false)
        .skip_hidden(false);

    for entry_res in walker {
        let Ok(entry) = entry_res else {
            continue;
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        let size = meta.len();
        let path = entry.path();

        file_count += 1;
        scanned_bytes = scanned_bytes.saturating_add(size);

        let ext_lower = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_else(|| "uzantısız".to_string());

        let cat = classify_file(&path, &ext_lower);
        let c_entry = cat_bytes.entry(cat).or_insert((0, 0));
        c_entry.0 = c_entry.0.saturating_add(size);
        c_entry.1 += 1;

        let ext_key = if ext_lower == "uzantısız" {
            "(yok)".to_string()
        } else {
            format!(".{}", ext_lower)
        };
        let ext_entry = cat_exts
            .entry(cat)
            .or_default()
            .entry(ext_key.clone())
            .or_insert((0, 0));
        ext_entry.0 = ext_entry.0.saturating_add(size);
        ext_entry.1 += 1;

        if size >= 65_536 {
            let source = detect_source_label(&path);
            let s_entry = ext_sources
                .entry((cat, ext_key))
                .or_default()
                .entry(source)
                .or_insert(0);
            *s_entry = s_entry.saturating_add(size);
        }

        // Track folder sizes up to depth 3
        for (folder_path, folder_name, depth) in collect_folder_ancestors(&root, &path, 3) {
            let f_entry = folder_map
                .entry(folder_path)
                .or_insert((folder_name, depth, 0, 0));
            f_entry.2 = f_entry.2.saturating_add(size);
            f_entry.3 += 1;
        }

        // Maintain top N largest files
        if size >= 1_048_576 {
            let should_push = top_files_heap.len() < MAX_TOP_FILES
                || top_files_heap
                    .peek()
                    .map(|min_item| size > min_item.0.bytes)
                    .unwrap_or(true);
            if should_push {
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let full_path = path.to_string_lossy().to_string();
                let source = detect_source_label(&path);
                top_files_heap.push(Reverse(SizedFile {
                    bytes: size,
                    path: full_path,
                    name,
                    category: cat,
                    source,
                }));
                if top_files_heap.len() > MAX_TOP_FILES {
                    top_files_heap.pop();
                }
            }
        }

        if last_emit.elapsed() >= Duration::from_millis(220) {
            last_emit = Instant::now();
            on_progress(ScanProgress {
                drive: drive.to_string(),
                files_scanned: file_count,
                bytes_scanned: scanned_bytes,
                current_path: path.to_string_lossy().to_string(),
                active: true,
            });
        }
    }

    // Build sorted categories
    let mut categories: Vec<CategoryStat> = CATEGORY_ORDER
        .iter()
        .map(|(id, label)| {
            let (bytes, count) = cat_bytes.get(id).copied().unwrap_or((0, 0));
            let mut exts: Vec<ExtensionStat> = cat_exts
                .remove(id)
                .unwrap_or_default()
                .into_iter()
                .map(|(ext, (b, c))| {
                    let mut src_list: Vec<(String, u64)> = ext_sources
                        .remove(&(*id, ext.clone()))
                        .unwrap_or_default()
                        .into_iter()
                        .collect();
                    src_list.sort_by(|a, b| b.1.cmp(&a.1));
                    let top_sources: Vec<String> = src_list
                        .into_iter()
                        .take(2)
                        .map(|(name, _)| name)
                        .collect();

                    ExtensionStat {
                        ext,
                        bytes: b,
                        file_count: c,
                        top_sources,
                    }
                })
                .collect();
            exts.sort_by(|a, b| b.bytes.cmp(&a.bytes));
            exts.truncate(10);

            CategoryStat {
                id: (*id).to_string(),
                label: (*label).to_string(),
                bytes,
                file_count: count,
                top_extensions: exts,
            }
        })
        .collect();
    categories.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    // Build top folders (keep top 180 by size so delta comparison stays rich)
    let mut folders: Vec<FolderStat> = folder_map
        .into_iter()
        .map(|(path, (name, depth, bytes, fcount))| FolderStat {
            path,
            name,
            depth,
            bytes,
            file_count: fcount,
        })
        .collect();
    folders.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    folders.truncate(180);

    // Build top files sorted descending
    let mut top_files: Vec<FileStat> = top_files_heap
        .into_iter()
        .map(|Reverse(f)| FileStat {
            path: f.path,
            name: f.name,
            bytes: f.bytes,
            category: f.category.to_string(),
            source: f.source,
        })
        .collect();
    top_files.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    let now = Utc::now();
    let timestamp = now.timestamp_millis();
    let drive_slug: String = drive
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    let id = format!("{}_{}", drive_slug.to_lowercase(), timestamp);
    let duration_ms = start.elapsed().as_millis() as u64;

    on_progress(ScanProgress {
        drive: drive.to_string(),
        files_scanned: file_count,
        bytes_scanned: scanned_bytes,
        current_path: String::new(),
        active: false,
    });

    let summary = SnapshotSummary {
        id,
        timestamp,
        drive: drive.to_string(),
        total_bytes: drive_info.total_bytes,
        used_bytes: drive_info.used_bytes,
        available_bytes: drive_info.available_bytes,
        scanned_bytes,
        file_count,
        duration_ms,
        categories,
    };

    Ok(SnapshotDetail {
        summary,
        folders,
        top_files,
    })
}

pub fn list_files_by_filter(
    drive: &str,
    category: Option<&str>,
    extension: Option<&str>,
    limit: usize,
) -> Result<FilteredFilesResult, String> {
    let root = PathBuf::from(drive);
    if !root.exists() {
        return Err(format!("Sürücü bulunamadı: {}", drive));
    }

    let max_files = limit.clamp(20, 500);
    let target_ext = extension.map(|e| e.to_ascii_lowercase());
    let target_cat = category.map(|c| c.to_ascii_lowercase());

    let mut total_bytes: u64 = 0;
    let mut total_count: u64 = 0;
    let mut source_map: HashMap<String, (u64, u64, String)> = HashMap::new();
    let mut heap: BinaryHeap<Reverse<SizedFile>> = BinaryHeap::with_capacity(max_files + 1);

    let walker = WalkDir::new(&root)
        .follow_links(false)
        .skip_hidden(false);

    for entry_res in walker {
        let Ok(entry) = entry_res else {
            continue;
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext_lower = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_else(|| "uzantısız".to_string());

        let ext_key = if ext_lower == "uzantısız" {
            "(yok)".to_string()
        } else {
            format!(".{}", ext_lower)
        };

        if let Some(ref want_ext) = target_ext {
            if ext_key != *want_ext {
                continue;
            }
        }

        let cat = classify_file(&path, &ext_lower);
        if target_ext.is_none() {
            if let Some(ref want_cat) = target_cat {
                if cat != want_cat.as_str() {
                    continue;
                }
            }
        }

        let Ok(meta) = entry.metadata() else {
            continue;
        };
        let size = meta.len();

        total_bytes = total_bytes.saturating_add(size);
        total_count += 1;

        let source = detect_source_label(&path);
        let parent_str = path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| drive.to_string());

        let s_entry = source_map
            .entry(source.clone())
            .or_insert_with(|| (0, 0, parent_str.clone()));
        s_entry.0 = s_entry.0.saturating_add(size);
        s_entry.1 += 1;

        let should_push = heap.len() < max_files
            || heap
                .peek()
                .map(|min_item| size > min_item.0.bytes)
                .unwrap_or(true);
        if should_push {
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let full_path = path.to_string_lossy().to_string();
            heap.push(Reverse(SizedFile {
                bytes: size,
                path: full_path,
                name,
                category: cat,
                source,
            }));
            if heap.len() > max_files {
                heap.pop();
            }
        }
    }

    let mut sources: Vec<SourceGroupStat> = source_map
        .into_iter()
        .map(|(source, (bytes, file_count, sample_folder))| SourceGroupStat {
            source,
            bytes,
            file_count,
            sample_folder,
        })
        .collect();
    sources.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    sources.truncate(15);

    let mut files: Vec<FileStat> = heap
        .into_iter()
        .map(|Reverse(f)| FileStat {
            path: f.path,
            name: f.name,
            bytes: f.bytes,
            category: f.category.to_string(),
            source: f.source,
        })
        .collect();
    files.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    Ok(FilteredFilesResult {
        drive: drive.to_string(),
        category: category.map(|s| s.to_string()),
        extension: extension.map(|s| s.to_string()),
        total_bytes,
        total_count,
        sources,
        files,
    })
}
