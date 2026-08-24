// tani: TBF (basketbol) GitHub sunuculardan erisilebiliyor mu?
// Farkli baslik profillerini dener; hangisi gecerse onu kullanacagiz.
'use strict';

const TARAYICI = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

const PROFILLER = [
  { ad: 'sade', baslik: {} },
  { ad: 'tarayici-UA', baslik: { 'User-Agent': TARAYICI } },
  { ad: 'tam-tarayici', baslik: {
      'User-Agent': TARAYICI,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      'Referer': 'https://www.tbf.org.tr/ligler/bsl-2025-2026',
      'Origin': 'https://www.tbf.org.tr',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty'
  } }
];

const HEDEFLER = [
  ['takim-listesi', 'https://www.tbf.org.tr/api/Team/get-teams-by-leauge?leaugeId=20728'],
  ['lig-bilgisi',   'https://www.tbf.org.tr/api/League/get-league-info?leagueId=20728'],
  ['ana-sayfa',     'https://www.tbf.org.tr/']
];
const ARACILAR = [
  ['allorigins', (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u)],
  ['codetabs',   (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u)],
  ['jina',       (u) => 'https://r.jina.ai/' + u],
  ['thingproxy', (u) => 'https://thingproxy.freeboard.io/fetch/' + u]
];

async function dene(etiket, url, baslik) {
  const t0 = Date.now();
  try {
    const y = await fetch(url, { headers: baslik || {}, signal: AbortSignal.timeout(20000) });
    const m = await y.text();
    let adet = '-';
    try {
      const j = JSON.parse(m);
      const d = Array.isArray(j) ? j : (j.data || j.result || null);
      if (Array.isArray(d)) adet = d.length;
      else if (d && d.ligIsmi) adet = 'lig:' + d.ligIsmi;
    } catch (_) {}
    console.log('  ' + etiket.padEnd(28) + ' HTTP ' + y.status +
      '  ' + String(m.length).padStart(7) + ' bayt  adet=' + adet +
      '  ' + (Date.now() - t0) + 'ms');
    console.log('      bas: ' + m.slice(0, 110).replace(/\s+/g, ' '));
    return y.ok;
  } catch (e) {
    console.log('  ' + etiket.padEnd(28) + ' HATA ' + (e.message || e));
    return false;
  }
}
async function calistir() {
  console.log('=== TBF DOGRUDAN ERISIM ===');
  for (const [ad, url] of HEDEFLER) {
    console.log('- ' + ad);
    for (const p of PROFILLER) {
      await dene(p.ad, url, p.baslik);
      await new Promise(r => setTimeout(r, 400));
    }
  }

  console.log('');
  console.log('=== TBF ARACI SUNUCU UZERINDEN ===');
  const hedef = HEDEFLER[0][1];
  for (const [ad, kur] of ARACILAR) {
    await dene(ad, kur(hedef), { 'User-Agent': TARAYICI });
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('');
  console.log('=== TVF (voleybol) ===');
  await dene('tvf-ana', 'https://tvf.org.tr/', { 'User-Agent': TARAYICI });
  await dene('tvf-efeler', 'https://tvf.org.tr/lig/efeler-ligi', { 'User-Agent': TARAYICI });

  console.log('');
  console.log('=== WIKIDATA (kunye) ===');
  await dene('wikidata-arama',
    'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=tr&type=item&limit=3&search=Galatasaray',
    { 'User-Agent': 'MacVakti/1.0 (tani)' });
}

calistir().catch(e => { console.error('COKTU: ' + e.message); });
