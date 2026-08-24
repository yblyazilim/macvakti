# Maç Vakti — Mimari ve Teknik Plan

**Paket adı:** `com.berk.macvakti` (Play Console'da bir kere yazılır, asla değişmez)
**Görünen ad:** Maç Vakti (Play'de sonradan değiştirilebilir)
**Geliştirici hesabı:** yblyazilim (`/console/u/2/`)
**Hedef:** Türkiye spor kulüplerinin maçlarını (tüm branşlar) fikstür/saat/kanal/kadro olarak takip edip, değişiklik ve maç öncesi bildirim göndermek.

---

## 1) TEMEL KARARLAR (kilitlendi)

| Konu | Karar | Gerekçe |
|---|---|---|
| Veri kaynağı | **API-Sports** (api-sports.io) | Tek abonelik 12 branş; lisanslı, telif riski yok; scraping'e göre kırılmaz |
| Plan | Free ile geliştir → **Pro $19/ay** ile yayına çık | Free sadece 2022-2024 sezonu veriyor; canlı sezon Pro gerektiriyor |
| İstemci | **Capacitor 6 + HTML/CSS/vanilla JS** | Mevcut build akışı (RELEASE_AUTO.bat) hazır |
| Veritabanı | **Firebase Realtime Database** (REST, SDK'sız) | Ücretsiz katman yeterli, mevcut deneyim var |
| Otomasyon | **GitHub Actions cron** (Firebase Functions DEĞİL) | Blaze planı gerekmiyor → sunucu maliyeti **0 TL** |
| Bildirim | **Firebase Cloud Messaging — topic tabanlı** | Kullanıcı başına kayıt tutmadan sınırsız ölçeklenir, ücretsiz |
| Gelir | AdMob + Premium abonelik | minSdk 23 (Billing 9.0 şartı) |

---

## 2) DOĞRULANMIŞ VERİ KAPSAMI (canlı test edildi, 23.08.2026)

Aşağıdakiler API-Sports'tan gerçek istekle teyit edildi:

**Futbol** (11 lig) — Süper Lig, 1. Lig, 2. Lig, 3. Lig (4 grup + play-off), Türkiye Kupası, Süper Kupa, U19 Ligi
**Basketbol** (11 lig) — Süper Ligi, TBL, TB2L, TKBL (Kadınlar), Türkiye Kupası (E/K), Federasyon Kupası (E/K), Süper Kupa (E/K)
**Voleybol** (8 lig) — Efeler Ligi, Sultanlar Ligi (K), 1. Lig (E/K), Türkiye Kupası (E/K), Süper Kupa (E/K)
**Hentbol** (2 lig) — Süperlig (E/K)

Ayrıca kullanılabilir: Hokey, Rugby, Formula-1, MMA, NBA, NFL, Beyzbol, AFL (v2+ için).

**Maç başına gelen alanlar (doğrulandı):**
- `fixture.id`, `fixture.date` (UTC ISO-8601), `fixture.timestamp`
- `fixture.status.short` (NS / 1H / HT / 2H / FT / PST / CANC …) + `elapsed`
- `fixture.venue.name`, `.city` — stadyum
- `fixture.referee` — hakem
- `league.id`, `.name`, `.season`, `.round`
- `teams.home.name` / `teams.away.name` + `id`
- **Kadrolar** (`/fixtures/lineups`): ilk 11 + isim + mevki, formasyon (ör. "4-1-4-1"), teknik direktör

**GELMEYEN tek şey: yayın kanalı.** Çözümü Bölüm 5'te.

---

## 3) SİSTEM MİMARİSİ

```
   API-SPORTS (lisanslı veri)
            |
            v
   GITHUB ACTIONS (cron worker)          <-- ücretsiz, sunucusuz
   +--------------------------------+
   | 1. Fikstür senkronu            |
   | 2. Değişiklik tespiti (diff)   |
   | 3. Kanal motoru (kural tabanlı)|
   | 4. Özgün metin üretici         |
   | 5. Bildirim tetikleyici        |
   +--------------------------------+
            |                    |
            v                    v
   FIREBASE RTDB           FCM (topic push)
   (okuma: herkese açık)          |
            |                     |
            +----------+----------+
                       v
              MAÇ VAKTİ (Capacitor app)
```

**Neden Cloud Functions değil?** Firebase Functions, Blaze (kredi kartı bağlı) planı ister. GitHub Actions cron ile aynı işi 0 TL'ye yapıyoruz ve kullanıcının zaten `yblyazilim` GitHub hesabı var.

---

## 4) CRON TAKVİMİ (GitHub Actions)

| İş | Sıklık | Ne yapar | Günlük istek |
|---|---|---|---|
| `sync-fixtures` | Günde 2× (06:00, 18:00 TR) | Tüm branşların 14 günlük fikstürünü çeker, RTDB'ye yazar | ~50 |
| `watch-changes` | 30 dk'da bir | Saat/tarih/durum değişikliği var mı diye bakar → değişiklik varsa **anında bildirim** | ~100 |
| `lineups` | 15 dk'da bir (sadece maç günü, T-90dk pencerede) | Açıklanan kadroları çeker → "Kadrolar belli oldu" bildirimi | ~60 |
| `pre-match` | 5 dk'da bir | T-60 dk / T-15 dk hatırlatma bildirimleri (istek yok, RTDB'den okur) | 0 |

**Toplam: ~210 istek/gün.** Pro planın 7.500/gün limitinin %3'ü. Rahat rahat sığıyor, büyüme payı çok.

---

## 5) YAYIN KANALI MOTORU (API'de olmayan veri)

Türkiye'de yayın hakları lig bazında sözleşmelidir ve sezon boyunca sabittir. Bu yüzden **kural tabanlı atama** maçların büyük çoğunluğunu otomatik doğru etiketler:

```
kanalKurallari = {
  "futbol/203": ["beIN Sports 1", "beIN Sports 2", ...],   // Süper Lig
  "futbol/204": [...],                                      // 1. Lig
  "basketbol/XX": [...],                                    // BSL
  ...
}
```

Kalan istisnalar (derbi başka kanala alınır, TRT açık yayını, kupa maçı vs.) için **admin panelinden** tek tıkla düzeltme. Panel basit bir HTML sayfası, RTDB'ye yazar, uygulamaya anında yansır.

**Kanal adı telif mi?** Hayır — kanal adı bir olgu bildirimidir ("X maçı Y kanalında"), marka logosu kullanmadığımız sürece sorun yok. **Logo kullanılmayacak.**

---

## 6) ÖZGÜN İÇERİK ÜRETİMİ (telif güvenliği)

Hiçbir haber metni kopyalanmaz. Sistem **yapısal veriden şablonla kendi cümlesini kurar**:

```
"{ev} ile {deplasman}, {tarih} {saat}'de {stadyum}'da karşılaşıyor.
 Mücadele {kanal} ekranlarından izlenebilecek."
```

Her bildirim tipi için 4-6 farklı şablon varyantı tutulur, rastgele seçilir → metinler tekdüze görünmez.

**Telif kuralları (istisnasız):**
1. Kulüp **logosu / arması kullanılmayacak** — ne arayüzde, ne bildirimde, ne Play görselinde
2. Kanal **logosu kullanılmayacak** — sadece kanal adı yazı olarak
3. Başka sitenin metni **hiç alınmayacak** — her cümle şablondan üretilir
4. Kaynak site adı, marka adı **hiçbir yerde geçmeyecek**
5. Kulüp adları kullanılabilir (olgusal bilgi, ticari marka ihlali değil)
6. Oyuncu **fotoğrafı kullanılmayacak** — sadece isim
7. API'den gelen `logo` alanları **kodda hiç okunmayacak**

**Logo yerine ne?** Her kulüp için renk paletinden üretilen, kulübün baş harflerini taşıyan tipografik rozet (ör. koyu bordo zeminde "TS"). Tamamen bizim ürettiğimiz, telifsiz, tutarlı görsel dil.

---

## 7) BİLDİRİM SİSTEMİ

**Topic yapısı (FCM):**
```
brans_futbol            <- branşı takip eden herkes
brans_basketbol
takim_998               <- Trabzonspor'u takip edenler (API takım id'si)
lig_203                 <- Süper Lig'i takip edenler
```

Kullanıcı ayarlardan seçtiği branş/lig/takıma abone olur; uygulama ilgili topic'lere `subscribeToTopic` yapar. Sunucu sadece topic'e mesaj atar — kullanıcı listesi tutmaya gerek yok, sınırsız ölçeklenir.

**Bildirim tipleri:**

| Tip | Ne zaman | Örnek |
|---|---|---|
| Maç hatırlatma | T-60 dk ve T-15 dk (kullanıcı seçer) | "Trabzonspor – Antalyaspor 1 saat sonra. beIN Sports 1" |
| Kadro açıklandı | Kadro API'ye düşünce (~T-60 dk) | "İlk 11'ler belli oldu: Trabzonspor 4-1-4-1" |
| **Saat değişikliği** | Diff tespit edilince, anında | "Maç saati değişti: 20:00 → 21:30" |
| **Kanal değişikliği** | Diff tespit edilince, anında | "Yayın kanalı güncellendi: TRT Spor" |
| Erteleme/iptal | Status PST/CANC olunca | "Maç ertelendi" |
| Maç sonucu | FT olunca (opsiyonel) | "Bitti: Trabzonspor 2-1 Antalyaspor" |

**Sessiz saat:** 00:00–08:00 arası kritik olmayan bildirimler ertelenir (kullanıcı kapatabilir).

---

## 8) VERİ MODELİ (Firebase RTDB)

```
/matches/{sport}/{fixtureId}
    sport, leagueId, leagueName, round, season
    dateUtc, timestamp, status            // NS/FT/PST...
    homeId, homeName, awayId, awayName
    venue, city, referee
    channels: ["beIN Sports 1"]           // kural motoru + admin
    channelSource: "rule" | "manual"
    lineupsReady: true|false
    lineups: { home:{formation,coach,xi:[...]}, away:{...} }
    score: { home, away }
    updatedAt
    _hash                                 // diff tespiti için

/leagues/{sport}/{leagueId}   -> ad, ülke, aktif sezon, takip sayısı
/teams/{sport}/{teamId}       -> ad, kısaAd, rozetRenk, rozetHarf
/config/
    minVer                    // zorunlu güncelleme (rehberdeki desen)
    channelRules              // kanal kuralları
    activeSeasons             // {futbol:2026, basketbol:2026...}
/news/{id}                    // üretilen özgün metinler
```

**Güvenlik kuralları:** okuma herkese açık (`.read: true`), yazma **kapalı** (`.write: false`). Yazma yalnızca GitHub Actions'ın Firebase secret'ı ile yapılır. (TapLegends'te kurallar açıktı — burada baştan kapatıyoruz.)

---

## 9) İSTEMCİ (uygulama) YAPISI

```
MacVakti/
  www/
    index.html          <- ana uygulama (tek dosya, global scope, let G)
    fcm.js              <- bildirim aboneliği
    admob.js            <- reklam
    iap.js              <- premium abonelik
    lang.js             <- i18n (v1: TR, sonra EN+)
    assets/             <- kendi ürettiğimiz ikonlar (logo YOK)
  android/
  capacitor.config.json
  fix-manifest.js  fix-release.js  RELEASE_AUTO.bat
```

**Ekranlar:**
1. **Bugün** — bugünün maçları, saate göre sıralı, canlı olanlar üstte
2. **Fikstür** — tarih seçici + branş/lig filtresi
3. **Takibim** — seçtiği takımların maçları
4. **Maç detayı** — saat, stadyum, hakem, kanal, kadrolar, skor
5. **Ayarlar** — branş/takım seçimi, bildirim tercihleri, sessiz saat, premium

---

## 10) GELİR MODELİ

**AdMob:** liste altında banner + maç detayında geçiş reklamı (agresif değil).
`app-ads.txt` → `yblyazilim.github.io` üzerinden yayınlanacak, Play'de "Web sitesi" alanı bu domaine ayarlanacak.

**Premium (Play Billing 9.0, minSdk 23):**
- Reklamsız
- Erken bildirim (T-3 saat)
- Sınırsız takım takibi (ücretsizde 3 takım)
- Kadro açıklanınca anında bildirim

---

## 11) YOL HARİTASI

**Aşama 1 — İskelet (şimdi)**
Capacitor projesi, RTDB şeması, sahte veriyle çalışan arayüz

**Aşama 2 — Veri motoru**
GitHub Actions worker, fikstür senkronu, diff tespiti, kanal kuralları
(Free planın 2023 sezonuyla test edilir)

**Aşama 3 — Bildirimler**
FCM entegrasyonu, topic abonelikleri, şablon metin üretici

**Aşama 4 — Cila**
İkon/rozet üretimi, gizlilik politikası, Play mağaza görselleri

**Aşama 5 — Yayın**
API-Sports Pro'ya geçiş → canlı sezon → AAB build → Play Console

**Aşama 6 — v1.1+**
Diğer branşlar derinleşir, i18n, App Store

---

## 12) YAPILACAKLAR — KULLANICI (Berk)

- [ ] **API-Sports Pro ($19/ay)** — yayın öncesi. Şimdilik gerekmez.
- [ ] **Firebase projesi** oluştur (`mac-vakti`), RTDB'yi europe-west1'de aç
- [ ] **GitHub reposu** aç (private olabilir), Actions secret'larını gir
- [ ] **AdMob** uygulaması oluştur, reklam birimi kimlikleri al
- [ ] **Keystore** üret (imzalama) — şifreler sende kalır
- [ ] **Play Console**'da uygulama oluştur (`com.berk.macvakti`)

> Bu adımların hepsi şifre/hesap işlemi olduğu için Berk yapar; ben her adımda ne yapılacağını tek tek söylerim.
