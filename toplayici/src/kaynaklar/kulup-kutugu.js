// kulup-kutugu.js — Lig bazlı KULÜP LİSTESİ (fikstürden bağımsız).
//
// NEDEN AYRI:
//   Takım listesini fikstürden türetmek eksik kalıyor: fikstür henüz
//   yayınlanmamış ligler ve sayfada varsayılan olarak gösterilmeyen
//   gruplar hiç görünmüyordu. Kütük, her grubun ilk haftalarından
//   TÜM takımları toplayıp saklar; fikstür olmasa da liste dolu kalır.
//
// KURAL: Doğrulanamayan hiçbir kulüp yazılmaz. Eksik bırakmak,
//        yanlış/feshedilmiş kulüp göstermekten iyidir.

'use strict';
const fs = require('fs');
const path = require('path');
const futbol = require('./futbol-tff');
const O = require('../ortak');

// Otomatik erisime kapali kaynaklar icin ELLE BAKIMI yapilan listeler.
// Bilerek 'veri/' disinda tutulur: 'veri/' uretilen ciktilar icindir ve
// yayin betigi orayi depodaki hali ile geri alir; elle yazilan dosya
// orada dursa silinirdi.
const ELLE_KLASOR = path.join(__dirname, '..', '..', 'veri-sabit');
const ELLE_LISTELER = ['kulupler-basketbol.json'];

const KUTUK = path.join(__dirname, '..', '..', 'veri', 'kulupler.json');
const TAZELIK_SAAT = 20;      // günde bir yenilemek yeter

function oku() {
  try { return JSON.parse(fs.readFileSync(KUTUK, 'utf8')); }
  catch (_) { return { guncellendi: null, ligler: [] }; }
}
function yaz(o) {
  fs.mkdirSync(path.dirname(KUTUK), { recursive: true });
  fs.writeFileSync(KUTUK, JSON.stringify(o, null, 1), 'utf8');
}

function tazeMi(kutuk) {
  if (!kutuk || !kutuk.guncellendi || !kutuk.ligler || !kutuk.ligler.length) return false;
  const yas = (Date.now() - new Date(kutuk.guncellendi).getTime()) / 3600000;
  return yas < TAZELIK_SAAT;
}
/**
 * Kütüğü tazeler. Taze ise ağa çıkmaz.
 * Toplama başarısız olursa ESKİ KÜTÜK KORUNUR — boş liste yazıp
 * kullanıcıyı takımsız bırakmaktansa bayat ama dolu liste iyidir.
 */
async function topla(secenek) {
  const s = secenek || {};
  const eski = oku();
  if (!s.zorla && tazeMi(eski)) {
    console.log('[kutuk] taze (' + eski.ligler.length + ' lig), atlandi');
    return eski;
  }

  let ligler = [];
  try {
    ligler = await futbol.kulupleriTopla();
  } catch (e) {
    console.error('[kutuk] futbol kulupleri alinamadi: ' + e.message);
  }

  // Elle bakimi yapilan listeleri ekle (ör. basketbol: kaynak sitesi
  // otomatik erisime kapali). Bunlar aga cikmadan dosyadan okunur.
  for (const dosya of ELLE_LISTELER) {
    try {
      const yol = path.join(ELLE_KLASOR, dosya);
      const j = JSON.parse(fs.readFileSync(yol, 'utf8'));
      for (const l of (j.ligler || [])) {
        if (!l.takimlar || !l.takimlar.length) continue;
        ligler.push({
          brans: l.brans,
          ligId: l.ligId,
          lig: l.lig,
          // Kaynak TUMU BUYUK gonderiyor; okunakli bicime cevir.
          takimlar: l.takimlar.map(a => O.buyukHarfDuzelt(a)).sort(
            (x, y) => x.localeCompare(y, 'tr'))
        });
      }
      console.log('[kutuk] elle liste eklendi: ' + dosya +
        ' (' + (j.ligler || []).length + ' lig)');
    } catch (e) {
      console.error('[kutuk] ' + dosya + ' okunamadi: ' + e.message);
    }
  }
  if (!ligler.length) {
    console.error('[kutuk] toplama bos dondu, eski kutuk korunuyor');
    return eski;
  }

  // BIRLESTIR, degistirme. Bir kaynak gecici olarak hata verirse
  // (or. TFF 403) o ligin eski listesi KORUNUR; aksi halde kullanici
  // bir anda takimsiz kalir.
  const harita = new Map();
  for (const l of (eski.ligler || [])) harita.set(l.ligId, l);
  for (const l of ligler) {
    if (l.takimlar && l.takimlar.length) harita.set(l.ligId, l);
  }
  const birlesik = [...harita.values()];

  const yeniGelen = ligler.filter(l => !(eski.ligler || []).some(e => e.ligId === l.ligId));
  if (yeniGelen.length) {
    console.log('[kutuk] yeni lig: ' + yeniGelen.map(l => l.lig).join(', '));
  }
  const korunan = (eski.ligler || []).filter(
    e => !ligler.some(l => l.ligId === e.ligId && l.takimlar.length));
  if (korunan.length) {
    console.log('[kutuk] bu turda alinamadi, eskisi korundu: ' +
      korunan.map(l => l.lig).join(', '));
  }

  const toplamTakim = birlesik.reduce((t, l) => t + l.takimlar.length, 0);
  const yeni = {
    guncellendi: new Date().toISOString(),
    ligSayisi: birlesik.length,
    takimSayisi: toplamTakim,
    ligler: birlesik
  };
  yaz(yeni);
  console.log('[kutuk] ' + birlesik.length + ' lig, ' + toplamTakim + ' takim kaydedildi');
  return yeni;
}

module.exports = { topla, oku, KUTUK };
