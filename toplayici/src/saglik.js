// saglik.js — Sistemin kendi kendini denetlemesi.
//
// Kaynak siteler haber vermeden değişir. Bir ayrıştırıcı kırıldığında
// sistem çökmez — sessizce boş veri döndürür. Asıl tehlike budur:
// uygulama "maç yok" der, kimse fark etmez.
//
// Bu betik her toplama sonrası çalışır ve sessiz bozulmayı yakalar.
// Çıkış kodu 1 ise GitHub Actions kırmızıya döner ve uyarı üretir.

'use strict';
const fs = require('fs');
const path = require('path');

const VERI = path.join(__dirname, '..', 'veri');

function oku(dosya, varsayilan) {
  try { return JSON.parse(fs.readFileSync(path.join(VERI, dosya), 'utf8')); }
  catch (_) { return varsayilan; }
}

// Beklentiler: hangi branşta en az kaç maç görmeliyiz?
// Sezon dışı branşlar için 0 kabul edilir; bunlar "uyarı" üretir, hata değil.
const BEKLENTI = {
  futbol:    { asgari: 5,  sezonDisiOlabilir: false },
  basketbol: { asgari: 1,  sezonDisiOlabilir: true  },
  voleybol:  { asgari: 0,  sezonDisiOlabilir: true  },
  hentbol:   { asgari: 1,  sezonDisiOlabilir: true  }
};

function calistir() {
  const veri = oku('maclar.json', null);
  const yayin = oku('yayin-akisi.json', null);

  const bulgular = [];
  const ekle = (seviye, baslik, detay) => bulgular.push({ seviye, baslik, detay });

  // --- 1. Veri dosyası var mı, taze mi? ---
  if (!veri) {
    ekle('hata', 'Maç verisi yok', 'maclar.json okunamadı — toplama hiç çalışmamış olabilir.');
    return sonucla(bulgular, null);
  }
  const yasDk = (Date.now() - new Date(veri.guncellendi).getTime()) / 60000;
  if (yasDk > 90) {
    ekle('hata', 'Veri bayat', 'Son güncelleme ' + Math.round(yasDk) + ' dakika önce. Döngü durmuş olabilir.');
  } else if (yasDk > 45) {
    ekle('uyari', 'Veri gecikmeli', Math.round(yasDk) + ' dakikadır güncellenmemiş.');
  }

  // --- 2. Branş bazında kaynak sağlığı ---
  const maclar = veri.maclar || [];
  const sayim = {};
  for (const m of maclar) sayim[m.brans] = (sayim[m.brans] || 0) + 1;

  for (const [brans, b] of Object.entries(BEKLENTI)) {
    const adet = sayim[brans] || 0;
    const raporDurum = veri.rapor && veri.rapor[brans] && veri.rapor[brans].durum;

    if (raporDurum === 'hata') {
      ekle('hata', brans + ' kaynağı hata verdi',
           (veri.rapor[brans].mesaj || '').slice(0, 200));
    } else if (adet < b.asgari) {
      if (b.sezonDisiOlabilir) {
        ekle('uyari', brans + ' boş döndü',
             'Sezon dışı olabilir; sezon başladıysa ayrıştırıcı kırılmış demektir.');
      } else {
        ekle('hata', brans + ' beklenenden az veri döndü',
             adet + ' maç bulundu, en az ' + b.asgari + ' bekleniyordu. Ayrıştırıcı kırılmış olabilir.');
      }
    }
  }

  // --- 3. Veri tutarlılığı ---
  let bozuk = 0, gecmisBekleyen = 0;
  const simdi = Date.now();
  for (const m of maclar) {
    if (!m.evSahibi || !m.deplasman || !m.baslangicUtc) { bozuk++; continue; }
    if (isNaN(new Date(m.baslangicUtc).getTime())) { bozuk++; continue; }
    // 2 günden eski hâlâ "bekliyor" olan maç => durum güncellemesi çalışmıyor
    if (m.durum === 'bekliyor' &&
        (simdi - new Date(m.baslangicUtc).getTime()) > 2 * 86400000) gecmisBekleyen++;
  }
  if (bozuk > 0) {
    ekle('hata', 'Bozuk maç kaydı', bozuk + ' kayıtta eksik/geçersiz alan var.');
  }
  if (gecmisBekleyen > 3) {
    ekle('uyari', 'Eski maçlar hâlâ "bekliyor"',
         gecmisBekleyen + ' maç geçmişte olduğu hâlde durumu güncellenmemiş.');
  }

  // --- 4. Yayın akışı sağlığı ---
  if (!yayin) {
    ekle('uyari', 'Yayın akışı önbelleği yok', 'Kanal doğrulaması henüz hiç çalışmamış.');
  } else {
    const yYas = (Date.now() - new Date(yayin.guncellendi).getTime()) / 3600000;
    if (yYas > 12) {
      ekle('hata', 'Yayın akışı bayat',
           Math.round(yYas) + ' saattir tazelenmemiş. Digiturk/TV+ kaynakları kırılmış olabilir.');
    }
    if ((yayin.adet || 0) < 50) {
      ekle('hata', 'Yayın akışı beklenenden küçük',
           (yayin.adet || 0) + ' program bulundu. Normalde binlerce olmalı — ayrıştırıcı kırık.');
    }
    // Kaynak bazında
    const r = yayin.rapor || {};
    for (const ad of ['digiturk', 'tvplus']) {
      if (r[ad] && r[ad].durum === 'hata') {
        ekle('uyari', ad + ' yayın kaynağı hata verdi', (r[ad].mesaj || '').slice(0, 200));
      }
    }
  }

  // --- 5. Kanal çözüm oranı ---
  const yaklasan = maclar.filter(m => m.durum === 'bekliyor' &&
    new Date(m.baslangicUtc).getTime() > simdi &&
    new Date(m.baslangicUtc).getTime() < simdi + 3 * 86400000);
  if (yaklasan.length >= 5) {
    const kanalli = yaklasan.filter(m => m.kanallar && m.kanallar.length).length;
    const oran = kanalli / yaklasan.length;
    if (oran < 0.15) {
      ekle('uyari', 'Kanal çözüm oranı çok düşük',
           'Yaklaşan ' + yaklasan.length + ' maçın yalnızca ' + kanalli +
           ' tanesinde kanal var. Eşleştirme bozulmuş olabilir.');
    }
  }

  return sonucla(bulgular, {
    toplamMac: maclar.length,
    bransBazinda: sayim,
    veriYasiDk: Math.round(yasDk),
    yayinProgram: yayin ? yayin.adet : 0,
    yaklasanMac: yaklasan.length,
    kanalliYaklasan: yaklasan.filter(m => m.kanallar && m.kanallar.length).length
  });
}

function sonucla(bulgular, ozet) {
  const hatalar = bulgular.filter(b => b.seviye === 'hata');
  const uyarilar = bulgular.filter(b => b.seviye === 'uyari');
  const durum = hatalar.length ? 'kirmizi' : (uyarilar.length ? 'sari' : 'yesil');

  const rapor = {
    kontrolZamani: new Date().toISOString(),
    durum, hataSayisi: hatalar.length, uyariSayisi: uyarilar.length,
    bulgular, ozet
  };

  fs.mkdirSync(VERI, { recursive: true });
  fs.writeFileSync(path.join(VERI, 'saglik.json'), JSON.stringify(rapor, null, 1), 'utf8');

  const simge = { yesil: 'YEŞİL', sari: 'SARI', kirmizi: 'KIRMIZI' }[durum];
  console.log('\n=== SAĞLIK: ' + simge + ' ===');
  if (ozet) {
    console.log('Toplam maç: ' + ozet.toplamMac +
      ' | branşlar: ' + JSON.stringify(ozet.bransBazinda) +
      ' | yayın programı: ' + ozet.yayinProgram);
    console.log('Yaklaşan maç: ' + ozet.yaklasanMac +
      ', kanalı bilinen: ' + ozet.kanalliYaklasan);
  }
  for (const b of bulgular) {
    console.log('  [' + b.seviye.toUpperCase() + '] ' + b.baslik + ' — ' + b.detay);
  }
  if (durum === 'yesil') console.log('  Sorun yok.');

  return rapor;
}

if (require.main === module) {
  const r = calistir();
  process.exit(r.durum === 'kirmizi' ? 1 : 0);
}

module.exports = { calistir, BEKLENTI };
