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

function sayfayiAyristir(html, lig, grupEtiket) {
  const akis = htmlToAkis(html);

  let hafta = '';
  const hm = akis.match(/(\d+)\s*\.\s*Hafta/);
  if (hm) hafta = hm[1] + '. Hafta';

  let sezon = '';
  const sm = akis.match(/(\d{4})\s*-\s*(\d{4})\s*Sezonu/);
  if (sm) sezon = sm[1] + '-' + sm[2];

  // 2. ve 3. Lig gruplara ayrılır; sayfada gösterilen grubu yakala.
  // Yalnizca gercekten gruplara ayrilan ligler icin grup etiketi kullan.
  // Super Lig ve 1. Lig tek gruptur; oralarda 'Grup' kelimesi sayfanin
  // baska bir yerinden (menu, arsiv) sizabilir ve yanlis etiket uretir.
  // Grup etiketi: cagiran biliyorsa onu kullan (en guvenilir).
  // Bilmiyorsa sayfadan cikarmayi dene. TFF gruplari "Beyaz/Kirmizi"
  // ya da "01/02/03" gibi adlandirir; sayisal varsayim yapilmaz.
  let grup = '';
  if (grupEtiket) {
    grup = String(grupEtiket).trim();
  } else if (lig.kisa === '2L' || lig.kisa === '3L') {
    const gm = akis.match(/Gruplar:\s*([^\n\t]{1,40})/);
    if (gm) grup = gm[1].trim().split(/\s+/)[0];
  }

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
      lig: grup ? (lig.ad + ' ' + grup + ' Grubu') : lig.ad,
      ligId: lig.id + (grup ? '-' + grup.replace(/[^A-Za-z0-9]/g, '') : ''),
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

const GECERLI_FIKSTUR = (h) => /Detaylar/i.test(h) && /\d{2}\.\d{2}\.\d{4}/.test(h);

function ligUrl(lig, hafta, grupId) {
  let url = KOK + '?pageID=' + lig.id;
  if (grupId) url += '&grupID=' + grupId;
  if (hafta) url += '&hafta=' + hafta;
  return url;
}

/**
 * Bir ligin GRUPLARINI kesfeder.
 * 2. Lig "Beyaz/Kirmizi", 3. Lig "01/02/03" gibi adlandirir; sayisal
 * varsayim yapmayiz, sayfadaki baglantilardan okuruz. Grup yoksa
 * tek elemanli liste doner ve akis degismez.
 */
async function gruplariBul(lig) {
  let html;
  try {
    html = await O.getir(ligUrl(lig), { gecerliMi: GECERLI_FIKSTUR });
  } catch (e) {
    console.error('[tff] ' + lig.ad + ' grup listesi alinamadi: ' + e.message);
    return [{ id: null, etiket: '' }];
  }
  const bulunan = new Map();
  const desen = /grupID=(\d+)[^>]*>\s*([^<>\n]{1,24}?)\s*</g;
  let m;
  while ((m = desen.exec(html))) {
    const id = m[1], etiket = m[2].trim();
    if (!etiket || /^\d{1,2}$/.test(etiket) && etiket.length > 2) continue;
    if (!bulunan.has(id)) bulunan.set(id, etiket);
  }
  if (!bulunan.size) return [{ id: null, etiket: '' }];
  const liste = [...bulunan.entries()].map(([id, etiket]) => ({ id, etiket }));
  console.log('[tff] ' + lig.ad + ': ' + liste.length + ' grup (' +
    liste.map(g => g.etiket).join(', ') + ')');
  return liste;
}

/** Belirli bir haftayı/grubu çeker (hafta verilmezse güncel hafta gelir). */
async function ligiTopla(lig, hafta, grup) {
  const g = grup || {};
  const html = await O.getir(ligUrl(lig, hafta, g.id), { gecerliMi: GECERLI_FIKSTUR });
  return sayfayiAyristir(html, lig, g.etiket);
}

/**
 * Bir ligin birden çok haftasını tarar.
 * TFF varsayılan olarak güncel haftayı gösterir; ileriyi görmek için
 * hafta parametresi denenir. Desteklenmiyorsa güncel hafta döner.
 */
async function ligiGenisTopla(lig, haftaSayisi = 2) {
  const gruplar = await gruplariBul(lig);
  const hepsi = new Map();

  for (const grup of gruplar) {
    let guncel = [];
    try {
      guncel = await ligiTopla(lig, null, grup);
    } catch (e) {
      console.error('[tff] ' + lig.ad + ' ' + (grup.etiket || '') +
        ' alinamadi: ' + e.message);
      continue;
    }
    for (const m of guncel) hepsi.set(m.id, m);

    const hm = guncel.length && guncel[0].hafta && guncel[0].hafta.match(/(\d+)/);
    const bas = hm ? +hm[1] : null;
    if (bas) {
      for (let h = bas + 1; h <= bas + haftaSayisi; h++) {
        try {
          const ek = await ligiTopla(lig, h, grup);
          let yeni = 0;
          for (const m of ek) if (!hepsi.has(m.id)) { hepsi.set(m.id, m); yeni++; }
          if (!yeni) break;
          await O.uyu(400);
        } catch (_) { break; }
      }
    }
    await O.uyu(400);
  }
  return [...hepsi.values()];
}

/**
 * KULUP KUTUGU: her grubun ilk iki haftasi o gruptaki TUM takimlari
 * icerir (tek devrede her takim bir kez oynar; tek sayili gruplarda
 * bir takim bay gecer, ikinci hafta onu da yakalar).
 * Boylece fikstur yayinlanmamis olsa bile kulup listesi tam olur.
 */
async function kulupleriTopla(ligler = LIGLER) {
  const sonuc = [];
  for (const lig of ligler) {
    const gruplar = await gruplariBul(lig);
    for (const grup of gruplar) {
      const takimlar = new Set();
      for (const hafta of [1, 2]) {
        try {
          const maclar = await ligiTopla(lig, hafta, grup);
          for (const m of maclar) {
            if (m.evSahibi) takimlar.add(m.evSahibi);
            if (m.deplasman) takimlar.add(m.deplasman);
          }
        } catch (e) {
          console.error('[tff] kulup: ' + lig.ad + ' ' + (grup.etiket || '') +
            ' h' + hafta + ' alinamadi: ' + e.message);
        }
        await O.uyu(350);
      }
      if (takimlar.size) {
        const ad = grup.etiket ? lig.ad + ' ' + grup.etiket + ' Grubu' : lig.ad;
        const id = lig.id + (grup.etiket ? '-' + grup.etiket.replace(/[^A-Za-z0-9]/g, '') : '');
        sonuc.push({ brans: 'futbol', ligId: id, lig: ad, takimlar: [...takimlar].sort() });
        console.log('[tff] kulup: ' + ad + ' -> ' + takimlar.size + ' takim');
      }
    }
  }
  return sonuc;
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
  topla, ligiTopla, ligiGenisTopla, kulupleriTopla, gruplariBul,
  sayfayiAyristir, htmlToAkis,
  LIGLER, CEKIRDEK_ADLAR, _KOK: KOK
};
