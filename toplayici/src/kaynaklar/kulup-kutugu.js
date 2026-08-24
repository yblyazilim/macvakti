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

  if (!ligler.length) {
    console.error('[kutuk] toplama bos dondu, eski kutuk korunuyor');
    return eski;
  }

  const toplamTakim = ligler.reduce((t, l) => t + l.takimlar.length, 0);
  const yeni = {
    guncellendi: new Date().toISOString(),
    ligSayisi: ligler.length,
    takimSayisi: toplamTakim,
    ligler
  };
  yaz(yeni);
  console.log('[kutuk] ' + ligler.length + ' lig, ' + toplamTakim + ' takim kaydedildi');
  return yeni;
}

module.exports = { topla, oku, KUTUK };
