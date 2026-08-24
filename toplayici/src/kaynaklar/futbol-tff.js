// futbol-tff.js — TFF fikstür sayfaları (tff.org).
//
// NEDEN AKIŞ TABANLI:
// Sayfada iç içe tablolar var; bir maç satırının hücreleri kendi içlerinde
// ayrı tablolar barındırdığı için satır (<tr>) sınırları maçı ORTADAN böler.
// Bu yüzden HTML'i tek bir metin akışına indirger, maçları akış içinde
// desenle yakalarız. Tasarım değişse de düzen korunduğu sürece çalışır.
// (Canlı doğrulandı: 2026-2027 2. Hafta, 9 maçın 9'u eksiksiz.)

'use strict';
const O = require('../ortak');

const KOK = 'https://www.tff.org/Default.aspx';

// pageID'ler canlı doğrulandı (24.08.2026): her biri o ligin
// "Puan Cetveli ve Fikstür" sayfasıdır ve aynı desenle ayrıştırılır.
const LIGLER = [
  { id: '198',  ad: 'Süper Lig',              kisa: 'SL'  },
  { id: '142',  ad: '1. Lig',                 kisa: '1L'  },
  { id: '976',  ad: '2. Lig',                 kisa: '2L'  },
  { id: '971',  ad: '3. Lig',                 kisa: '3L'  },
  { id: '1000', ad: 'Kadın Futbol Süper Ligi', kisa: 'KSL' }
];

const CEKIRDEK_ADLAR = [
  'Galatasaray','Fenerbahçe','Beşiktaş','Trabzonspor','Başakşehir','Konyaspor',
  'Kayserispor','Alanyaspor','Antalyaspor','Rizespor','Samsunspor','Göztepe',
  'Gaziantep','Kasımpaşa','Eyüpspor','Gençlerbirliği','Kocaelispor','Karagümrük',
  'Erzurumspor','Çorum','Bodrum','Sakaryaspor','Manisa','Ankaragücü','Boluspor',
  'Adana Demirspor','Ümraniyespor','Keçiörengücü','Pendikspor','İstanbulspor',
  'Şanlıurfaspor','Amed','Esenler','Sivasspor','Hatayspor','Giresunspor','Iğdır',
  'Vanspor','Bandırmaspor','Serikspor','Somaspor','Altınordu','Menemen','Kepez'
];

/** HTML'i tek satırlık düz metin akışına indirger. */
function htmlToAkis(html) {
  let s = String(html);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
       .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // ASP.NET ViewState gibi gizli alanlar metne karışmasın
  s = s.replace(/<input[^>]*>/gi, ' ')
       .replace(/<textarea[\s\S]*?<\/textarea>/gi, ' ')
       .replace(/<select[\s\S]*?<\/select>/gi, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/gi, ' ')
       .replace(/&amp;/gi, '&')
       .replace(/&quot;/gi, '"')
       .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
       .replace(/&[a-z]+;/gi, ' ');
  s = s.replace(/ /g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// Maç deseni: TARİH SAAT EV SKOR DEPLASMAN "Detaylar"
// "Detaylar" bağlantı metni, deplasman adının nerede bittiğini belirler.
const MAC_DESENI =
  /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})\s+(.+?)\s+(\d+\s*-\s*\d+|-)\s+(.+?)\s+Detaylar/g;

function skorAyir(s) {
  if (!s || s.trim() === '-') return { ev: null, dep: null, oynandi: false };
  const m = s.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return { ev: null, dep: null, oynandi: false };
  return { ev: +m[1], dep: +m[2], oynandi: true };
}

function sayfayiAyristir(html, lig) {
  const akis = htmlToAkis(html);

  let hafta = '';
  const hm = akis.match(/(\d+)\s*\.\s*Hafta/);
  if (hm) hafta = hm[1] + '. Hafta';

  let sezon = '';
  const sm = akis.match(/(\d{4})\s*-\s*(\d{4})\s*Sezonu/);
  if (sm) sezon = sm[1] + '-' + sm[2];

  // 2. ve 3. Lig gruplara ayrılır; sayfada gösterilen grubu yakala.
  let grup = '';
  const gm = akis.match(/(\d+)\s*\.\s*Grup/);
  if (gm) grup = gm[1] + '. Grup';

  const maclar = [];
  const gorulen = new Set();

  MAC_DESENI.lastIndex = 0;
  let m;
  while ((m = MAC_DESENI.exec(akis)) !== null) {
    const [, gun, ay, yil, saat, dk, evHam, skorHam, depHam] = m;

    const ev = O.sponsorTemizle(evHam, CEKIRDEK_ADLAR);
    const dep = O.sponsorTemizle(depHam, CEKIRDEK_ADLAR);
    if (!ev || !dep || ev.length < 2 || dep.length < 2) continue;
    if (/hafta|puan|toplam|sıralama/i.test(ev)) continue;

    const baslangicUtc = O.trSaatiniUtcYap(+yil, +ay, +gun, +saat, +dk);
    const sk = skorAyir(skorHam);

    // Kaynakta maç kimliği yok; tarih + takımlardan kararlı kimlik türetilir.
    const kimlik = (yil + ay + gun + ev + dep + (grup || ''))
      .replace(/[^\p{L}\p{N}]/gu, '').toLocaleLowerCase('tr-TR');
    if (gorulen.has(kimlik)) continue;
    gorulen.add(kimlik);

    maclar.push(O.macOlustur({
      id: 'futbol:tff:' + lig.kisa + ':' + kimlik.slice(0, 44),
      brans: 'futbol',
      lig: grup ? (lig.ad + ' ' + grup) : lig.ad,
      ligId: lig.id + (grup ? '-' + gm[1] : ''),
      sezon,
      hafta,
      baslangicUtc,
      evSahibi: ev,
      deplasman: dep,
      durum: sk.oynandi ? O.DURUM.BITTI : O.DURUM.BEKLIYOR,
      skorEv: sk.ev,
      skorDep: sk.dep,
      kanallar: [],           // TFF kanal vermiyor -> kanal.js dolduracak
      kaynak: 'tff'
    }));
  }
  return maclar;
}

/** Belirli bir haftayı çeker (hafta verilmezse güncel hafta gelir). */
async function ligiTopla(lig, hafta) {
  let url = KOK + '?pageID=' + lig.id;
  if (hafta) url += '&hafta=' + hafta;
  const html = await O.getir(url, {
    // Gelen sayfa gerçekten fikstür sayfası mı? Koruma/hata sayfalarını ele.
    gecerliMi: (h) => /Detaylar/i.test(h) && /\d{2}\.\d{2}\.\d{4}/.test(h)
  });
  return sayfayiAyristir(html, lig);
}

/**
 * Bir ligin birden çok haftasını tarar.
 * TFF varsayılan olarak güncel haftayı gösterir; ileriyi görmek için
 * hafta parametresi denenir. Desteklenmiyorsa güncel hafta döner.
 */
async function ligiGenisTopla(lig, haftaSayisi = 2) {
  const hepsi = new Map();
  const guncel = await ligiTopla(lig);
  for (const m of guncel) hepsi.set(m.id, m);

  const hm = guncel.length && guncel[0].hafta && guncel[0].hafta.match(/(\d+)/);
  const baslangicHafta = hm ? +hm[1] : null;

  if (baslangicHafta) {
    for (let h = baslangicHafta + 1; h <= baslangicHafta + haftaSayisi; h++) {
      try {
        const ek = await ligiTopla(lig, h);
        let yeni = 0;
        for (const m of ek) if (!hepsi.has(m.id)) { hepsi.set(m.id, m); yeni++; }
        if (!yeni) break; // hafta parametresi işlemiyor, boşuna isteme
        await O.uyu(500);
      } catch (_) { break; }
    }
  }
  return [...hepsi.values()];
}

async function topla(ligler = LIGLER) {
  // Ligler ikişerli gruplar hâlinde paralel çekilir: hem hızlı hem kaynağa nazik.
  const hepsi = [];
  for (let i = 0; i < ligler.length; i += 2) {
    const grup = ligler.slice(i, i + 2);
    const sonuclar = await Promise.allSettled(grup.map(l => ligiGenisTopla(l)));
    sonuclar.forEach((s, j) => {
      if (s.status === 'fulfilled') hepsi.push(...s.value);
      else console.error('[tff] ' + grup[j].ad + ' alınamadı: ' + s.reason.message);
    });
    if (i + 2 < ligler.length) await O.uyu(500);
  }
  return hepsi;
}

module.exports = {
  topla, ligiTopla, ligiGenisTopla, sayfayiAyristir, htmlToAkis,
  LIGLER, CEKIRDEK_ADLAR, _KOK: KOK
};
