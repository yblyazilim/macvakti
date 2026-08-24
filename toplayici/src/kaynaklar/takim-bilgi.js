// takim-bilgi.js — Kulüp künye bilgilerini Wikidata'dan toplar.
//
// NEDEN WIKIDATA:
//   Wikidata içeriği CC0'dır (kamu malı) — telif riski yoktur. Ayrıca
//   yapısal veridir: metin kopyalamayız, yalnızca OLGU alanlarını
//   (kuruluş yılı, şehir, stat) okuruz ve kendi cümlemizle sunarız.
//
// GÜVENLİK KURALI: Eşleşmeden emin değilsek ALAN BOŞ KALIR. Asla uydurmayız.

'use strict';
const fs = require('fs');
const path = require('path');

const KOK = 'https://www.wikidata.org/w/api.php';
const VARLIK = 'https://www.wikidata.org/wiki/Special:EntityData/';
const UA = 'MacVakti/1.0 (spor fikstur bilgilendirme uygulamasi)';

const ONBELLEK = path.join(__dirname, '..', '..', 'veri', 'takim-bilgi.json');
const TAZELIK_GUN = 45;          // bu kadar gün sonra yeniden sorulur
const TUR_TATMIN = new Set([
  'Q476028',    // futbol kulübü
  'Q847017',    // spor kulübü
  'Q13393265',  // basketbol takımı
  'Q15944511',  // voleybol takımı
  'Q17318786',  // hentbol takımı
  'Q23847174',  // spor takımı
  'Q12973014'   // sports team
]);

function oku() {
  try { return JSON.parse(fs.readFileSync(ONBELLEK, 'utf8')); }
  catch (_) { return { guncellendi: null, takimlar: {} }; }
}
function yaz(o) {
  fs.mkdirSync(path.dirname(ONBELLEK), { recursive: true });
  fs.writeFileSync(ONBELLEK, JSON.stringify(o, null, 1), 'utf8');
}

async function jsonAl(url) {
  const y = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (!y.ok) throw new Error('HTTP ' + y.status);
  return y.json();
}

/** Arama sonuçlarından spor kulübü olanı seçer. */
async function varlikBul(ad) {
  const u = KOK + '?action=wbsearchentities&format=json&language=tr&uselang=tr' +
            '&type=item&limit=6&search=' + encodeURIComponent(ad);
  const j = await jsonAl(u);
  const adaylar = j.search || [];
  if (!adaylar.length) return null;

  for (const a of adaylar) {
    let e;
    try { e = (await jsonAl(VARLIK + a.id + '.json')).entities[a.id]; }
    catch (_) { continue; }
    const turler = ((e.claims || {}).P31 || [])
      .map(x => x.mainsnak.datavalue && x.mainsnak.datavalue.value &&
                x.mainsnak.datavalue.value.id)
      .filter(Boolean);
    // Spor kulübü DEĞİLSE atla. "Karagümrük" gibi adlar mahalleyle
    // karışabiliyor; tür kontrolü olmadan yanlış künye yazardık.
    if (turler.some(t => TUR_TATMIN.has(t))) return e;
  }
  return null;
}

/** Varlık kimliklerini Türkçe etikete çevirir (tek istekte). */
async function etiketler(idler) {
  const benzersiz = [...new Set(idler.filter(Boolean))];
  if (!benzersiz.length) return {};
  const sonuc = {};
  for (let i = 0; i < benzersiz.length; i += 45) {
    const parca = benzersiz.slice(i, i + 45);
    const u = KOK + '?action=wbgetentities&format=json&props=labels' +
              '&languages=tr|en&ids=' + parca.join('|');
    let j;
    try { j = await jsonAl(u); } catch (_) { continue; }
    for (const [id, e] of Object.entries(j.entities || {})) {
      const l = e.labels || {};
      const v = (l.tr && l.tr.value) || (l.en && l.en.value);
      if (v) sonuc[id] = v;
    }
  }
  return sonuc;
}

function ilkDeger(claims, p) {
  const d = (claims[p] || []).find(x => x.mainsnak && x.mainsnak.datavalue);
  return d ? d.mainsnak.datavalue.value : null;
}
function yilCikar(zaman) {
  if (!zaman || !zaman.time) return null;
  const m = String(zaman.time).match(/^[+-](\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return (y > 1800 && y <= new Date().getFullYear()) ? y : null;
}

/** Tek bir takımın künyesini çıkarır. Bulunamazsa boş künye döner. */
async function kunyeCek(ad) {
  const e = await varlikBul(ad);
  if (!e) return { bulundu: false };

  const c = e.claims || {};
  const kurulus = yilCikar(ilkDeger(c, 'P571'));
  const statId = (ilkDeger(c, 'P115') || {}).id || null;
  const sehirId = (ilkDeger(c, 'P159') || {}).id || null;
  const kurucuId = (ilkDeger(c, 'P112') || {}).id || null;

  const et = await etiketler([statId, sehirId, kurucuId]);

  return {
    bulundu: true,
    wikidata: e.id,
    resmiAd: (e.labels && e.labels.tr && e.labels.tr.value) || null,
    kurulus: kurulus,
    stat: statId ? (et[statId] || null) : null,
    sehir: sehirId ? (et[sehirId] || null) : null,
    kurucu: kurucuId ? (et[kurucuId] || null) : null
  };
}

/**
 * Verilen takım adları için künyeleri toplar.
 * Önbellekte taze kaydı olanlar tekrar sorulmaz — hem hızlı hem kibar.
 */
async function topla(adlar, sinir = 40) {
  const ob = oku();
  const simdi = Date.now();
  const esik = TAZELIK_GUN * 86400000;
  let sorulan = 0, yeni = 0, hata = 0;

  for (const ad of adlar) {
    if (sorulan >= sinir) break;
    const anahtar = String(ad).trim();
    if (!anahtar) continue;

    const kayit = ob.takimlar[anahtar];
    if (kayit && kayit.zaman && (simdi - kayit.zaman) < esik) continue;

    sorulan++;
    try {
      const k = await kunyeCek(anahtar);
      ob.takimlar[anahtar] = Object.assign({ zaman: simdi }, k);
      if (k.bulundu) yeni++;
    } catch (e) {
      hata++;
      // Hatayı da kaydet ki her turda aynı adı tekrar tekrar sormayalım;
      // ama tazelik süresi dolunca yine denenir.
      ob.takimlar[anahtar] = { zaman: simdi, bulundu: false, hata: String(e.message).slice(0, 80) };
    }
    await new Promise(r => setTimeout(r, 250));   // kaynağa saygı
  }

  ob.guncellendi = new Date().toISOString();
  yaz(ob);
  console.log('[takim-bilgi] sorulan: ' + sorulan + ', kunye bulundu: ' + yeni +
              ', hata: ' + hata + ', toplam kayit: ' + Object.keys(ob.takimlar).length);
  return ob;
}

module.exports = { topla, oku, kunyeCek, varlikBul, ONBELLEK };
