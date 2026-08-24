// takim-bilgi.js — Kulüp künye bilgilerini Wikidata'dan toplar.
//
// NEDEN WIKIDATA:
//   İçeriği CC0'dır (kamu malı) — telif riski yoktur. Yapısal veridir:
//   metin kopyalamayız, yalnızca OLGU alanlarını okuruz.
//
// İKİ SERT KURAL:
//   1) Eşleşmeden emin değilsek ALAN BOŞ KALIR. Asla uydurmayız.
//   2) GEÇİCİ hata (429/5xx/zaman aşımı) ÖNBELLEĞE YAZILMAZ. Aksi hâlde
//      hız sınırına takılan takımlar haftalarca tekrar denenmez.

'use strict';
const fs = require('fs');
const path = require('path');

const API = 'https://www.wikidata.org/w/api.php';
const UA = 'MacVakti/1.0 (spor fikstur bilgilendirme uygulamasi; nodejs)';

const ONBELLEK = path.join(__dirname, '..', '..', 'veri', 'takim-bilgi.json');
const TAZELIK_GUN = 45;
const BEKLE_MS = 900;        // istekler arası: Wikidata'ya nazik ol
const ADAY_SINIR = 3;        // arama sonucundan bakılacak aday sayısı

const TUR_TATMIN = new Set([
  'Q476028',    // futbol kulübü
  'Q847017',    // spor kulübü
  'Q13393265',  // basketbol takımı
  'Q15944511',  // voleybol takımı
  'Q17318786',  // hentbol takımı
  'Q23847174',  // spor takımı
  'Q12973014'
]);

function oku() {
  try { return JSON.parse(fs.readFileSync(ONBELLEK, 'utf8')); }
  catch (_) { return { guncellendi: null, takimlar: {} }; }
}
function yaz(o) {
  fs.mkdirSync(path.dirname(ONBELLEK), { recursive: true });
  fs.writeFileSync(ONBELLEK, JSON.stringify(o, null, 1), 'utf8');
}
const uyu = (ms) => new Promise(r => setTimeout(r, ms));

/** Geçici mi kalıcı mı? Geçici hatalar önbelleğe YAZILMAZ. */
class GeciciHata extends Error {}

async function jsonAl(url) {
  let y;
  try {
    y = await fetch(url, {
      headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000)
    });
  } catch (e) {
    throw new GeciciHata('ag: ' + (e.message || e));
  }
  if (y.status === 429 || y.status >= 500) {
    throw new GeciciHata('HTTP ' + y.status);
  }
  if (!y.ok) throw new Error('HTTP ' + y.status);
  try { return await y.json(); }
  catch (e) { throw new GeciciHata('bozuk yanit'); }
}

function ilkDeger(claims, p) {
  const d = (claims[p] || []).find(x => x.mainsnak && x.mainsnak.datavalue);
  return d ? d.mainsnak.datavalue.value : null;
}
function yilCikar(z) {
  if (!z || !z.time) return null;
  const m = String(z.time).match(/^[+-](\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return (y > 1800 && y <= new Date().getFullYear()) ? y : null;
}

/**
 * Künyeyi çeker. Toplam 3 istek: arama + adaylar (tek çağrı) + etiketler.
 * Eskiden aday başına ayrı istek atılıyordu; bu hız sınırına takılıyordu.
 */
async function kunyeCek(ad) {
  const arama = await jsonAl(API + '?action=wbsearchentities&format=json&origin=*' +
    '&language=tr&uselang=tr&type=item&limit=' + ADAY_SINIR +
    '&search=' + encodeURIComponent(ad));
  const adaylar = (arama.search || []).map(x => x.id);
  if (!adaylar.length) return { bulundu: false };

  await uyu(BEKLE_MS);
  const paket = await jsonAl(API + '?action=wbgetentities&format=json&origin=*' +
    '&props=claims|labels&languages=tr|en&ids=' + adaylar.join('|'));

  let secilen = null;
  for (const id of adaylar) {
    const e = (paket.entities || {})[id];
    if (!e || !e.claims) continue;
    const turler = (e.claims.P31 || [])
      .map(x => x.mainsnak.datavalue && x.mainsnak.datavalue.value &&
                x.mainsnak.datavalue.value.id).filter(Boolean);
    // Spor kulübü DEĞİLSE atla: "Karagümrük" mahalleyle karışabiliyor.
    if (turler.some(t => TUR_TATMIN.has(t))) { secilen = e; break; }
  }
  if (!secilen) return { bulundu: false };

  const c = secilen.claims;
  const kurulus = yilCikar(ilkDeger(c, 'P571'));
  const statId = (ilkDeger(c, 'P115') || {}).id || null;
  const sehirId = (ilkDeger(c, 'P159') || {}).id || null;
  const kurucuId = (ilkDeger(c, 'P112') || {}).id || null;

  let et = {};
  const idler = [statId, sehirId, kurucuId].filter(Boolean);
  if (idler.length) {
    await uyu(BEKLE_MS);
    try {
      const el = await jsonAl(API + '?action=wbgetentities&format=json&origin=*' +
        '&props=labels&languages=tr|en&ids=' + idler.join('|'));
      for (const [id, e] of Object.entries(el.entities || {})) {
        const l = e.labels || {};
        const v = (l.tr && l.tr.value) || (l.en && l.en.value);
        if (v) et[id] = v;
      }
    } catch (e) {
      if (e instanceof GeciciHata) throw e;   // yarım künye yazmayalım
    }
  }

  return {
    bulundu: true,
    wikidata: secilen.id,
    kurulus: kurulus,
    stat: statId ? (et[statId] || null) : null,
    sehir: sehirId ? (et[sehirId] || null) : null,
    kurucu: kurucuId ? (et[kurucuId] || null) : null
  };
}

/**
 * Künyeleri toplar. Hız sınırına takılırsa TURU BİTİRİR ve hiçbir şeyi
 * yanlış kaydetmez; kalanlar bir sonraki çalıştırmada denenir.
 */
async function topla(adlar, sinir = 12) {
  const ob = oku();
  const simdi = Date.now();
  const esik = TAZELIK_GUN * 86400000;
  let sorulan = 0, bulunan = 0, atlanan = 0;

  for (const ad of adlar) {
    if (sorulan >= sinir) break;
    const anahtar = String(ad).trim();
    if (!anahtar) continue;

    const kayit = ob.takimlar[anahtar];
    if (kayit && kayit.zaman && (simdi - kayit.zaman) < esik) continue;

    sorulan++;
    try {
      const k = await kunyeCek(anahtar);
      ob.takimlar[anahtar] = Object.assign({ zaman: Date.now() }, k);
      if (k.bulundu) bulunan++;
    } catch (e) {
      if (e instanceof GeciciHata) {
        // ÖNBELLEĞE YAZMA. Turu bitir: sınır aşıldıysa devam etmek boşuna.
        console.error('[takim-bilgi] gecici hata (' + e.message +
          '), tur durduruldu; kalanlar sonraki calistirmada denenecek');
        atlanan = 1;
        break;
      }
      // Kalıcı hata: kaydet ki her turda tekrar sorulmasın.
      ob.takimlar[anahtar] = { zaman: Date.now(), bulundu: false,
                               hata: String(e.message).slice(0, 80) };
    }
    await uyu(BEKLE_MS);
  }

  ob.guncellendi = new Date().toISOString();
  yaz(ob);
  const toplam = Object.keys(ob.takimlar).length;
  const kunyeli = Object.values(ob.takimlar).filter(x => x.bulundu).length;
  console.log('[takim-bilgi] bu tur sorulan: ' + sorulan + ', bulunan: ' + bulunan +
    (atlanan ? ' (hiz siniri nedeniyle erken bitti)' : '') +
    ' | kayit: ' + toplam + ', kunyeli: ' + kunyeli);
  return ob;
}

/** Geçici hata yüzünden yazılmış eski kayıtları temizler (bir kerelik). */
function geciciHatalariUnut() {
  const ob = oku();
  let silinen = 0;
  for (const [ad, k] of Object.entries(ob.takimlar)) {
    if (k && k.hata && /HTTP (429|5\d\d)|ag:|zaman|bozuk/i.test(k.hata)) {
      delete ob.takimlar[ad]; silinen++;
    }
  }
  if (silinen) { yaz(ob); console.log('[takim-bilgi] ' + silinen + ' gecici hata kaydi unutuldu'); }
  return silinen;
}

module.exports = { topla, oku, kunyeCek, geciciHatalariUnut, ONBELLEK };
