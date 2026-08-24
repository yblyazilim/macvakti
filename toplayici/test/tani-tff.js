// tani-yayin.js - Yayin akisi kaynaklarina erisim tanisi.
// Digiturk ve Turkcell TV+ yurt disi sunuculardan nasil davraniyor?
'use strict';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
const DIGI = 'https://www.digiturk.com.tr/Ajax/GetTvGuideFromDigiturk?Day=' + encodeURIComponent('08/24/2026 00:00:00');
const TVPLUS = 'https://izmaottvsc14.tvplus.com.tr:33207/EPG/JSON/';

async function dene(ad, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    console.log('  OK  ' + ad + '  ->  ' + JSON.stringify(r) + '  (' + (Date.now()-t0) + ' ms)');
  } catch (e) {
    console.log('  HATA ' + ad + '  ->  ' + String(e.message || e).slice(0,160) + '  (' + (Date.now()-t0) + ' ms)');
  }
}

function ozetHtml(t) {
  return { bayt: t.length, kanalBlok: (t.match(/channelDetail/g) || []).length };
}

async function calistir() {
  console.log('=== DIGITURK ===');
  await dene('dogrudan', async () => {
    const y = await fetch(DIGI, { headers: { 'X-Requested-With':'XMLHttpRequest', 'User-Agent':UA }, signal: AbortSignal.timeout(40000) });
    return { http: y.status, ...ozetHtml(await y.text()) };
  });
  await dene('http', async () => {
    const y = await fetch(DIGI.replace('https://','http://'), { headers: { 'X-Requested-With':'XMLHttpRequest', 'User-Agent':UA }, signal: AbortSignal.timeout(40000) });
    return { http: y.status, ...ozetHtml(await y.text()) };
  });
  await dene('allorigins', async () => {
    const y = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(DIGI), { signal: AbortSignal.timeout(60000) });
    return { http: y.status, ...ozetHtml(await y.text()) };
  });
  await dene('codetabs', async () => {
    const y = await fetch('https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(DIGI), { signal: AbortSignal.timeout(60000) });
    return { http: y.status, ...ozetHtml(await y.text()) };
  });

  console.log('');
  console.log('=== TURKCELL TV+ ===');
  await dene('Authenticate dogrudan', async () => {
    const y = await fetch(TVPLUS + 'Authenticate', { method:'POST', headers:{'Content-Type':'application/json','User-Agent':UA},
      body: JSON.stringify({terminaltype:'webtv',terminalvendor:'5.0',osversion:'Win32',userType:'3',utcEnable:'1',timezone:'Europe/Istanbul'}),
      signal: AbortSignal.timeout(30000) });
    const t = await y.text();
    return { http: y.status, bayt: t.length, cerezVar: !!(y.headers.getSetCookie && y.headers.getSetCookie().length) };
  });

  console.log('');
  console.log('=== TBF (basketbol) ===');
  await dene('dogrudan', async () => {
    const y = await fetch('https://www.tbf.org.tr/api/Match/get-daily-matches?MatchDate=2026-08-24T00:00:00.000Z&', { headers:{'User-Agent':UA}, signal: AbortSignal.timeout(30000) });
    const t = await y.text();
    return { http: y.status, bayt: t.length, jsonMu: t.trim().startsWith('{') };
  });
  await dene('allorigins', async () => {
    const y = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.tbf.org.tr/api/Match/get-daily-matches?MatchDate=2026-08-24T00:00:00.000Z&'), { signal: AbortSignal.timeout(45000) });
    const t = await y.text();
    let grup = null; try { grup = (JSON.parse(t).data || []).length; } catch(_) {}
    return { http: y.status, bayt: t.length, jsonMu: t.trim().startsWith('{'), grup };
  });
}

calistir().catch(e => { console.error(e); process.exit(1); });
