// voleybol-tvf.js — TVF lig fikstür sayfaları (Laravel/Livewire, sunucu render).
//
// NOT: 23.08.2026 itibarıyla lig sezonu başlamadığı için sayfalar
// "Bu lig için yayınlanmış maç bulunmamaktadır" diyor. Ayrıştırıcı sezon
// açılınca devreye girer; boş sayfa hata değil, normal durumdur.

'use strict';
const O = require('../ortak');

const KOK = 'https://tvf.org.tr/lig-fikstur/';

// Hucre siniri isareti
const AYRAC = '\u0001';

const LIGLER = [
  { slug: 'efeler-ligi',      ad: 'Efeler Ligi'      },
  { slug: 'sultanlar-ligi',   ad: 'Sultanlar Ligi'   },
  { slug: 'erkekler-1-ligi',  ad: 'Erkekler 1. Ligi' },
  { slug: 'kadinlar-1-ligi',  ad: 'Kadınlar 1. Ligi' }
];

const AYLAR = {
  'ocak':1,'şubat':2,'subat':2,'mart':3,'nisan':4,'mayıs':5,'mayis':5,'haziran':6,
  'temmuz':7,'ağustos':8,'agustos':8,'eylül':9,'eylul':9,'ekim':10,'kasım':11,'kasim':11,'aralık':12,'aralik':12
};

function htmlToMetin(html) {
  let s = String(html);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<\/(div|td|th|li|p|span)>/gi, AYRAC).replace(/<\/(tr|section|article)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
       .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&[a-z]+;/gi, ' ');
  return s.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n');
}

/** "12 Ekim 2026" veya "12.10.2026" -> {yil, ay, gun} */
function tarihCoz(s) {
  const nokta = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (nokta) return { gun: +nokta[1], ay: +nokta[2], yil: +nokta[3] };
  const yazi = s.match(/(\d{1,2})\s+([\p{L}]+)\s+(\d{4})/u);
  if (yazi) {
    const ay = AYLAR[yazi[2].toLocaleLowerCase('tr-TR')];
    if (ay) return { gun: +yazi[1], ay, yil: +yazi[3] };
  }
  return null;
}

function sayfayiAyristir(html, lig) {
  const metin = htmlToMetin(html);
  if (/yayınlanmış maç bulunmamaktadır|karşılaşmalar burada görünecek/i.test(metin)) {
    return []; // sezon henüz açılmamış
  }

  const maclar = [];
  const gorulen = new Set();
  const satirlar = metin.split('\n');

  for (const satir of satirlar) {
    const t = tarihCoz(satir);
    if (!t) continue;
    const sm = satir.match(/(\d{1,2}):(\d{2})/);
    if (!sm) continue;

    // Ayraçlı hücrelerden takım adlarını çıkar
    const parcalar = satir.split(AYRAC).map(x => x.trim()).filter(Boolean);
    const adaylar = parcalar.filter(p =>
      p.length > 2 &&
      !/^\d/.test(p) &&
      !/\d{1,2}:\d{2}/.test(p) &&
      !/salon|hafta|lig|tarih|saat|tv/i.test(p)
    );
    if (adaylar.length < 2) continue;

    const ev = O.takimAdiSadelestir(adaylar[0]);
    const dep = O.takimAdiSadelestir(adaylar[1]);
    if (!ev || !dep) continue;

    const baslangic = O.trSaatiniUtcYap(t.yil, t.ay, t.gun, +sm[1], +sm[2]);
    const kimlik = (t.yil + '' + t.ay + t.gun + ev + dep).replace(/[^\p{L}\p{N}]/gu, '').toLocaleLowerCase('tr-TR');
    if (gorulen.has(kimlik)) continue;
    gorulen.add(kimlik);

    // Kanal: satırda geçen bilinen yayıncı adı
    const kanalEsles = satir.match(/(TVF\s*Voleybol\s*TV|beIN\s*Sports[^\s]*\s*\d?|TRT\s*Spor\d?|S\s*Sport\s*\d?|Tabii\s*\d?)/i);
    const kanallar = kanalEsles ? [kanalEsles[1].replace(/\s+/g, ' ').trim()] : [];

    // Set skoru (ör. 3-1)
    const skor = satir.match(/\b([0-3])\s*-\s*([0-3])\b/);

    maclar.push(O.macOlustur({
      id: 'voleybol:tvf:' + lig.slug + ':' + kimlik.slice(0, 40),
      brans: 'voleybol',
      lig: lig.ad,
      ligId: lig.slug,
      baslangicUtc: baslangic,
      evSahibi: ev,
      deplasman: dep,
      durum: skor ? O.DURUM.BITTI : O.DURUM.BEKLIYOR,
      skorEv: skor ? +skor[1] : null,
      skorDep: skor ? +skor[2] : null,
      kanallar,
      kanalKaynak: kanallar.length ? 'kaynak' : '',
      kaynak: 'tvf'
    }));
  }
  return maclar;
}

async function ligiTopla(lig) {
  const html = await O.getir(KOK + lig.slug, {
    gecerliMi: (h) => /lig|ma\u00e7|fikst/i.test(h)
  });
  return sayfayiAyristir(html, lig);
}

async function topla(ligler = LIGLER) {
  const hepsi = [];
  for (const lig of ligler) {
    try {
      hepsi.push(...await ligiTopla(lig));
    } catch (e) {
      console.error('[tvf] ' + lig.ad + ' alınamadı: ' + e.message);
    }
    await O.uyu(600);
  }
  return hepsi;
}

module.exports = { topla, ligiTopla, sayfayiAyristir, LIGLER, _KOK: KOK };
