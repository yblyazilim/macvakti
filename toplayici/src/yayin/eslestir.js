// eslestir.js — Yayın akışı ile maçları eşleştirir.
//
// MANTIK:
//   1. Tüm spor kanallarının program akışı toplanır (Digiturk + Turkcell TV+)
//   2. Program başlığındaki takım çifti maçlarla karşılaştırılır
//   3. Zaman yakınlığı doğrulama görevi görür — tekrar yayınları elenir
//   4. Birden çok kaynak aynı kanalı söylüyorsa güven yükselir (çapraz doğrulama)
//
// Sonuç uydurma değil, yayıncının kendi programına dayanır.

'use strict';
const fs = require('fs');
const path = require('path');
const Y = require('./yayin-ortak');
const digiturk = require('./digiturk');
const tvplus = require('./tvplus');

const ESIK = 60;           // bu puanın altındaki eşleşme kabul edilmez
const GUCLU_ESIK = 95;     // aynı saat + isim tam tutuyor

/** Tüm yayın kaynaklarını toplar. */
async function programlariTopla(gunSayisi = 3) {
  const sonuc = { programlar: [], rapor: {} };
  const kaynaklar = [
    { ad: 'digiturk', mod: digiturk },
    { ad: 'tvplus',   mod: tvplus }
  ];
  for (const k of kaynaklar) {
    try {
      const p = await k.mod.topla(gunSayisi);
      sonuc.programlar.push(...p);
      // Sadece adet degil, ORNEK de kaydet. Bos donen bir kaynagin
      // sebebi ancak boyle gorunur olur.
      sonuc.rapor[k.ad] = {
        durum: p.length ? 'tamam' : 'bos',
        adet: p.length,
        ornek: p.length ? {
          kanal: p[0].kanal,
          baslik: String(p[0].baslik || '').slice(0, 60),
          baslangic: p[0].baslangicUtc
        } : null
      };
    } catch (e) {
      sonuc.rapor[k.ad] = { durum: 'hata', mesaj: String(e.message || e).slice(0, 300) };
    }
  }
  return sonuc;
}

/**
 * Maçlara kanal atar. Maç nesnelerini yerinde günceller.
 * Yalnızca gerçekten eşleşenlere dokunur; eşleşmeyeni boş bırakır.
 */
function maclaraUygula(maclar, programlar) {
  // Maç dışı programları baştan ele
  const adaylar = programlar.filter(p => p.takimlar && !p.macDisi);

  let atanan = 0, capraz = 0;

  for (const mac of maclar) {
    // Bu maça uyan tüm program adaylarını puanla
    const bulgular = [];
    for (const p of adaylar) {
      const puan = Y.eslesmePuani(p, mac);
      if (puan >= ESIK) bulgular.push({ p, puan });
    }
    if (!bulgular.length) continue;

    // Kanal bazında en iyi puanı topla
    const kanalPuan = new Map();
    for (const b of bulgular) {
      const mevcut = kanalPuan.get(b.p.kanal);
      if (!mevcut || b.puan > mevcut.puan) {
        kanalPuan.set(b.p.kanal, { puan: b.puan, prog: b.p, kaynaklar: new Set() });
      }
    }
    // Hangi kanalı hangi kaynaklar doğruladı?
    for (const b of bulgular) {
      const k = kanalPuan.get(b.p.kanal);
      if (k) k.kaynaklar.add(b.p.kaynak);
    }

    // Puana göre sırala, en iyileri al
    const sirali = [...kanalPuan.entries()]
      .sort((a, b) => b[1].puan - a[1].puan);

    const enIyi = sirali[0];
    if (!enIyi) continue;

    // Aynı puana yakın birden çok kanal varsa hepsini göster
    // (bir maç birden fazla kanalda yayınlanabilir)
    const secilenler = sirali
      .filter(([, v]) => v.puan >= enIyi[1].puan - 10)
      .slice(0, 3);

    const kanalAdlari = secilenler.map(([ad]) => ad);
    const kaynakSayisi = enIyi[1].kaynaklar.size;
    const dijitalMi = secilenler.every(([, v]) => v.prog.dijital);

    // Güven: puan + çapraz doğrulama
    let guven = Math.min(100, enIyi[1].puan);
    if (kaynakSayisi > 1) { guven = Math.min(100, guven + 10); capraz++; }
    if (enIyi[1].prog.tur === 'tekrar') guven -= 30;

    // Doğrudan ezme: karar katman sırasına göre kanal.js'de verilir.
    mac._yayinOnerisi = {
      kanallar: kanalAdlari,
      guven,
      dogrulayan: kaynakSayisi,
      dijital: dijitalMi,
      tur: enIyi[1].prog.tur
    };
    atanan++;
  }

  return { atanan, capraz, adayProgram: adaylar.length };
}

// --- Önbellek ---
// Yayın akışı büyük veridir (Digiturk günlük ~3 MB). Her çalıştırmada
// yeniden indirmek hem yavaş hem kaynağa saygısızdır. Bu yüzden akış
// seyrek toplanır, dosyaya yazılır; sık çalışan maç toplama onu okur.

const ONBELLEK = path.join(__dirname, '..', '..', 'veri', 'yayin-akisi.json');

function programlariKaydet(programlar, rapor) {
  // Bos sonucu onbellege yazma - eski (dolu) onbellek korunsun.
  if (!programlar || !programlar.length) {
    console.log('[yayin] toplama bos dondu, onbellek korunuyor');
    return;
  }
  fs.mkdirSync(path.dirname(ONBELLEK), { recursive: true });
  fs.writeFileSync(ONBELLEK, JSON.stringify({
    guncellendi: new Date().toISOString(),
    adet: programlar.length,
    rapor: rapor || {},
    programlar
  }, null, 1), 'utf8');
}

/** Önbellekten okur. tazelikSaat'ten eskiyse boş döner. */
function programlariOku(tazelikSaat = 6) {
  try {
    const j = JSON.parse(fs.readFileSync(ONBELLEK, 'utf8'));
    const yas = (Date.now() - new Date(j.guncellendi).getTime()) / 3600000;
    if (yas > tazelikSaat) return { programlar: [], bayat: true, yasSaat: yas };
    return { programlar: j.programlar || [], bayat: false, yasSaat: yas };
  } catch (_) {
    return { programlar: [], bayat: true, yasSaat: null };
  }
}


/**
 * Yayın akışının şimdi tazelenmesi gerekiyor mu?
 *
 * Akış 15 dakikada bir kontrol edilir ama HER SEFERİNDE indirilmez.
 * Digiturk'ün günlük akışı birkaç MB'tır; gece boyunca 15 dakikada bir
 * indirmek hem anlamsız (akış değişmiyor) hem kaynağa saygısızdır.
 *
 * Kural:
 *   - Yaklaşan maç varsa (önümüzdeki YAKIN_SAAT içinde) → 15 dakikada bir tazele.
 *     Kanal ve saat değişiklikleri tam bu pencerede olur.
 *   - Yaklaşan maç yoksa → 6 saatte bir yeter (günlük bakım).
 */
const YAKIN_SAAT = 5;
const YOGUN_DK = 15;
const SAKIN_SAAT = 6;

function tazelemeGerekli(maclar, simdi) {
  const an = simdi ? simdi.getTime() : Date.now();
  const o = programlariOku(24 * 365);       // yalnızca yaşını öğrenmek için
  const yasDk = o.yasSaat === null ? Infinity : o.yasSaat * 60;

  const yakindaMac = (maclar || []).some(m => {
    if (m.durum !== 'bekliyor' && m.durum !== 'canli') return false;
    const fark = (new Date(m.baslangicUtc).getTime() - an) / 3600000;
    return fark > -3 && fark < YAKIN_SAAT;   // 3 saat öncesinden 5 saat sonrasına
  });

  // Önbellek HİÇ yoksa (ilk çalışma veya kayıp dosya) koşulsuz topla.
  // Aksi hâlde kısır döngü olur: maç yok -> sakin dönem -> tazeleme yok ->
  // kanal doğrulanamaz -> maçlar kanalsız kalır.
  if (yasDk === Infinity) {
    return { gerekli: true, sebep: 'onbellek-yok', yasDk: null, esikDk: 0 };
  }

  // BOS onbellek de tazelenmeli. Aksi halde kisir dongu olusur:
  // toplama basarisiz -> bos onbellek yazilir -> 'taze' sayilir ->
  // bir daha hic denenmez -> kanal bilgisi asla gelmez.
  if (!o.programlar.length) {
    return { gerekli: true, sebep: 'onbellek-bos', yasDk: Math.round(yasDk), esikDk: 0 };
  }

  const esikDk = yakindaMac ? YOGUN_DK : SAKIN_SAAT * 60;
  return {
    gerekli: yasDk >= esikDk,
    sebep: yakindaMac ? 'yaklasan-mac' : 'sakin-donem',
    yasDk: Math.round(yasDk),
    esikDk
  };
}

module.exports = {
  programlariTopla, maclaraUygula, programlariKaydet, programlariOku,
  tazelemeGerekli, ESIK, GUCLU_ESIK, ONBELLEK, YAKIN_SAAT
};
