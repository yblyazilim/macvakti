// tvplus.js — Turkcell TV+ yayın akışı (JSON servisi).
// Kanal listesi servisten dinamik alınır; alınamazsa sabit liste kullanılır.

'use strict';
const O = require('../ortak');
const Y = require('./yayin-ortak');

const KOK = 'https://izmaottvsc14.tvplus.com.tr:33207/EPG/JSON/';

// Servis kanal listesi vermezse kullanılacak yedek liste.
const KANALLAR = {
  '11':   { ad: 'S Sport',        dijital: false },
  '170':  { ad: 'S Sport 2',      dijital: false },
  '4399': { ad: 'tabii spor',     dijital: true  },
  '4400': { ad: 'tabii',          dijital: true  },
  '31':   { ad: 'TRT Spor',       dijital: false },
  '205':  { ad: 'TRT Spor Yıldız',dijital: false },
  '4396': { ad: 'HT Spor',        dijital: false },
  '173':  { ad: 'Sports TV',      dijital: false },
  '3':    { ad: 'A Spor',         dijital: false },
  '77':   { ad: 'Eurosport 1',    dijital: false },
  '106':  { ad: 'Eurosport 2',    dijital: false }
};

// Kanal adı bu kalıplardan birine uyuyorsa spor kanalı sayılır.
const SPOR_DESENI = /(spor|sport|bein|tivibu|smart|tabii|aspor|eurosport|nba|golf|extreme)/i;
// Bu adlar spor kanalı gibi görünse de maç yayınlamaz; alınmaz.
const ELE = /(radyo|radio|müzik|muzik|haber\s*t[uü]rk|shop|al[ıi][şs]veri[şs])/i;
// Dijital (yayın platformu) kanallar.
const DIJITAL_DESENI = /(tabii|tivibu|bein connect|gain|exxen)/i;

function damga(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
         p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds());
}

/** "20260824193000" (TR yerel) -> UTC ISO */
function damgaToUtc(s) {
  if (s === null || s === undefined) return null;
  const str = String(s).trim();
  if (!str) return null;

  let m = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (m) return O.trSaatiniUtcYap(+m[1], +m[2], +m[3], +m[4], +m[5]);

  m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (m) return O.trSaatiniUtcYap(+m[1], +m[2], +m[3], +m[4], +m[5]);

  m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})/);
  if (m) return O.trSaatiniUtcYap(+m[3], +m[2], +m[1], +m[4], +m[5]);

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

async function cagir(cerez, yol, govde) {
  const y = await fetch(KOK + yol, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', Cookie: cerez,
               'User-Agent': 'MacVakti/1.0 (fikstur bilgilendirme uygulamasi)' },
    body: JSON.stringify(govde)
  });
  if (!y.ok) throw new Error('HTTP ' + y.status);
  return y.json();
}

/**
 * Servisten tüm kanalları çekip spor kanallarını ayıklar.
 * Başarısız olursa sabit listeye düşer; böylece akış hiç durmaz.
 */
async function kanallariBul(cerez) {
  const govde = {
    channelid: '',
    isReturnAllMedia: '1',
    filterlist: [{ key: 'IsHide', value: '-1' }],
    properties: [{ name: 'logicalChannel',
      include: '/channelid,/name,/logicalChannelNumber,/introduce' }]
  };
  for (const yol of ['AllChannelDynamic', 'QueryAllChannel', 'ChannelList']) {
    let j;
    try { j = await cagir(cerez, yol, govde); } catch (e) {
      console.error('[tvplus] ' + yol + ' alınamadı: ' + e.message);
      continue;
    }
    const ham = j.channellist || j.channelList || j.chanellist || [];
    if (!ham.length) { console.error('[tvplus] ' + yol + ': liste boş'); continue; }

    const bulunan = {};
    for (const k of ham) {
      const ad = String(k.name || '').trim();
      const id = String(k.channelid || k.channelID || '').trim();
      if (!ad || !id) continue;
      if (!SPOR_DESENI.test(ad) || ELE.test(ad)) continue;
      bulunan[id] = { ad, dijital: DIJITAL_DESENI.test(ad) };
    }
    const adet = Object.keys(bulunan).length;
    console.log('[tvplus] ' + yol + ': ' + ham.length + ' kanal, ' + adet + ' spor kanalı');
    if (adet >= 5) {
      console.log('[tvplus] spor kanalları: ' +
        Object.values(bulunan).map(x => x.ad).join(', '));
      return bulunan;
    }
  }
  console.error('[tvplus] kanal listesi alınamadı, sabit listeye dönülüyor');
  return KANALLAR;
}

async function kanaliGetir(cerez, id, bas, bit) {
  const j = await cagir(cerez, 'PlayBillList', {
    type: '2', channelid: id, begintime: bas, endtime: bit, isFillProgram: 1
  });
  return j.playbilllist || j.playbillList || [];
}
async function topla(gunSayisi = 7) {
  const cerez = await oturumAc();
  if (!cerez) throw new Error('TV+ oturum cerezi bos dondu');

  const kanallar = await kanallariBul(cerez);

  const bugun = new Date();
  const bas = damga(new Date(Date.UTC(bugun.getUTCFullYear(), bugun.getUTCMonth(), bugun.getUTCDate())));
  const bit = damga(new Date(bugun.getTime() + gunSayisi * 86400000));

  const hepsi = [];
  let hataliKanal = 0;
  for (const [id, kanal] of Object.entries(kanallar)) {
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
          ' program zaman damgasi cozulemedigi icin atlandi');
      }
    } catch (e) {
      hataliKanal++;
      console.error('[tvplus] ' + kanal.ad + ' alınamadı: ' + e.message);
    }
    await O.uyu(250);
  }
  console.log('[tvplus] toplam ' + hepsi.length + ' program, ' +
    hataliKanal + ' kanal hatali');
  return hepsi;
}

module.exports = { topla, oturumAc, damgaToUtc, kanallariBul, KANALLAR, _KOK: KOK };
