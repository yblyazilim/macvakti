# Veri Kaynakları — Doğrulanmış Bulgular

**Test tarihi:** 23.08.2026 · Hepsi canlı istekle teyit edildi, varsayım yok.
**Karar:** Tüm branşlar ücretsiz resmi federasyon kaynaklarından toplanacak. API-Sports kullanılmayacak (yedek olarak dursun).

---

## ÖZET TABLO

| Branş | Kaynak | Yöntem | Sağlamlık | Yayın kanalı |
|---|---|---|---|---|
| **Futbol** | `tff.org` | HTML metin ayrıştırma | Orta-iyi | ❌ yok → kural motoru |
| **Basketbol** | `tbf.org.tr/api/Match/*` | **Resmi JSON API** | Çok iyi | ✅ `broadcastChannel` |
| **Hentbol** | `api.thf.org.tr/api/v1/Public/*` | **Resmi JSON API** | Çok iyi | ✅ `liveBroadcast` |
| **Voleybol** | `tvf.org.tr` (Laravel/Livewire) | HTML ayrıştırma + sezon Excel'i | Orta | ⚠️ sezon başlamadı, test edilemedi |

**Kritik doğrulama:** TFF yurt dışı sunuculara açık (yurt dışı bir sunucu üzerinden 90 KB veri çekildi).
→ Toplayıcı GitHub Actions'ta ücretsiz çalışabilir. Ücretsiz planın önündeki en büyük engel yok.

---

## 1) FUTBOL — TFF

**Adres:** `https://www.tff.org/Default.aspx?pageID=198` (dikkat: `tff.org`, `tff.org.tr` DEĞİL)

Veri sunucu tarafında basılıyor, JavaScript gerektirmiyor. Sayfada **88 iç içe tablo** var — bu yüzden HTML yapısına dayalı ayrıştırıcılar kırılıyor (`slaweally/superlig-api` reposu tam bu sebeple `fixtures: []` dönüyor).

**Çalışan yöntem — metin tabanlı, yapıdan bağımsız:**
```js
const txt = document.body.innerText.replace(/ /g,' ');
const re = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})\s+([^\n]+?)\s+(\d+\s*-\s*\d+|-)\s+([^\n]+?)\s+Detaylar/g;
```
**Test sonucu: 9/9 maç eksiksiz çıktı** (2026-2027, 2. Hafta) — tarih, saat, ev sahibi, deplasman, skor.
Skor `-` ise maç oynanmamış demek.

**Avantajı:** Sayfa tasarımı değişse bile metin düzeni aynı kaldığı sürece çalışır. HTML yapısına bağımlı değil.

**Kapsam:** Süper Lig, 1./2./3. Lig, Kadın Ligleri, Kupalar — hepsi aynı sayfa deseniyle, farklı `pageID` ile.
**Hafta gezinme:** Sayfadaki hafta bağlantıları üzerinden; tüm sezon taranabilir.
**Eksik:** Yayın kanalı, kadro.

---

## 2) BASKETBOL — TBF (resmi JSON API)

Site Nuxt (Vue) tabanlı; arkasında açık JSON servisi var. **HTML kazımaya gerek yok.**

```
GET https://www.tbf.org.tr/api/Match/get-daily-matches?MatchDate=2026-08-23T00:00:00.000Z
GET https://www.tbf.org.tr/api/Match/tarih-mac-sayisi?StartDate=...&EndDate=...
```

`tarih-mac-sayisi` bir tarih aralığındaki maç sayılarını verir → hangi günleri sorgulayacağımızı bulup **boş günlere istek atmadan** verimli tarama yapılır.

**Dönen alanlar (doğrulandı):**
`matchId`, `activityName` (lig/turnuva adı), `season`, `matchDate`, `matchTime`, `week`,
`venueName` (salon), `homeTeam{id,name,score}`, `awayTeam{...}`, `matchStatus` ("Oynandı"),
`matchCode`, **`broadcastChannel`**, `youtubeLink`, `cinsiyet`

Maçlar `groupName` altında gruplu geliyor (ör. "Milli Maçlar", lig adları).

> `broadcastChannel` test anında boştu — çünkü örnek maç bir milli hazırlık maçıydı. Alan mevcut; lig sezonu başlayınca dolduğu doğrulanmalı.

---

## 3) HENTBOL — THF (resmi JSON API)

```
GET https://api.thf.org.tr/api/v1/Public/GetMatchesFromYesterdayAndNextSixDays
GET https://api.thf.org.tr/api/v1/Public/GetAllTopMenus
```
Yanıt: `{data:[...], success, message, statusCode}` — 15 maç, 84 KB.

**Alanlar (doğrulandı):**
`id`, `leagueId`, `league`, `weekId`, `week`, `seasonId`, `season`,
`homeTeamName`, `awayTeamName`, `homeTeamCurrentScore`, `awayTeamCurrentScore`,
`matchDate`, `matchTime`, `sportsHall` (salon), `matchStatus`, `liveMinute`,
hakemler (`fieldRefereeOne/Two`, `tableReferee...`, `refereeObserver`),
**`liveBroadcast`, `isLiveBroadcast`, `liveBroadcastLink`, `liveLogo`**

En zengin kaynak: canlı dakika, hakem, salon ve yayın bilgisi bir arada.
Adı `Public` olan bir uç — halka açık kullanım için tasarlanmış.

---

## 4) VOLEYBOL — TVF

Laravel + Livewire, sunucu taraflı render → veri HTML'de geliyor, JS gerekmiyor.

- Lig fikstür sayfaları: `tvf.org.tr/lig-fikstur/{lig-slug}`
  (`efeler-ligi`, `sultanlar-ligi`, `erkekler-1-ligi`, `kadinlar-1-ligi`)
- **Sezon geneli Excel:** `tvf.org.tr/_dosyalar/Lig_Sezon_Arsivi/Genel_Fiksturler/2026-2027_genel_fikstur.xlsx`

**Durum:** Test anında (23.08.2026) sayfa "Bu lig için yayınlanmış maç bulunmamaktadır — fikstür güncellendiğinde karşılaşmalar burada görünecek" diyor. Voleybol sezonu henüz başlamamış (normalde Ekim). Ayrıştırıcı sezon açılınca yazılacak; Excel dosyası şimdiden sezon iskeletini verebilir.

---

## 5) YAYIN KANALI STRATEJİSİ (güncellendi)

Araştırma öncesi varsayım "hiçbir kaynakta kanal yok" idi. **Yanlış çıktı:**

- **Basketbol:** `broadcastChannel` alanı resmi API'de var
- **Hentbol:** `liveBroadcast` + `isLiveBroadcast` resmi API'de var
- **Futbol:** yok → kural motoru + admin paneli gerekli
- **Voleybol:** bilinmiyor (sezon bekleniyor)

**Yaklaşım:** Kaynakta kanal varsa onu kullan; yoksa kural motoruna düş; o da bilmiyorsa admin panelinden elle gir. Üç katmanlı, her maç için `channelSource` alanında hangi katmandan geldiği tutulur.

---

## 6) TELİF DEĞERLENDİRMESİ

Kaynakların hepsi **resmi federasyon** — ticari veri satıcısı değil. Alınan şey maç tarihi, saati, takım adı, salon gibi **olgusal bilgi**; bunlar telif korumasına konu olmaz. Federasyon sitelerinden hiçbir metin, haber, fotoğraf veya logo alınmıyor.

**Değişmeyen kurallar:**
1. Kulüp ve federasyon **logoları kullanılmayacak** — API'lerin `logoUrl` / `liveLogo` alanları kodda hiç okunmayacak
2. Kaynak site adı uygulamada hiçbir yerde geçmeyecek
3. Tüm metinler şablondan üretilecek, hiçbir cümle kopyalanmayacak
4. İstekler makul aralıklarla ve `User-Agent` belirtilerek yapılacak (sunucuyu yormadan)

---

## 7) SONRAKİ ADIMLAR

- [ ] Futbol ayrıştırıcısı (Node) — TFF, tüm ligler + hafta gezinme
- [ ] Basketbol toplayıcısı — TBF JSON, `tarih-mac-sayisi` ile verimli tarama
- [ ] Hentbol toplayıcısı — THF JSON
- [ ] Voleybol — sezon açılınca; Excel'den iskelet çıkarılabilir
- [ ] Ortak "veri sağlayıcı" katmanı — her branş aynı biçime dönüştürülür
- [ ] Kanal kural motoru (futbol için)
- [ ] Yedek plan: kaynak kırılırsa API-Sports'a düşen adaptör (kod hazır dursun)
