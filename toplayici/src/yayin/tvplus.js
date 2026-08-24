// tvplus.js — Turkcell TV+ yayın akışı (JSON servisi).
// Digiturk'te bulunmayan kanalları kapsar: S Sport, S Sport 2,
// tabii spor ve tabii TV (DİJİTAL platform), HT Spor.

'use strict';
const O = require('../ortak');
const Y = require('./yayin-ortak');

const KOK = 'https://izmaottvsc14.tvplus.com.tr:33207/EPG/JSON/';

const KANALLAR = {
  '11':   { ad: 'S Sport',        dijital: false },
  '170':  { ad: 'S Sport 2',      dijital: false },
  '4399': { ad: 'tabii spor',     dijital: true  },  // dijital yayın platformu
  '4400': { ad: 'tabii',          dijital: true  },
  '31':   { ad: 'TRT Spor',       dijital: false },
  '205':  { ad: 'TRT Spor Yıldız',dijital: false },
  '4396': { ad: 'HT Spor',        dijital: false },
  '173':  { ad: 'Sports TV',      dijital: false },
  '3':    { ad: 'A Spor',         dijital: false },
  '77':   { ad: 'Eurosport 1',    dijital: false },
  '106':  { ad: 'Eurosport 2',    dijital: false }
};

function damga(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
         p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds());
}

/** "20260824193000" (TR yerel) -> UTC ISO */
function damgaToUtc(s) {
  // TV+ zaman damgasi birden cok bicimde gelebilir. Tek bicime bel
  // baglamak, tum programlarin sessizce elenmesine yol acar.
  if (s === null || s === undefined) return null;
  const str = String(s).trim();
  if (!str) return null;

  // 20260824193000
  let m = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (m) return O.trSaatiniUtcYap(+m[1], +m[2], +m[3], +m[4], +m[5]);

  // 2026-08-24 19:30:00  ya da  2026-08-24T19:30:00
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (m) return O.trSaatiniUtcYap(+m[1], +m[2], +m[3], +m[4], +m[5]);

  // 24.08.2026 19:30
  m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})/);
  if (m) return O.trSaatiniUtcYap(+m[3], +m[2], +m[1], +m[4], +m[5]);

  // epoch (saniye veya milisaniye)
  if (/^\d{13}$/.test(str)) return new Date(+str).toISOString();
  if (/^\d{10}$/.test(str)) return new Date(+str * 1000).toISOString();

  return null;
}

/** Oturum çerezi alır. */
async function oturumAc() {
  const y = await fetch(KOK + 'Authenticate', {
    signal: AbortSignal.timeout(30000),
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
               'User-Agent': 'MacVakti/1.0 (fikstur bilgilendirme uygulamasi)' },
    body: JSON.stringify({
      terminaltype: 'webtv',
      terminalvendor: '5.0 (Windows NT 10.0; Win64; x64)',
      osversion: 'Win32', userType: '3', utcEnable: '1', timezone: 'Europe/Istanbul'
    })
  });
  if (!y.ok) throw new Error('TV+ oturum açılamadı: ' + y.status);
  const cerez = y.headers.getSetCookie ? y.headers.getSetCookie() : [];
  return cerez.map(c => c.split(';')[0]).join('; ');
}

async function kanaliGetir(cerez, id, bas, bit) {
  const y = await fetch(KOK + 'PlayBillList', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cerez,
               'User-Agent': 'MacVakti/1.0 (fikstur bilgilendirme uygulamasi)' },
    body: JSON.stringify({
      type: '2', channelid: id, begintime: bas, endtime: bit, isFillProgram: 1
    })
  });
  if (!y.ok) throw new Error('HTTP ' + y.status);
  const j = await y.json();
  return j.playbilllist || j.playbillList || [];
}

async function topla(gunSayisi = 3) {
  // Oturum acilamazsa HATA FIRLAT. Sessizce bos donmek, raporda
  // 'tamam, 0 program' gibi gorunur ve sorunun sebebi gizlenir.
  const cerez = await oturumAc();
  if (!cerez) throw new Error('TV+ oturum cerezi bos dondu');

  const bugun = new Date();
  const bas = damga(new Date(Date.UTC(bugun.getUTCFullYear(), bugun.getUTCMonth(), bugun.getUTCDate())));
  const bit = damga(new Date(bugun.getTime() + gunSayisi * 86400000));

  const hepsi = [];
  for (const [id, kanal] of Object.entries(KANALLAR)) {
    try {
      const liste = await kanaliGetir(cerez, id, bas, bit);
      console.log('[tvplus] ' + kanal.ad + ': ' + liste.length + ' program alindi');
      let atlanan = 0;
      for (const p of liste) {
        const baslik = String(p.name || '').trim();
        if (!baslik) continue;
        const baslangicUtc = damgaToUtc(p.starttime);
        if (!baslangicUtc) { atlanan++; continue; }
        hepsi.push({
          kanal: kanal.ad,
          dijital: kanal.dijital,
          baslik,
          baslangicUtc,
          sureDk: null,
          tur: Y.yayinTuru(baslik + ' ' + (p.introduce || '')),
          macDisi: Y.MAC_DISI.test(baslik),
          takimlar: Y.takimlariCikar(baslik),
          kaynak: 'tvplus'
        });
      }
      if (atlanan) {
        console.error('[tvplus] ' + kanal.ad + ': ' + atlanan +
          ' program zaman damgasi cozulemedigi icin atlandi (ornek: ' +
          JSON.stringify((liste[0] || {}).starttime) + ')');
      }
    } catch (e) {
      console.error('[tvplus] ' + kanal.ad + ' alınamadı: ' + e.message);
    }
    await O.uyu(400);
  }
  return hepsi;
}

module.exports = { topla, oturumAc, damgaToUtc, KANALLAR, _KOK: KOK };
