// topla.js — Ana toplayıcı. Tüm branşları toplar, kanal atar, değişiklikleri
// tespit eder, yayınlanacak JSON dosyalarını ve bildirim kuyruğunu üretir.
//
// Kullanım:
//   node src/topla.js              -> tüm branşlar
//   node src/topla.js futbol       -> tek branş
//   node src/topla.js --kuru       -> dosyaya yazmadan dene

'use strict';
const fs = require('fs');
const path = require('path');
const O = require('./ortak');
const kanal = require('./kanal');
const metin = require('./metin');
const yayinEslestir = require('./yayin/eslestir');
const takimlar = require('./takimlar');

const KAYNAKLAR = {
  futbol:    require('./kaynaklar/futbol-tff'),
  basketbol: require('./kaynaklar/basketbol-tbf'),
  hentbol:   require('./kaynaklar/hentbol-thf'),
  voleybol:  require('./kaynaklar/voleybol-tvf')
};

const VERI_DIZIN = path.join(__dirname, '..', 'veri');

function oku(dosya, varsayilan) {
  try { return JSON.parse(fs.readFileSync(path.join(VERI_DIZIN, dosya), 'utf8')); }
  catch (_) { return varsayilan; }
}

function yaz(dosya, icerik) {
  fs.mkdirSync(VERI_DIZIN, { recursive: true });
  fs.writeFileSync(path.join(VERI_DIZIN, dosya), JSON.stringify(icerik, null, 1), 'utf8');
}

/** Bir değişiklikten bildirim üretir. */
function bildirimUret(mac, degisiklik) {
  switch (degisiklik.tip) {
    case 'saat':      return { ...metin.saatDegisti(mac, degisiklik.eski), oncelik: 'yuksek' };
    case 'kanal':     return { ...metin.kanalDegisti(mac), oncelik: 'orta' };
    case 'ertelendi': return { ...metin.ertelendi(mac), oncelik: 'yuksek' };
    case 'iptal':     return { ...metin.iptal(mac), oncelik: 'yuksek' };
    case 'kadro':     return { ...metin.kadroAcik(mac), oncelik: 'orta' };
    case 'bitti':     return { ...metin.sonuc(mac), oncelik: 'dusuk' };
    default:          return null;
  }
}

/** Bir maçın hangi FCM konularına gideceğini belirler. */
function konular(mac) {
  const k = ['brans_' + mac.brans];
  if (mac.ligId) k.push('lig_' + mac.brans + '_' + String(mac.ligId).replace(/[^\w]/g, ''));
  const t = (ad) => 'takim_' + String(ad).toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]/gu, '');
  k.push(t(mac.evSahibi), t(mac.deplasman));
  return k;
}

async function calistir(secilenBrans, kuru, atlaYayin, zorlaYayin) {
  const baslangic = Date.now();
  const branslar = secilenBrans ? [secilenBrans] : Object.keys(KAYNAKLAR);

  const oncekiler = oku('maclar.json', { maclar: [] });
  const oncekiHarita = new Map((oncekiler.maclar || []).map(m => [m.id, m]));

  const toplananlar = [];
  const rapor = {};

  for (const brans of branslar) {
    const kaynak = KAYNAKLAR[brans];
    if (!kaynak) { console.error('Bilinmeyen branş: ' + brans); continue; }
    try {
      const maclar = await kaynak.topla();
      toplananlar.push(...maclar);
      rapor[brans] = { durum: 'tamam', adet: maclar.length };
      console.log('[' + brans + '] ' + maclar.length + ' maç');
    } catch (e) {
      rapor[brans] = { durum: 'hata', mesaj: e.message };
      console.error('[' + brans + '] HATA: ' + e.message);
    }
  }

  // --- Yayın akışından kanal doğrulama ---
  // Yayıncıların kendi program akışı taranır, maçlarla eşleştirilir.
  // Bu, kanal bilgisinin tahmin değil kanıta dayanmasını sağlar.
  try {
    let programlar, kaynakBilgi;
    // Akışın tazelenmesi gerekip gerekmediğine maç takvimine bakarak karar ver.
    // Maç saati yaklaşıyorsa 15 dakikada bir, sakin dönemde 6 saatte bir.
    const karar = yayinEslestir.tazelemeGerekli(toplananlar);
    const tazele = zorlaYayin || (!atlaYayin && karar.gerekli);

    if (!tazele) {
      const o = yayinEslestir.programlariOku(12);
      programlar = o.programlar;
      kaynakBilgi = { onbellek: true, bayat: o.bayat,
                      yasDk: karar.yasDk, sebep: karar.sebep };
      console.log('[yayın] önbellekten okundu (' + karar.sebep
        + ', yaş ' + (karar.yasDk === null ? '?' : karar.yasDk) + ' dk)');
    } else {
      console.log('[yayın] akış tazeleniyor (' + karar.sebep + ')');
      const y = await yayinEslestir.programlariTopla(3);
      programlar = y.programlar;
      kaynakBilgi = y.rapor;
      if (!kuru) yayinEslestir.programlariKaydet(programlar, y.rapor);
    }

    const sonuc = yayinEslestir.maclaraUygula(toplananlar, programlar);
    rapor.yayinAkisi = {
      durum: 'tamam',
      program: programlar.length,
      eslesen: sonuc.atanan,
      caprazDogrulanan: sonuc.capraz,
      kaynaklar: kaynakBilgi
    };
    console.log('[yayın] ' + programlar.length + ' program, '
      + sonuc.atanan + ' maça kanal eşleşti'
      + (sonuc.capraz ? ' (' + sonuc.capraz + ' çapraz doğrulandı)' : ''));
  } catch (e) {
    rapor.yayinAkisi = { durum: 'hata', mesaj: e.message };
    console.error('[yayın] HATA: ' + e.message);
  }

  // Kanal ataması (dört katman: elle > yayın akışı > kaynak > kural)
  kanal.hepsineAta(toplananlar);
  const kanalOzet = kanal.ozet(toplananlar);
  rapor.kanalOzet = kanalOzet;
  console.log('[kanal] yayın akışı: ' + kanalOzet.yayinAkisi
    + ', kaynak: ' + kanalOzet.kaynak
    + ', kural: ' + kanalOzet.kural
    + ', bilinmiyor: ' + kanalOzet.yok
    + ', dijital: ' + kanalOzet.dijital);

  // Değişiklik tespiti ve bildirim kuyruğu
  const bildirimler = [];
  for (const m of toplananlar) {
    const eski = oncekiHarita.get(m.id);
    if (eski && O.parmakIzi(eski) === O.parmakIzi(m)) continue;

    const degisiklikler = O.degisiklikBul(eski, m);
    for (const d of degisiklikler) {
      if (d.tip === 'yeni') continue; // yeni maç eklenmesi bildirim değil
      const b = bildirimUret(m, d);
      if (!b) continue;
      bildirimler.push({
        macId: m.id, tip: d.tip, konular: konular(m),
        baslik: b.baslik, govde: b.govde, oncelik: b.oncelik,
        uretildi: new Date().toISOString()
      });
    }
  }

  // Zamana göre sırala
  toplananlar.sort((a, b) => a.baslangicUtc.localeCompare(b.baslangicUtc));

  const cikti = {
    guncellendi: new Date().toISOString(),
    surum: 1,
    adet: toplananlar.length,
    rapor,
    maclar: toplananlar
  };

  if (kuru) {
    console.log('\n--- KURU ÇALIŞMA (dosya yazılmadı) ---');
    console.log('Toplam maç: ' + toplananlar.length);
    console.log('Bildirim: ' + bildirimler.length);
    console.log('Kanalı eksik: ' + kanal.eksikKanallar(toplananlar).length);
    console.log(JSON.stringify(toplananlar.slice(0, 3), null, 1));
    return cikti;
  }

  yaz('maclar.json', cikti);

  // Branş bazlı dosyalar — uygulama yalnızca gerekeni indirsin
  for (const brans of Object.keys(KAYNAKLAR)) {
    const alt = toplananlar.filter(m => m.brans === brans);
    if (alt.length || !secilenBrans) {
      yaz(brans + '.json', { guncellendi: cikti.guncellendi, adet: alt.length, maclar: alt });
    }
  }

  if (bildirimler.length) {
    const kuyruk = oku('bildirim-kuyrugu.json', { bekleyen: [] });
    kuyruk.bekleyen = (kuyruk.bekleyen || []).concat(bildirimler);
    yaz('bildirim-kuyrugu.json', kuyruk);
  }

  yaz('kanal-eksikleri.json', {
    guncellendi: cikti.guncellendi,
    eksikler: kanal.eksikKanallar(toplananlar)
  });

  // Branş > lig > takım ağacı ve kulüp künyeleri.
  // Maçlar yazıldıktan SONRA çalışır; ağacı fikstürden türetiyor.
  try {
    await takimlar.calistir({ sinir: 12 });
  } catch (e) {
    console.error('[topla] takim agaci kurulamadi: ' + e.message);
  }

  const sn = ((Date.now() - baslangic) / 1000).toFixed(1);
  console.log('\nToplam ' + toplananlar.length + ' maç, ' + bildirimler.length
    + ' bildirim, ' + sn + ' sn.');
  return cikti;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const kuru = argv.includes('--kuru');
  const atlaYayin = argv.includes('--yayinsiz');
  const zorlaYayin = argv.includes('--yayinZorla');
  const brans = argv.find(a => !a.startsWith('--'));
  calistir(brans, kuru, atlaYayin, zorlaYayin)
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { calistir, konular, bildirimUret };
