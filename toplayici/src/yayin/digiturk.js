// digiturk.js — Digiturk yayın akışı (Ajax uç noktası).
// beIN Sports ailesi, TRT Spor, A Spor, Eurosport, EKOL Sports kapsar.
// Bağımlılık yok: HTML düzenli ifadeyle ayrıştırılır.

'use strict';
const O = require('../ortak');
const Y = require('./yayin-ortak');

const KOK = 'https://www.digiturk.com.tr/Ajax/GetTvGuideFromDigiturk';

// Kanal kimlikleri canlı doğrulandı (24.08.2026).
const KANALLAR = {
  '193': { ad: 'beIN Sports 1',     dijital: false },
  '310': { ad: 'beIN Sports 2',     dijital: false },
  '312': { ad: 'beIN Sports 3',     dijital: false },
  '495': { ad: 'beIN Sports 4',     dijital: false },
  '506': { ad: 'beIN Sports 5',     dijital: false },
  '507': { ad: 'beIN Sports MAX 1', dijital: false },
  '508': { ad: 'beIN Sports MAX 2', dijital: false },
  '541': { ad: 'beIN Sports Haber', dijital: false },
  '331': { ad: 'TRT Spor',          dijital: false },
  '229': { ad: 'TRT Spor',          dijital: false },
  '533': { ad: 'TRT Spor Yıldız',   dijital: false },
  '433': { ad: 'A Spor',            dijital: false },
  '313': { ad: 'Sports TV',         dijital: false },
  '550': { ad: 'EKOL Sports',       dijital: false },
  '554': { ad: 'Eurosport 1',       dijital: false },
  '555': { ad: 'Eurosport 2',       dijital: false }
};

function ggaayyyy(d) {
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getUTCMonth() + 1) + '/' + p(d.getUTCDate()) + '/' + d.getUTCFullYear();
}

/** Ajax yanıtındaki program bloklarını ayrıştırır. */
function ayristir(html, tarih) {
  const programlar = [];
  // Her .channelDetail bloğunu ayrı ele al
  const bloklar = String(html).split(/class="[^"]*channelDetail[^"]*"/i).slice(1);

  for (const blok of bloklar) {
    // Kanal kimliği başlıktaki onclick içinde: ...,193)
    const kid = blok.match(/onclick="[^"]*?[\s,(](\d+)\)/);
    if (!kid) continue;
    const kanal = KANALLAR[kid[1]];
    if (!kanal) continue;

    // Başlık metni
    const bas = blok.match(/tvGuideResult-box-wholeDates-title[^>]*>([\s\S]*?)<\/a>/i)
             || blok.match(/tvGuideResult-box-wholeDates-title[^>]*>([\s\S]*?)<\//i);
    if (!bas) continue;
    const baslik = bas[1].replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/\s+/g, ' ').trim();
    if (!baslik) continue;

    const saatM = blok.match(/tvGuideResult-box-wholeDates-time-hour[^>]*>\s*([\d]{1,2}:[\d]{2})/i);
    if (!saatM) continue;
    const sureM = blok.match(/tvGuideResult-box-wholeDates-time-totalMinute[^>]*>[\s\S]*?(\d+)/i);

    const [ss, dd] = saatM[1].split(':').map(Number);
    const baslangicUtc = O.trSaatiniUtcYap(
      tarih.getUTCFullYear(), tarih.getUTCMonth() + 1, tarih.getUTCDate(), ss, dd);

    programlar.push({
      kanal: kanal.ad,
      dijital: kanal.dijital,
      baslik,
      baslangicUtc,
      sureDk: sureM ? +sureM[1] : null,
      tur: Y.yayinTuru(baslik),
      macDisi: Y.MAC_DISI.test(baslik),
      takimlar: Y.takimlariCikar(baslik),
      kaynak: 'digiturk'
    });
  }
  return programlar;
}

/** gunSayisi kadar günün akışını getirir. */
async function topla(gunSayisi = 3) {
  const hepsi = [];
  const bugun = new Date();
  for (let i = 0; i < gunSayisi; i++) {
    const g = new Date(bugun.getTime() + i * 86400000);
    try {
      const url = KOK + '?Day=' + encodeURIComponent(ggaayyyy(g) + ' 00:00:00');
      const html = await O.getir(url, {
        basliklar: { 'X-Requested-With': 'XMLHttpRequest' },
        zamanAsimi: 40000
      });
      hepsi.push(...ayristir(html, g));
    } catch (e) {
      console.error('[digiturk] ' + ggaayyyy(g) + ' alınamadı: ' + e.message);
    }
    await O.uyu(800);
  }
  return hepsi;
}

module.exports = { topla, ayristir, KANALLAR, _KOK: KOK };
