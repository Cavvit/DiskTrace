# DiskTrace

Windows için zaman çizelgesi ve değişim (delta) analizi odaklı, yerel çalışan masaüstü disk takip uygulaması.

Standart disk analiz araçları diskin yalnızca **o anki** durumunu gösterir; **DiskTrace** ise arka planda periyodik anlık görüntüler (*snapshot*) alarak diskinizin zaman içinde nasıl dolduğunu kaydeder ve iki tarih arasında hangi klasörlerin, dosya türlerinin veya büyük dosyaların büyüdüğünü doğrudan gösterir.

---

## Özellikler

### Zaman İçinde Disk Doluluğu & Zaman Gezgini
- Seçili sürücünün kullanım geçmişini etkileşimli SVG grafik üzerinde gösterir (**24S**, **7G**, **30G**, **Tümü** aralık filtreleri).
- **Zaman Gezgini** kaydırıcısı ve ileri/geri butonlarıyla geçmiş anlık görüntüler arasında gezinebilir, o tarihteki kategori ve klasör dağılımını inceleyebilirsiniz.
- Grafik üzerinde karşılaştırılan iki zaman noktası arası vurgulanır; noktaların üzerine gelindiğinde bir önceki kayda göre fark anında gösterilir.

### Değişim & Nedenler (Snapshot Karşılaştırması)
- İstediğiniz iki anlık görüntüyü karşılaştırarak net boyut değişimini (`+` / `-`) hesaplar.
- **Klasör Delta Analizi:** En fazla büyüyen veya küçülen klasörleri etki büyüklüğüne göre sıralar; **Seviye 1 / 2 / 3** derinlik filtresi ve **Sadece büyüyenler** seçeneği sunar.
- **Yeni veya Büyüyen Büyük Dosyalar:** İki tarama arasında eklenen ya da boyutu artan en büyük dosyaları listeler.
- Her klasör ve dosya tek tıkla Windows Dosya Gezgini'nde açılabilir (`/select`).

### Dosya Türüne Göre Dağılım & Kaynak Tespiti
- Dosyaları 10 kategoriye ayırır: **Oyun & Varlık**, **Video**, **Görsel**, **Ses**, **Belge**, **Arşiv & Kurulum**, **Kod & Geliştirme**, **3D & CAD**, **Sistem & Önbellek**, **Diğer**.
- **Yol Farkındalıklı Sınıflandırma & Kaynak Etiketleme:** Steam (`steamapps/common`, Workshop, Shader Cache), Epic Games, Xbox Games, Riot Games, GOG, EA/Origin, Ubisoft, Battle.net, geliştirme dizinleri (`node_modules`, `target`, `.venv`, `.git`) ve `Program Files` / `AppData` kaynaklarını otomatik tanır.
- Her kategorinin altında en çok yer kaplayan uzantıları ve baskın kaynaklarını gösterir; karşılaştırma aktifken kategori bazlı delta rozetleri ekler.

### Tür Detayı (Kategori / Uzantı Bazlı Toplu İnceleme)
- Sol panelde herhangi bir kategoriye veya uzantıya (ör. `.vpk`, `.pak`, `.mp4`) tıklayarak diskteki eşleşen dosyaları anlık tarar.
- Sonuçları **uygulama / oyun / klasör kaynağına** göre gruplar; kaynağa göre filtreleme ve dosya/yol araması yapabilirsiniz.

### Sistem Tepsisi & Otomatik Arka Plan Takibi
- Pencere kapatıldığında uygulama kapanmak yerine **sistem tepsisine** küçülür ve sessizce izlemeye devam eder.
- Tepsi menüsünden **DiskTrace'i Aç**, **Şimdi Tara** ve **Çıkış** işlemlerine doğrudan erişilir.
- **Tek örnek (`single-instance`)** korumasıyla ikinci kez açıldığında mevcut pencere öne getirilir.
- Ayarlardan otomatik tarama aralığı (**15 dk – 24 saat**), izlenecek sürücüler ve **Windows ile Otomatik Başlat** (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) yapılandırılabilir; eski anlık görüntüler yönetilip silinebilir.

### Hızlı, Hafif ve Tamamen Yerel
- Dosya sistemi taraması Rust tarafında `jwalk` ile paralel yürütülür; ilerleme arayüze canlı olarak aktarılır.
- İnternet bağlantısı veya harici veritabanı gerektirmez. Tüm veriler atomik yazım ile yerel olarak şu klasörde saklanır:
  ```text
  %LOCALAPPDATA%\DiskTrace\
  ├── index.json
  ├── settings.json
  └── snapshots\
      └── snap_<surucu>_<zaman_damgasi>.json
  ```

---

## Teknoloji Yığını

| Katman | Teknolojiler |
| --- | --- |
| Masaüstü Çerçevesi | [Tauri v2](https://v2.tauri.app/) (`tray-icon`, `tauri-plugin-single-instance`) |
| Backend (Rust) | `jwalk`, `sysinfo`, `tokio`, `serde`, `serde_json`, `chrono`, `dirs` |
| Frontend | React 19, TypeScript 5, Vite 6, Tailwind CSS v4, `lucide-react` |

---

## Proje Yapısı

```text
disk-trace/
├── src/
│   ├── App.tsx                       # Ana yerleşim, KPI şeridi, Tauri event ve komut bağlantıları
│   ├── types.ts                      # Veri modelleri, kategori renkleri ve biçimleyiciler
│   └── components/
│       ├── TimelineChart.tsx         # SVG disk doluluk grafiği ve Zaman Gezgini kaydırıcısı
│       ├── CategoryBreakdown.tsx     # Yığılmış dağılım çubuğu, kategoriler ve uzantı detayları
│       ├── DeltaExplorer.tsx         # Değişim/Nedenler, Klasörler, En Büyük Dosyalar ve Tür Detayı
│       └── SettingsModal.tsx         # Tarama aralığı, izlenen sürücüler, autostart ve kayıt yönetimi
└── src-tauri/
    ├── tauri.conf.json               # Pencere ve paketleme yapılandırması
    └── src/
        ├── lib.rs                    # Tauri komutları, sistem tepsisi, zamanlayıcı ve autostart
        ├── scanner.rs                # Paralel sürücü tarama, sınıflandırma, kaynak tespiti ve filtreleme
        ├── storage.rs                # Atomik JSON depolama ve snapshot delta karşılaştırma motoru
        └── models.rs                 # Serileştirilebilir veri yapıları
```

---

## Kurulum ve Geliştirme

### Gereksinimler
- **Windows 10 / 11** (WebView2 çalışma zamanı)
- **Node.js** 18+ ve `npm`
- **Rust** (stable toolchain) ve MSVC Build Tools

### Geliştirme Modunda Çalıştırma
```powershell
git clone https://github.com/Cavvit/DiskTrace.git
cd DiskTrace
npm install
npm run tauri dev
```

### Üretim Derlemesi (Installer / Executable)
```powershell
npm run tauri build
```
Derleme çıktıları `src-tauri/target/release/` ve `src-tauri/target/release/bundle/` klasörlerinde oluşturulur.

---

## Notlar
- Uygulama Windows için tasarlanmıştır (`explorer /select`, Windows Registry üzerinden autostart ve Windows sürücü yolları).
- Erişim izni olmayan sistem klasörleri tarama sırasında güvenle atlanır; toplam/kullanılan disk kapasitesi ise doğrudan işletim sistemi düzeyinden (`sysinfo`) alınır.
