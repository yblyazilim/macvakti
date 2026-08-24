// kulup-kutugu.js — Lig bazlı KULÜP LİSTESİ (fikstürden bağımsız).
//
// NEDEN AYRI:
//   Takım listesini fikstürden türetmek eksik kalıyor: fikstür henüz
//   yayınlanmamış ligler ve sayfada varsayılan gösterilmeyen gruplar
//   hiç görünmüyordu. Kütük, her grubun ilk haftalarından TÜM takımları
//   toplayıp saklar; fikstür olmasa da liste dolu kalır.
//
// KURAL: Doğrulanamayan hiçbir kulüp yazılmaz. Eksik bırakmak,
//        yanlış/feshedilmiş kulüp göstermekten iyidir.

'use strict';
const fs = require('fs');
const path = require('path');
const futbol = require('./futbol-tff');
const O = require('../ortak');

// Otomatik erişime kapalı kaynaklar için ELLE BAKIMI yapılan listeler.
// Bilerek 'veri/' dışında tutulur: 'veri/' üretilen çıktılar içindir ve
// yayın betiği orayı depodaki hâliyle geri alır; elle yazılan dosya
// orada dursa silinirdi.
const ELLE_KLASOR = path.join(__dirname, '..', '..', 'veri-sabit');
const ELLE_LISTELER = ['kulupler-basketbol.json'];

const KUTUK = path.join(__dirname, '..', '..', 'veri', 'kulupler.json');
const TAZELIK_SAAT = 20;      // ağ toplaması için; günde bir yeter

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
 * Elle bakımı yapılan listeleri okur. AĞA ÇIKMAZ, bu yüzden tazelik
 * denetimine TABİ DEĞİLDİR: dosya değiştiği anda etkili olmalı.
 */
function elleListeleriOku() {
  const cikan = [];
  for (const dosya of ELLE_LISTELER) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(ELLE_KLASOR, dosya), 'utf8'));
      for (const l of (j.ligler || [])) {
        if (!l.takimlar || !l.takimlar.length) continue;
        cikan.push({
          brans: l.brans,
          ligId: l.ligId,
          lig: l.lig,
          // Kaynak TÜMÜ BÜYÜK gönderiyor; okunaklı biçime çevir.
          takimlar: l.takimlar.map(a => O.buyukHarfDuzelt(a))
                              .sort((x, y) => x.localeCompare(y, 'tr'))
        });
      }
      console.log('[kutuk] elle liste: ' + dosya + ' (' + (j.ligler || []).length + ' lig)');
    } catch (e) {
      console.error('[kutuk] ' + dosya + ' okunamadi: ' + e.message);
    }
  }
  return cikan;
}

/** Lig listelerini ligId'ye göre birleştirir; boş gelen ESKİYİ EZMEZ. */
function birlestir(eskiler, yeniler) {
  const harita = new Map();
  for (const l of (eskiler || [])) harita.set(l.ligId, l);
  for (const l of (yeniler || [])) {
    if (l.takimlar && l.takimlar.length) harita.set(l.ligId, l);
  }
  return [...harita.values()];
}

function kaydet(ligler) {
  const toplam = ligler.reduce((t, l) => t + l.takimlar.length, 0);
  const o = {
    guncellendi: new Date().toISOString(),
    ligSayisi: ligler.length,
    takimSayisi: toplam,
    ligler
  };
  yaz(o);
  console.log('[kutuk] ' + ligler.length + ' lig, ' + toplam + ' takim kaydedildi');
  return o;
}
/**
 * Kütüğü tazeler.
 *  - Elle listeler HER ÇALIŞMADA uygulanır (ağ gerekmez).
 *  - Ağdan toplama günde bir yapılır; başarısız olursa ESKİSİ KORUNUR.
 */
async function topla(secenek) {
  const s = secenek || {};
  const eski = oku();
  const elle = elleListeleriOku();

  // Ağ toplaması gerekmiyorsa bile elle listelerde değişiklik olmuş
  // olabilir; onları uygulayıp kaydet, sonra çık.
  if (!s.zorla && tazeMi(eski)) {
    const eksik = elle.filter(l => !(eski.ligler || []).some(e => e.ligId === l.ligId));
    if (eksik.length) {
      console.log('[kutuk] taze ama elle listeden ' + eksik.length + ' lig eksik, ekleniyor');
      return kaydet(birlestir(eski.ligler, elle));
    }
    console.log('[kutuk] taze (' + eski.ligler.length + ' lig), ag toplamasi atlandi');
    return eski;
  }

  let agdan = [];
  try {
    agdan = await futbol.kulupleriTopla();
  } catch (e) {
    console.error('[kutuk] futbol kulupleri alinamadi: ' + e.message);
  }

  const yeniler = agdan.concat(elle);
  if (!yeniler.length) {
    console.error('[kutuk] toplama bos dondu, eski kutuk korunuyor');
    return eski;
  }

  const birlesik = birlestir(eski.ligler, yeniler);
  const korunan = (eski.ligler || []).filter(
    e => !yeniler.some(l => l.ligId === e.ligId && l.takimlar.length));
  if (korunan.length) {
    console.log('[kutuk] bu turda alinamadi, eskisi korundu: ' +
      korunan.map(l => l.lig).join(', '));
  }
  return kaydet(birlesik);
}

module.exports = { topla, oku, elleListeleriOku, birlestir, KUTUK };
