// ortak.js — Tüm branşların ortak veri biçimi ve yardımcıları.
// Hiçbir kaynağa bağımlı değildir; kaynaklar bu biçime dönüşür.

'use strict';

const BRANSLAR = ['futbol', 'basketbol', 'voleybol', 'hentbol'];

// Maç durumları (kaynaktan bağımsız, tek dil)
const DURUM = {
  BEKLIYOR: 'bekliyor',   // henüz oynanmadı
  CANLI: 'canli',
  BITTI: 'bitti',
  ERTELENDI: 'ertelendi',
  IPTAL: 'iptal',
  BILINMIYOR: 'bilinmiyor'
};

/**
 * Ortak maç nesnesi. Her kaynak toplayıcısı BUNU üretir.
 * Uygulama ve bildirim sistemi yalnızca bu biçimi tanır.
 */
function macOlustur(g) {
  return {
    id: g.id,                          // "futbol:tff:12345" — kaynak dahil benzersiz
    brans: g.brans,
    lig: g.lig || '',
    ligId: g.ligId || '',
    sezon: g.sezon || '',
    hafta: g.hafta || '',
    baslangicUtc: g.baslangicUtc,      // ISO-8601, UTC. Tek doğruluk kaynağı.
    evSahibi: g.evSahibi,
    deplasman: g.deplasman,
    mekan: g.mekan || '',
    sehir: g.sehir || '',
    hakem: g.hakem || '',
    durum: g.durum || DURUM.BILINMIYOR,
    skorEv: g.skorEv ?? null,
    skorDep: g.skorDep ?? null,
    kanallar: g.kanallar || [],        // ["beIN Sports 1"] — asla logo, sadece ad
    kanalKaynak: g.kanalKaynak || '',  // 'elle' | 'yayin-akisi' | 'kaynak' | 'kural'
    kanalGuven: g.kanalGuven ?? 0,     // 0-100, yayin akisindan dogrulama puani
    kanalDogrulayan: g.kanalDogrulayan ?? 0, // kac bagimsiz kaynak dogruladi
    dijitalYayin: !!g.dijitalYayin,    // yalnizca dijital platformda mi
    kadroHazir: !!g.kadroHazir,
    kadrolar: g.kadrolar || null,
    guncellendi: g.guncellendi || new Date().toISOString(),
    kaynak: g.kaynak                   // 'tff' | 'tbf' | 'thf' | 'tvf'
  };
}

/**
 * Türkiye saatiyle verilen tarih+saati UTC ISO'ya çevirir.
 * Türkiye 2016'dan beri kalıcı UTC+3, yaz saati uygulaması YOK.
 * Bu yüzden sabit ofset güvenlidir.
 */
function trSaatiniUtcYap(yil, ay, gun, saat, dakika) {
  return new Date(Date.UTC(yil, ay - 1, gun, saat - 3, dakika || 0)).toISOString();
}

/** "21.08.2026" + "21:30" -> UTC ISO */
function trTarihSaatToUtc(tarihStr, saatStr) {
  const t = String(tarihStr).match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (!t) return null;
  const s = String(saatStr || '00:00').match(/(\d{1,2}):(\d{2})/);
  const saat = s ? +s[1] : 0;
  const dk = s ? +s[2] : 0;
  return trSaatiniUtcYap(+t[3], +t[2], +t[1], saat, dk);
}

/**
 * "2026-08-23T19:00:00" gibi ofsetsiz yerel damgaları UTC'ye çevirir.
 * Ofset zaten varsa (Z veya +03:00) olduğu gibi normalize edilir.
 */
function yerelDamgaToUtc(s) {
  if (!s) return null;
  const str = String(s);
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(str)) return new Date(str).toISOString();
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  return trSaatiniUtcYap(+m[1], +m[2], +m[3], +m[4], +m[5]);
}

/** Takım adlarını sadeleştirir: "TRABZONSPOR A.Ş." -> "Trabzonspor" */
function takimAdiSadelestir(ad) {
  if (!ad) return '';
  let s = String(ad).trim();
  // Hukuki ve kurumsal ekleri sondan temizle (birden fazla olabilir)
  const EKLER = /\s+(A\.?\s?Ş\.?|ANONİM ŞİRKETİ|FUTBOL KULÜBÜ|SPOR KULÜBÜ|KULÜBÜ|S\.?K\.?|F\.?K\.?|A\.?O\.?)\s*$/i;
  for (let i = 0; i < 4; i++) {
    const y = s.replace(EKLER, '');
    if (y === s) break;
    s = y;
  }
  s = s.replace(/\s{2,}/g, ' ').trim();
  return buyukHarfDuzelt(s);
}

/** TÜMÜ BÜYÜK yazılmış adları düzgün başlık biçimine çevirir (Türkçe uyumlu) */
function buyukHarfDuzelt(s) {
  if (!s) return '';
  if (s !== s.toLocaleUpperCase('tr-TR')) return s; // zaten karışık, dokunma
  return s.toLocaleLowerCase('tr-TR').replace(/(^|[\s\-\.\(])([\p{L}])/gu,
    (_, o, h) => o + h.toLocaleUpperCase('tr-TR'));
}

/**
 * Sponsor adlarını takım adından ayıklar.
 * "ZECORNER KAYSERİSPOR" -> "Kayserispor", "TÜMOSAN KONYASPOR" -> "Konyaspor"
 * Kural: bilinen çekirdek adı içeriyorsa ondan başlat.
 */
function sponsorTemizle(ad, cekirdekler) {
  const s = takimAdiSadelestir(ad);
  if (!cekirdekler || !cekirdekler.length) return s;
  const dus = s.toLocaleLowerCase('tr-TR');
  // En erken konumda gecen cekirdegi bul; sponsor onekini at, gerisini koru.
  // "Arca Corum Fk" -> "Corum Fk", "Zecorner Kayserispor" -> "Kayserispor"
  let enIyi = -1;
  for (const c of cekirdekler) {
    const i = dus.indexOf(c.toLocaleLowerCase('tr-TR'));
    if (i >= 0 && (enIyi < 0 || i < enIyi)) enIyi = i;
  }
  if (enIyi > 0) return s.slice(enIyi).trim();
  return s;
}

/** Maçın değişip değişmediğini anlamak için parmak izi. */
function parmakIzi(mac) {
  return [
    mac.baslangicUtc,
    mac.durum,
    (mac.kanallar || []).join('|'),
    mac.skorEv, mac.skorDep,
    mac.mekan,
    mac.dijitalYayin ? 1 : 0,
    mac.kadroHazir ? 1 : 0
  ].join('~');
}

/** Aynı maçın iki hâlini karşılaştırıp anlamlı değişiklikleri döndürür. */
function degisiklikBul(eski, yeni) {
  if (!eski) return [{ tip: 'yeni' }];
  const d = [];
  if (eski.baslangicUtc !== yeni.baslangicUtc) {
    d.push({ tip: 'saat', eski: eski.baslangicUtc, yeni: yeni.baslangicUtc });
  }
  const ek = (eski.kanallar || []).join(', ');
  const yk = (yeni.kanallar || []).join(', ');
  if (ek !== yk && yk) d.push({ tip: 'kanal', eski: ek, yeni: yk });
  if (eski.durum !== yeni.durum) {
    if (yeni.durum === DURUM.ERTELENDI) d.push({ tip: 'ertelendi' });
    else if (yeni.durum === DURUM.IPTAL) d.push({ tip: 'iptal' });
    else if (yeni.durum === DURUM.BITTI) d.push({ tip: 'bitti' });
    else if (yeni.durum === DURUM.CANLI) d.push({ tip: 'basladi' });
  }
  if (!eski.kadroHazir && yeni.kadroHazir) d.push({ tip: 'kadro' });
  return d;
}

/** Ağ isteği: nazik davranır, yeniden dener, kaynağı yormaz. */
async function getir(url, secenek = {}) {
  const {
    deneme = 3,
    bekleme = 1500,
    basliklar = {},
    tur = 'text',
    zamanAsimi = 25000
  } = secenek;

  let sonHata;
  for (let i = 0; i < deneme; i++) {
    try {
      const kontrol = new AbortController();
      const zt = setTimeout(() => kontrol.abort(), zamanAsimi);
      const y = await fetch(url, {
        signal: kontrol.signal,
        headers: {
          'User-Agent': 'MacVakti/1.0 (fikstur bilgilendirme uygulamasi)',
          'Accept-Language': 'tr-TR,tr;q=0.9',
          ...basliklar
        }
      });
      clearTimeout(zt);
      if (!y.ok) throw new Error('HTTP ' + y.status);
      return tur === 'json' ? await y.json() : await y.text();
    } catch (e) {
      sonHata = e;
      if (i < deneme - 1) await uyu(bekleme * (i + 1));
    }
  }
  throw new Error('Getirilemedi: ' + url + ' — ' + sonHata.message);
}

const uyu = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
  BRANSLAR, DURUM,
  macOlustur, trSaatiniUtcYap, trTarihSaatToUtc, yerelDamgaToUtc,
  takimAdiSadelestir, buyukHarfDuzelt, sponsorTemizle,
  parmakIzi, degisiklikBul, getir, uyu
};
