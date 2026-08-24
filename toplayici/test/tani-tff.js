// tani-tff.js — TFF'ye erişim tanısı.
// GitHub Actions sunucusundan (yurt dışı) TFF'ye hangi yöntemle
// ulaşılabildiğini ölçer. Sonuca göre doğru çözüm seçilir.

'use strict';
const dns = require('dns').promises;

const HEDEF = 'https://www.tff.org/Default.aspx?pageID=198';
const HOST = 'www.tff.org';

const UA_TARAYICI = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                    '(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

function ozet(metin) {
  const macVar = /GALATASARAY|FENERBAH|TRABZON/i.test(metin);
  const tarihVar = /\d{2}\.\d{2}\.\d{4}/.test(metin);
  return { bayt: metin.length, macVar, tarihVar };
}

async function dene(ad, calistir) {
  const t0 = Date.now();
  try {
    const r = await calistir();
    console.log('  ✓ ' + ad + '  ->  ' + JSON.stringify(r) + '  (' + (Date.now() - t0) + ' ms)');
    return { ad, basarili: true, ...r };
  } catch (e) {
    console.log('  ✗ ' + ad + '  ->  ' + String(e.message || e).slice(0, 150)
      + '  (' + (Date.now() - t0) + ' ms)');
    return { ad, basarili: false, hata: String(e.message || e).slice(0, 200) };
  }
}

async function calistir() {
  console.log('=== TFF ERİŞİM TANISI ===\n');
  const sonuclar = [];

  console.log('DNS:');
  sonuclar.push(await dene('A kaydı (IPv4)', async () => {
    const a = await dns.resolve4(HOST);
    return { ip: a.slice(0, 3) };
  }));
  sonuclar.push(await dene('AAAA kaydı (IPv6)', async () => {
    const a = await dns.resolve6(HOST);
    return { ip: a.slice(0, 2) };
  }));

  console.log('\nDoğrudan istekler:');
  sonuclar.push(await dene('fetch, sade', async () => {
    const y = await fetch(HEDEF, { signal: AbortSignal.timeout(25000) });
    return { http: y.status, ...ozet(await y.text()) };
  }));

  sonuclar.push(await dene('fetch, tarayıcı User-Agent', async () => {
    const y = await fetch(HEDEF, {
      headers: {
        'User-Agent': UA_TARAYICI,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(25000)
    });
    return { http: y.status, ...ozet(await y.text()) };
  }));

  sonuclar.push(await dene('fetch, IPv4 zorlanmış', async () => {
    const { Agent, fetch: undiciFetch } = require('undici');
    const agent = new Agent({ connect: { family: 4 } });
    const y = await undiciFetch(HEDEF, {
      dispatcher: agent,
      headers: { 'User-Agent': UA_TARAYICI },
      signal: AbortSignal.timeout(25000)
    });
    return { http: y.status, ...ozet(await y.text()) };
  }));

  sonuclar.push(await dene('http (TLS yok)', async () => {
    const y = await fetch('http://www.tff.org/Default.aspx?pageID=198', {
      headers: { 'User-Agent': UA_TARAYICI },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000)
    });
    return { http: y.status, ...ozet(await y.text()) };
  }));

  console.log('\nAracı üzerinden:');
  sonuclar.push(await dene('r.jina.ai', async () => {
    const y = await fetch('https://r.jina.ai/' + HEDEF, {
      headers: { 'User-Agent': UA_TARAYICI },
      signal: AbortSignal.timeout(40000)
    });
    return { http: y.status, ...ozet(await y.text()) };
  }));

  sonuclar.push(await dene('allorigins', async () => {
    const y = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(HEDEF),
      { signal: AbortSignal.timeout(40000) });
    return { http: y.status, ...ozet(await y.text()) };
  }));

  console.log('\nKarşılaştırma (çalıştığı bilinen kaynaklar):');
  sonuclar.push(await dene('THF (hentbol)', async () => {
    const y = await fetch('https://api.thf.org.tr/api/v1/Public/GetMatchesFromYesterdayAndNextSixDays',
      { signal: AbortSignal.timeout(25000) });
    const j = await y.json();
    return { http: y.status, adet: (j.data || []).length };
  }));

  sonuclar.push(await dene('TBF (basketbol)', async () => {
    const y = await fetch('https://www.tbf.org.tr/api/Match/get-daily-matches?MatchDate=2026-08-24T00:00:00.000Z&',
      { signal: AbortSignal.timeout(25000) });
    const j = await y.json();
    return { http: y.status, grup: (j.data || []).length };
  }));

  sonuclar.push(await dene('Digiturk (yayın akışı)', async () => {
    const y = await fetch('https://www.digiturk.com.tr/Ajax/GetTvGuideFromDigiturk?Day=' +
      encodeURIComponent('08/24/2026 00:00:00'),
      { headers: { 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA_TARAYICI },
        signal: AbortSignal.timeout(40000) });
    const t = await y.text();
    return { http: y.status, bayt: t.length, kanal: (t.match(/channelDetail/g) || []).length };
  }));

  console.log('\n=== ÖZET ===');
  const calisanlar = sonuclar.filter(s => s.basarili && s.macVar);
  if (calisanlar.length) {
    console.log('TFF için çalışan yöntem(ler): ' + calisanlar.map(s => s.ad).join(', '));
  } else {
    console.log('TFF hiçbir yöntemle alınamadı.');
  }
  console.log(JSON.stringify(sonuclar, null, 1));
}

calistir().catch(e => { console.error(e); process.exit(1); });
