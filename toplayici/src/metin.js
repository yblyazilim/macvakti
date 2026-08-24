// metin.js — Özgün bildirim ve haber metni üretimi.
//
// TELİF KURALI: Hiçbir metin hiçbir kaynaktan alınmaz. Her cümle burada,
// yapısal veriden (takım, saat, kanal, salon) şablonla kurulur. Her tip için
// birden çok varyant vardır ve maç kimliğinden türetilen sabit bir seçimle
// belirlenir — böylece metinler tekdüze görünmez ama aynı maç için hep aynı
// kalır (aynı bildirim iki kez farklı yazılmaz).

'use strict';

const TR_OFSET_DK = 180; // Türkiye kalıcı UTC+3

function trSaat(iso) {
  const d = new Date(new Date(iso).getTime() + TR_OFSET_DK * 60000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

const AY_ADLARI = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                   'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const GUN_ADLARI = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];

function trTarih(iso) {
  const d = new Date(new Date(iso).getTime() + TR_OFSET_DK * 60000);
  return d.getUTCDate() + ' ' + AY_ADLARI[d.getUTCMonth()];
}

function trGun(iso) {
  const d = new Date(new Date(iso).getTime() + TR_OFSET_DK * 60000);
  return GUN_ADLARI[d.getUTCDay()];
}

/** Maç kimliğinden kararlı bir sayı türetir — varyant seçimi için. */
function tohum(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function sec(varyantlar, id) {
  return varyantlar[tohum(id) % varyantlar.length];
}

function kanalCumlesi(mac) {
  if (!mac.kanallar || !mac.kanallar.length) return '';
  return mac.kanallar.join(', ');
}

/** Maç öncesi hatırlatma */
function hatirlatma(mac, kalanDakika) {
  const k = kanalCumlesi(mac);
  const sure = kalanDakika >= 60
    ? Math.round(kalanDakika / 60) + ' saat'
    : kalanDakika + ' dakika';

  const basliklar = [
    mac.evSahibi + ' - ' + mac.deplasman,
    mac.evSahibi + ' ile ' + mac.deplasman + ' karşılaşıyor',
    'Yaklaşıyor: ' + mac.evSahibi + ' - ' + mac.deplasman
  ];

  const govdeler = k ? [
    sure + ' sonra başlıyor. ' + k + ' ekranlarında.',
    'Başlamasına ' + sure + ' kaldı. Yayın: ' + k + '.',
    trSaat(mac.baslangicUtc) + "'de başlıyor, " + k + ' üzerinden izlenebilir.'
  ] : [
    sure + ' sonra başlıyor.',
    'Başlamasına ' + sure + ' kaldı. Saat ' + trSaat(mac.baslangicUtc) + '.',
    trSaat(mac.baslangicUtc) + "'de başlıyor."
  ];

  return { baslik: sec(basliklar, mac.id), govde: sec(govdeler, mac.id + kalanDakika) };
}

/** Saat değişikliği — en kritik bildirim */
function saatDegisti(mac, eskiIso) {
  return {
    baslik: 'Saat değişti: ' + mac.evSahibi + ' - ' + mac.deplasman,
    govde: 'Karşılaşma ' + trSaat(eskiIso) + ' yerine ' + trSaat(mac.baslangicUtc)
         + "'de oynanacak. " + trGun(mac.baslangicUtc) + ', ' + trTarih(mac.baslangicUtc) + '.'
  };
}

/** Kanal değişikliği */
function kanalDegisti(mac) {
  return {
    baslik: 'Yayın kanalı güncellendi',
    govde: mac.evSahibi + ' - ' + mac.deplasman + ' karşılaşması '
         + kanalCumlesi(mac) + ' ekranlarından yayınlanacak.'
  };
}

function ertelendi(mac) {
  return {
    baslik: 'Maç ertelendi',
    govde: mac.evSahibi + ' - ' + mac.deplasman + ' karşılaşması ertelendi. '
         + 'Yeni tarih açıklandığında bilgilendirileceksiniz.'
  };
}

function iptal(mac) {
  return {
    baslik: 'Maç iptal edildi',
    govde: mac.evSahibi + ' - ' + mac.deplasman + ' karşılaşması iptal edildi.'
  };
}

function kadroAcik(mac) {
  const f = mac.kadrolar && mac.kadrolar.ev && mac.kadrolar.ev.dizilis;
  return {
    baslik: 'İlk 11’ler belli oldu',
    govde: mac.evSahibi + ' - ' + mac.deplasman + (f ? ' · ' + mac.evSahibi + ' ' + f : '')
         + '. Kadroları görmek için dokunun.'
  };
}

function sonuc(mac) {
  const varyantlar = [
    'Bitti: ' + mac.evSahibi + ' ' + mac.skorEv + '-' + mac.skorDep + ' ' + mac.deplasman,
    mac.evSahibi + ' ' + mac.skorEv + '-' + mac.skorDep + ' ' + mac.deplasman + ' · Maç sona erdi',
    'Sona erdi: ' + mac.evSahibi + ' ' + mac.skorEv + '-' + mac.skorDep + ' ' + mac.deplasman
  ];
  return { baslik: sec(varyantlar, mac.id), govde: mac.lig + (mac.hafta ? ' · ' + mac.hafta : '') };
}

/** Uygulama içi kısa haber metni (liste ve detay ekranı) */
function macOzeti(mac) {
  const k = kanalCumlesi(mac);
  const parcalar = [
    mac.evSahibi + ' ile ' + mac.deplasman + ', ' + trGun(mac.baslangicUtc) + ' günü '
      + trTarih(mac.baslangicUtc) + ' saat ' + trSaat(mac.baslangicUtc) + "'de karşılaşıyor."
  ];
  if (mac.mekan) parcalar.push('Mücadele ' + mac.mekan + "'de oynanacak.");
  if (k) parcalar.push('Karşılaşma ' + k + ' ekranlarından izlenebilecek.');
  else parcalar.push('Yayın bilgisi açıklandığında güncellenecek.');
  return parcalar.join(' ');
}

module.exports = {
  hatirlatma, saatDegisti, kanalDegisti, ertelendi, iptal, kadroAcik, sonuc,
  macOzeti, trSaat, trTarih, trGun
};
