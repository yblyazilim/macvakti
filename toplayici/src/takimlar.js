// takimlar.js — Branş > Lig > Takım ağacını ve kulüp künyelerini üretir.
//
// Ağaç FİKSTÜRDEN türetilir: bir ligde maçı olan takım o ligdedir.
// Böylece ayrı bir "takım listesi" kaynağına bağımlı kalmayız ve
// lig değişikliklerinde kendiliğinden güncellenir.

'use strict';
const fs = require('fs');
const path = require('path');
const bilgi = require('./kaynaklar/takim-bilgi');

const VERI = path.join(__dirname, '..', 'veri');

const BRANS_ADI = {
  futbol: 'Futbol', basketbol: 'Basketbol',
  voleybol: 'Voleybol', hentbol: 'Hentbol'
};

/** Uygulamadaki konuAnahtar ile AYNI olmalı. */
function anahtar(ad) {
  return String(ad)
    .replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g').replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function macOku() {
  try {
    return JSON.parse(fs.readFileSync(path.join(VERI, 'maclar.json'), 'utf8')).maclar || [];
  } catch (_) { return []; }
}

/**
 * Ağacı kurar.
 * Dönen yapı uygulamanın doğrudan çizebileceği biçimdedir.
 */
function agacKur(maclar, kunyeler) {
  // brans -> ligId -> { ad, takimlar:Set }
  const branslar = new Map();
  // anahtar -> { ad, branslar:Set, ligler:Set }
  const takimlar = new Map();

  for (const m of maclar) {
    const b = m.brans || 'diger';
    if (!branslar.has(b)) branslar.set(b, new Map());
    const ligler = branslar.get(b);

    // Lig kimliği yoksa lig adını kimlik yap; ikisi de yoksa "diger".
    const ligId = String(m.ligId || m.lig || 'diger');
    if (!ligler.has(ligId)) {
      ligler.set(ligId, { id: ligId, ad: m.lig || 'Diğer', takimlar: new Set() });
    }
    const lig = ligler.get(ligId);

    for (const ad of [m.evSahibi, m.deplasman]) {
      if (!ad || !String(ad).trim()) continue;
      const a = anahtar(ad);
      if (!a) continue;
      lig.takimlar.add(a);

      if (!takimlar.has(a)) {
        takimlar.set(a, { anahtar: a, ad: ad, branslar: new Set(), ligler: new Set() });
      }
      const t = takimlar.get(a);
      t.branslar.add(b);
      t.ligler.add(b + ':' + ligId);
      // En uzun ad genelde en açıklayıcı olanıdır ("Beşiktaş" > "Beşiktaş JK"?)
      // Kısa ve temiz olanı tercih ederiz; eşitse ilk gelen kalır.
      if (ad.length < t.ad.length) t.ad = ad;
    }
  }

  const bransListe = [...branslar.entries()]
    .map(([k, ligler]) => ({
      k,
      ad: BRANS_ADI[k] || k,
      ligler: [...ligler.values()]
        .map(l => ({ id: l.id, ad: l.ad, takimlar: [...l.takimlar].sort() }))
        .sort((a, b) => b.takimlar.length - a.takimlar.length ||
                        a.ad.localeCompare(b.ad, 'tr'))
    }))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

  const takimObje = {};
  for (const [a, t] of takimlar) {
    const k = kunyeler[t.ad] || {};
    takimObje[a] = {
      ad: t.ad,
      branslar: [...t.branslar].sort(),
      ligler: [...t.ligler].sort()
    };
    // Künye YALNIZCA gerçekten bulunmuşsa yazılır; yoksa alan hiç konmaz.
    if (k.bulundu) {
      const kunye = {};
      if (k.kurulus) kunye.kurulus = k.kurulus;
      if (k.sehir) kunye.sehir = k.sehir;
      if (k.stat) kunye.stat = k.stat;
      if (k.kurucu) kunye.kurucu = k.kurucu;
      if (Object.keys(kunye).length) takimObje[a].kunye = kunye;
    }
  }

  return { branslar: bransListe, takimlar: takimObje };
}

async function calistir(secenek) {
  const s = secenek || {};
  const maclar = macOku();
  if (!maclar.length) {
    console.log('[takimlar] maclar.json bos, agac kurulamadi');
    return null;
  }

  // Fikstürdeki benzersiz takım adları
  const adlar = [...new Set(maclar.flatMap(m => [m.evSahibi, m.deplasman])
    .filter(a => a && String(a).trim()))];

  let ob = bilgi.oku();
  if (!s.kunyesiz) {
    try {
      ob = await bilgi.topla(adlar, s.sinir || 40);
    } catch (e) {
      console.error('[takimlar] kunye toplama hatasi: ' + e.message);
    }
  }

  const agac = agacKur(maclar, ob.takimlar || {});
  const cikti = {
    guncellendi: new Date().toISOString(),
    surum: 1,
    bransSayisi: agac.branslar.length,
    takimSayisi: Object.keys(agac.takimlar).length,
    branslar: agac.branslar,
    takimlar: agac.takimlar
  };

  fs.mkdirSync(VERI, { recursive: true });
  fs.writeFileSync(path.join(VERI, 'takimlar.json'),
    JSON.stringify(cikti, null, 1), 'utf8');

  const kunyeli = Object.values(agac.takimlar).filter(t => t.kunye).length;
  console.log('[takimlar] ' + cikti.bransSayisi + ' brans, ' +
    cikti.takimSayisi + ' takim (' + kunyeli + ' kunyeli)');
  return cikti;
}

if (require.main === module) {
  calistir({ kunyesiz: process.argv.includes('--kunyesiz') })
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { calistir, agacKur, anahtar };
