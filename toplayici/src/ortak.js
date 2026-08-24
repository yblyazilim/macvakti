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

/**
 * Ağ isteği — çok katmanlı yedekleme zinciriyle.
 *
 * NEDEN: Türk kaynaklarının bir kısmı yurt dışı sunuculara farklı davranıyor.
 * GitHub Actions'ta yapılan canlı tanıda (24.08.2026) şunlar ölçüldü:
 *   - tff.org      : HTTPS "fetch failed" (sertifika zinciri), HTTP 200 ✓
 *   - tbf.org.tr   : JSON yerine HTML koruma sayfası
 *   - digiturk     : 403
 *   - thf.org.tr   : sorunsuz
 * Aynı adresler Türkiye'den sorunsuz açılıyor. Bu yüzden tek bir yönteme
 * bağlanmak yerine sırayla denenen bir zincir kuruyoruz.
 *
 * Sıra: doğrudan HTTPS -> doğrudan HTTP -> genel erişim aracısı
 * Hangi katmanın işe yaradığı sonuçta bildirilir (izleme için).
 */

// --- ERİŞİM YÖNTEMİ HAFIZASI ---
// İlk çalıştırmada her katman denenir; bu pahalıdır. Hangi host'un hangi
// katmanla çalıştığı öğrenilip diske yazılır, sonraki çalıştırmalar doğrudan
// bilinen yöntemle başlar. Böylece ilk tur yavaş, sonrakiler hızlıdır.
const _fs = require('fs');
const _path = require('path');
const YONTEM_DOSYA = _path.join(__dirname, '..', 'veri', 'erisim-yontemi.json');
let _yontemler = null;

function yontemleriOku() {
  if (_yontemler) return _yontemler;
  try { _yontemler = JSON.parse(_fs.readFileSync(YONTEM_DOSYA, 'utf8')); }
  catch (_) { _yontemler = {}; }
  return _yontemler;
}

function yontemYaz(host, ad) {
  const y = yontemleriOku();
  if (y[host] && y[host].ad === ad) return;
  y[host] = { ad, ogrenildi: new Date().toISOString() };
  try {
    _fs.mkdirSync(_path.dirname(YONTEM_DOSYA), { recursive: true });
    _fs.writeFileSync(YONTEM_DOSYA, JSON.stringify(y, null, 1), 'utf8');
  } catch (_) {}
}

function hostAl(u) { try { return new URL(u).host; } catch (_) { return u; } }

// Genel erişim aracıları. Yalnızca doğrudan erişim başarısız olunca kullanılır.
const ARACILAR = [
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u)
];

const VARSAYILAN_BASLIKLAR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                '(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
};

/**
 * Ham baytlari dogru karakter kodlamasiyla metne cevirir.
 * TFF gibi bazi Turk kaynaklari UTF-8 degil windows-1254 (Latin-5) kullanir;
 * duz y.text() bunlari bozar ("Galatasaray A.S." -> bozuk karakter).
 * Sira: HTTP basligi -> HTML meta -> UTF-8 gecerlilik -> windows-1254
 */
function baytlariCoz(bayt, contentType) {
  const coz = (kod) => {
    try { return new TextDecoder(kod, { fatal: false }).decode(bayt); }
    catch (_) { return null; }
  };

  const bm = String(contentType || '').match(/charset=([\w-]+)/i);
  if (bm) { const m = coz(bm[1].toLowerCase()); if (m) return m; }

  const bas = bayt.slice(0, 4096).toString('latin1');
  const mm = bas.match(/<meta[^>]+charset=["']?\s*([\w-]+)/i);
  if (mm) { const m = coz(mm[1].toLowerCase()); if (m) return m; }

  const utf8 = coz('utf-8');
  if (utf8 && !utf8.includes('\uFFFD')) return utf8;

  const tr = coz('windows-1254') || coz('iso-8859-9');
  if (tr) return tr;

  return utf8 || bayt.toString('latin1');
}

/** Tek bir denemeyi yapar; icerik gecerli degilse hata firlatir. */
async function tekDeneme(url, secenek) {
  const { basliklar = {}, tur = 'text', zamanAsimi = 20000, gecerliMi } = secenek;
  const y = await fetch(url, {
    headers: { ...VARSAYILAN_BASLIKLAR, ...basliklar },
    signal: AbortSignal.timeout(zamanAsimi),
    redirect: 'follow'
  });
  if (!y.ok) throw new Error('HTTP ' + y.status);

  // Ham baytlari al ve kodlamayi tespit et (bkz. baytlariCoz).
  const ham = Buffer.from(await y.arrayBuffer());
  const metin = baytlariCoz(ham, y.headers.get('content-type'));
  if (!metin || metin.length < 40) throw new Error('Yanit bos');

  // Bot koruma sayfası JSON beklerken HTML döndürür — bunu hata say.
  if (tur === 'json') {
    let j;
    try { j = JSON.parse(metin); }
    catch (_) { throw new Error('JSON beklenirken HTML geldi (koruma sayfası olabilir)'); }
    if (gecerliMi && !gecerliMi(j)) throw new Error('Yanıt beklenen içeriği taşımıyor');
    return j;
  }

  if (gecerliMi && !gecerliMi(metin)) throw new Error('Yanıt beklenen içeriği taşımıyor');
  return metin;
}

/**
 * getir(url, secenek)
 *  secenek.tur       : 'text' | 'json'
 *  secenek.gecerliMi : (icerik) => boolean  — içeriğin gerçekten beklenen şey
 *                      olduğunu doğrular. Koruma sayfalarını elemek için önemli.
 *  secenek.araciKullan : false verilirse aracıya düşülmez.
 */
async function getir(url, secenek = {}) {
  const { deneme = 1, bekleme = 800, araciKullan = true } = secenek;
  const host = hostAl(url);

  const tumAdaylar = [{ ad: 'dogrudan', url }];
  if (url.startsWith('https://')) {
    tumAdaylar.push({ ad: 'http', url: 'http://' + url.slice(8) });
  }
  if (araciKullan) {
    for (let i = 0; i < ARACILAR.length; i++) {
      tumAdaylar.push({ ad: 'araci' + (i + 1), url: ARACILAR[i](url) });
    }
  }

  // Bu host için çalıştığı bilinen katmanı en öne al.
  const bilinen = yontemleriOku()[host];
  let adaylar = tumAdaylar;
  if (bilinen) {
    const oncelikli = tumAdaylar.filter(a => a.ad === bilinen.ad);
    const digerleri = tumAdaylar.filter(a => a.ad !== bilinen.ad);
    adaylar = oncelikli.concat(digerleri);
  }

  const hatalar = [];
  for (const aday of adaylar) {
    for (let d = 0; d < deneme; d++) {
      try {
        const sonuc = await tekDeneme(aday.url, secenek);
        if (!bilinen || bilinen.ad !== aday.ad) {
          yontemYaz(host, aday.ad);
          if (aday.ad !== 'dogrudan') {
            console.log('   (' + host + ' için "' + aday.ad + '" katmanı öğrenildi)');
          }
        }
        return sonuc;
      } catch (e) {
        hatalar.push(aday.ad + ': ' + e.message);
        if (d < deneme - 1) await uyu(bekleme);
      }
    }
  }
  throw new Error('Getirilemedi: ' + url + ' — ' + hatalar.slice(0, 4).join(' | '));
}

const uyu = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
  BRANSLAR, DURUM,
  macOlustur, trSaatiniUtcYap, trTarihSaatToUtc, yerelDamgaToUtc,
  takimAdiSadelestir, buyukHarfDuzelt, sponsorTemizle,
  parmakIzi, degisiklikBul, getir, uyu
};
