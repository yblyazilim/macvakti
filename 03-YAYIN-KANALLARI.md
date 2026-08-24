# Yayın Kanalı Sistemi

Kanal bilgisi bu projede **tahmin edilmez, doğrulanır.** Yayıncıların kendi
program akışı taranır ve maçlarla eşleştirilir. Bir maçın hangi kanalda
olduğunu söylüyorsak, bunu o kanalın kendi yayın planından biliyoruz demektir.

Tamamı ücretsiz. Hiçbir veri aboneliği yok.

---

## KAYNAKLAR (canlı doğrulandı, 24.08.2026)

### 1. Digiturk yayın akışı
`https://www.digiturk.com.tr/Ajax/GetTvGuideFromDigiturk?Day=MM/DD/YYYY 00:00:00`

Tek istekte günün tüm kanallarını verir (~3 MB, 3.479 program).

**Kapsadığı spor kanalları:** beIN Sports 1, 2, 3, 4, 5, MAX 1, MAX 2,
beIN Sports Haber, TRT Spor, TRT Spor Yıldız, A Spor, Sports TV,
EKOL Sports, Eurosport 1, Eurosport 2

Program başlıkları şu biçimde gelir:
```
SUPER LIG (26-27) 2. HAFTA ALANYASPOR - BESIKTAS - CANLI -
TFF 1.LIG (26-27) 3. HAFTA BANDIRMASPOR - KECIORENGUCU - BANT -
```

### 2. Turkcell TV+ yayın akışı
`https://izmaottvsc14.tvplus.com.tr:33207/EPG/JSON/` → `Authenticate`, sonra `PlayBillList`

Digiturk'te **bulunmayan** kanalları kapsar — bu yüzden ikisi birlikte gerekli:

**S Sport, S Sport 2, tabii spor, tabii TV (DİJİTAL), HT Spor**,
ayrıca TRT Spor, TRT Spor Yıldız, A Spor, Sports TV, Eurosport (çapraz doğrulama için)

Doğrulanan örnekler: S Sport → Osasuna-Levante, S Sport 2 → Bologna-Lazio,
TRT Spor → Sarıyer-Batman Petrolspor (TFF 1. Lig)

### 3. Federasyon verisi
TBF `broadcastChannel`, THF `liveBroadcast`, TVF genel fikstürdeki `TV` sütunu.

---

## EŞLEŞTİRME NASIL ÇALIŞIYOR

```
Program başlığı            Maç kaydı
"ALANYASPOR - BESIKTAS"    Alanyaspor - Beşiktaş
        |                          |
        +---- Türkçe katlama ------+
              (ş→s, ğ→g, ı→i, ö→o, ü→u, ç→c)
                       |
              Takım çifti tutuyor mu?
                       |
              Yayın saati maç saatine yakın mı?
                       |
                    PUAN
```

**Zaman kontrolü kilit rol oynuyor.** Yayın akışında aynı maç günde 4-5 kez
tekrar olarak geçiyor. Sadece isme baksaydık, sabah 04:15'teki tekrarı canlı
yayın sanardık. Zaman farkı 20 dakikayı aşınca puan düşüyor, 90 dakikayı
aşınca eşleşme tamamen reddediliyor.

| Zaman farkı | Puan |
|---|---|
| ≤ 20 dk | 100 |
| ≤ 45 dk | 80 |
| ≤ 90 dk | 45 |
| > 90 dk | reddedilir |

Ayrıca başlıkta **BANT / TEKRAR / ÖZET** geçiyorsa 60 puan düşülür,
**CANLI / NAKLEN** geçiyorsa 10 puan eklenir. Eşik: 60 puan.

**Çapraz doğrulama:** Aynı kanalı hem Digiturk hem TV+ söylüyorsa güven
10 puan artar ve maç `kanalDogrulayan: 2` olarak işaretlenir.

**Birden çok kanal:** Bir maç aynı anda birkaç kanalda olabilir (ör. beIN
Sports 2 + tabii spor). Puanı en yükseğin 10 puan yakınındaki tüm kanallar
listelenir, en fazla 3 tane.

---

## KATMAN ÖNCELİĞİ

```
1. ELLE         Admin panelinden girilen istisna     -> güven 100
2. YAYIN AKIŞI  Yayıncı programından doğrulanmış     -> güven 60-100
3. KAYNAK       Federasyon verisindeki kanal alanı   -> güven 85
4. KURAL        Lig bazlı sözleşme kuralı            -> güven 50
   (hiçbiri yoksa)  BOŞ — "Yayın bilgisi bekleniyor"
```

Yayın akışı federasyonu ezer çünkü son dakika değişiklikleri (derbinin başka
kanala alınması gibi) önce yayın planına yansır. Ancak federasyonun verdiği
kanal da listeye eklenir — ikisi birden doğru olabilir.

Güven 60'ın altındaysa yayın akışı önerisi **reddedilir** ve bir alt katmana
düşülür. Zayıf eşleşmeyle yanlış kanal göstermektense hiç göstermemek yeğdir.

---

## DİJİTAL YAYINLAR

`tabii spor` ve `tabii TV` dijital platform olarak işaretlidir. Bu maçlarda
uygulama televizyon simgesi yerine **▶** simgesi ve "dijital" etiketi gösterir —
kullanıcı maçın televizyonda değil, internet üzerinden yayınlandığını anlar.

Yeni dijital platform eklemek için `yayin/tvplus.js` veya `yayin/digiturk.js`
içindeki kanal tablosuna `dijital: true` ile eklemek yeterlidir.

---

## ÇALIŞMA SIKLIĞI

| İş | Sıklık | Neden |
|---|---|---|
| Maç verisi + kanal eşleştirme | **15 dakika** | Saat/kanal değişikliğini hızlı yakalamak |
| Yayın akışı tazeleme | **2 saat** | Akış büyük veri; gün içinde nadiren değişir |

Sık çalışan iş, yayın akışını yeniden indirmez — önbellekten okur
(`veri/yayin-akisi.json`). Önbellek 6 saatten eskiyse kanal doğrulaması
atlanır ve bir alt katmana düşülür. Böylece hem 15 dakikada bir güncel
kalırız hem kaynak siteleri gereksiz yormayız.

---

## DOSYALAR

```
toplayici/src/yayin/
  yayin-ortak.js   Türkçe katlama, takım eşleştirme, canlı/tekrar ayrımı, puanlama
  digiturk.js      Digiturk akışı (bağımlılıksız HTML ayrıştırma)
  tvplus.js        Turkcell TV+ akışı (oturum + JSON)
  eslestir.js      Eşleştirme motoru, çapraz doğrulama, önbellek
toplayici/src/kanal.js   Dört katmanlı karar
```

**Komutlar**
```bash
node toplayici/src/topla.js              # yayın akışı dahil tam toplama
node toplayici/src/topla.js --yayinsiz   # akışı önbellekten oku (sık çalışan mod)
node toplayici/test/dogrula.js           # 68 test
```

---

## SINIRLAR VE İZLEME

- **Kapsam:** Yayın akışında adı geçmeyen maça kanal atanmaz. Alt liglerin
  bir kısmı hiçbir kanalda yayınlanmaz; bu maçlarda "Yayın bilgisi bekleniyor"
  yazması doğru davranıştır.
- **Kaynak değişirse:** Digiturk veya TV+ arayüzünü değiştirirse ayrıştırıcı
  güncellenmeli. Actions hata verdiğinde uyarı üretir; kanal çözümü bu sırada
  federasyon ve kural katmanlarına düşerek çalışmaya devam eder.
- **İzleme:** Her çalıştırma `kanalOzet` üretir — kaç maçın kanalı hangi
  katmandan geldi, kaçı bilinmiyor. Bu sayı aniden yükselirse bir kaynak
  kırılmış demektir.
- `veri/kanal-eksikleri.json` kanalı bilinmeyen yaklaşan maçları listeler;
  admin panelinin çalışma listesidir.
