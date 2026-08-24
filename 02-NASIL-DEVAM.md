# Maç Vakti — Durum ve Sonraki Adımlar

Güncelleme: 24.08.2026

---

## ŞU AN NE HAZIR

| Parça | Durum | Not |
|---|---|---|
| Veri toplama sistemi | ✅ Hazır | 4 branş, ortak biçim, 49/49 test geçiyor |
| Futbol (TFF) | ✅ Doğrulandı | Canlı sayfada 9/9 maç ayrıştırıldı |
| Basketbol (TBF) | ✅ Hazır | Resmi JSON API + yayın kanalı |
| Hentbol (THF) | ✅ Hazır | Resmi JSON API + yayın kanalı + hakem |
| Voleybol (TVF) | ⏳ Sezon bekliyor | Ayrıştırıcı hazır, lig Ekim'de başlıyor |
| Kanal motoru | ✅ Hazır | 3 katman: kaynak → kural → elle |
| Özgün metin üretici | ✅ Hazır | Şablon tabanlı, hiçbir metin kopyalanmıyor |
| Bildirim sistemi | ✅ Kod hazır | Firebase kurulunca çalışır |
| Otomasyon | ✅ Kod hazır | GitHub Actions, 30 dk'da bir |
| Uygulama arayüzü | ✅ Çalışıyor | 4 ekran, logo kullanmıyor |
| Android paketi | ✅ Derlendi | APK üretildi, 4.5 MB, doğrulandı |

**Maliyet: 0 TL.** Ne veri aboneliği ne sunucu ücreti var.

---

## SENİN YAPMAN GEREKENLER (sırayla)

### 1. Kurulum — ✅ TAMAMLANDI (24.08.2026)
`KURULUM.bat` çalıştırıldı: paketler kuruldu, Android platformu eklendi.
`DERLE.bat` ile ilk derleme yapıldı → **Masaüstü\MacVakti-test.apk** (4,5 MB).

Yapılan ayarlar:
- `minSdkVersion 23` (Play Billing 9.0 şartı)
- `compileSdk / targetSdk 36` (Play güncel API şartı)
- Bildirim izinleri eklendi (POST_NOTIFICATIONS, boot, ağ durumu)
- `local.properties` → SDK yolu
- `DERLE.bat` JDK'yı otomatik buluyor (Android Studio jbr / Java / Adoptium / Microsoft)

**Test için:** `MacVakti-test.apk` dosyasını telefonuna at ve kur
(Ayarlar'dan "bilinmeyen kaynaklara izin" gerekebilir). Bu bir hata ayıklama
sürümüdür; Play'e yüklenecek imzalı sürüm için keystore gerekir.

### 2. GitHub deposu — veri otomasyonu için
1. GitHub'da yeni depo aç: `macvakti` (**public** olsun — Actions dakikası sınırsız olur)
2. Bu klasörü depoya yükle
3. Depo ayarlarından **Actions > General > Workflow permissions** → "Read and write" seç
4. Actions sekmesinden **Veri Topla** akışını elle bir kez çalıştır ve sonucu gör

Bu adımdan sonra veri her 30 dakikada bir kendi kendine güncellenir.

### 3. GitHub Pages — veriyi uygulamaya servis etmek
1. Depo ayarları → **Pages** → kaynak: `main` dalı, kök klasör
2. Yayınlanan adresi al (ör. `https://yblyazilim.github.io/macvakti/`)
3. `www/index.html` içindeki `VERI_KAYNAGI.uzak` alanına
   `.../toplayici/veri/` adresini yaz

### 4. Firebase — bildirimler için
1. Firebase konsolunda yeni proje: `mac-vakti`
2. Android uygulaması ekle, paket adı: **com.berk.macvakti**
3. `google-services.json` dosyasını indir → `android/app/` klasörüne koy
4. Proje ayarları → Hizmet hesapları → yeni özel anahtar üret (JSON)
5. GitHub deposunda **Settings > Secrets and variables > Actions**:
   - `FIREBASE_PROJE` = proje kimliği
   - `FIREBASE_HESAP_JSON` = indirdiğin JSON'un tamamı

### 5. Yayın öncesi
- Keystore üret (imzalama) — şifreler sende kalır
- Play Console'da uygulama oluştur: **com.berk.macvakti**
- Gizlilik politikası hazırla (bildirim izni istendiği için zorunlu)
- Mağaza görselleri (ikon, ekran görüntüleri) — logo içermeyen tasarım

---

## KANAL KURALLARI — doldurulması gereken tek veri

Futbolda yayın kanalı hiçbir ücretsiz kaynakta yok. Basketbol ve hentbolda
resmi API veriyor, futbolda vermiyor.

`toplayici/veri/kanal-kurallari.json` şu an **bilerek boş**. Yanlış kanal bilgisi
kullanıcıyı yanılttığı için doğrulanmadan kural yazılmadı.

Sezonun yayın hakları netleştiğinde şu biçimde doldurulur:
```json
{
  "ligKurallari": {
    "futbol:198": { "kanallar": ["beIN Sports 1"] }
  },
  "elleGirilenler": {
    "futbol:tff:SL:...": ["TRT Spor"]
  }
}
```
Kanalı bilinmeyen maçlar `toplayici/veri/kanal-eksikleri.json` dosyasında listelenir —
bu, elle doldurulacakların çalışma listesidir. Uygulamada bu maçlarda
"Yayın bilgisi bekleniyor" yazar; uydurma kanal gösterilmez.

---

## TELİF KURALLARI (koda gömülü, testle korunuyor)

1. Kulüp/federasyon/kanal **logosu kullanılmaz.** API'lerin `logoUrl`, `liveLogo`
   alanları koda hiç alınmaz. Test bunu doğruluyor: "LOGO SIZDIRMIYOR".
2. Logo yerine takım adından türetilen **tipografik rozet** (renk + baş harfler).
   Tamamen bizim ürettiğimiz, telifsiz görsel dil.
3. Hiçbir metin kopyalanmaz; her cümle `metin.js` içinde şablondan kurulur.
4. Kaynak site adı uygulamada hiçbir yerde geçmez.
5. Kulüp adları kullanılır — olgusal bilgidir, marka ihlali değildir.
6. Oyuncu fotoğrafı kullanılmaz.

---

## KOMUTLAR

```bash
node toplayici/test/dogrula.js      # 49 test, ağ gerektirmez
node toplayici/src/topla.js         # tüm branşları topla
node toplayici/src/topla.js futbol  # tek branş
node toplayici/src/topla.js --kuru  # dosya yazmadan dene
```

---

## BİLİNEN SINIRLAR

- **Voleybol** sezonu başlamadığı için ayrıştırıcı canlı veriyle sınanamadı.
  Ekim'de ilk fikstür çıkınca kontrol edilmeli.
- **TFF hafta gezinme**: `&hafta=N` parametresi denenip işlemezse güncel hafta
  ile yetinilir. İleri haftaların çekilebildiği canlı ortamda doğrulanmalı.
- **Kadro bilgisi** ücretsiz kaynaklarda yapılandırılmış halde yok. Şu an
  toplanmıyor; ileride TFF maç detay sayfasından denenebilir.
- **Kaynak kırılırsa**: Federasyon sitesi değişirse ayrıştırıcı güncellenmeli.
  Actions hata verdiğinde uyarı üretir. Yedek olarak API-Sports adaptörü
  yazılabilir (mimari kaynaktan bağımsız kurgulandı).
