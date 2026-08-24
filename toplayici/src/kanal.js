// kanal.js — Yayın kanalı çözümü. Dört katman, net öncelik sırası.
//
//  1) ELLE        : Admin panelinden girilen istisna. İnsan kararı her şeyi ezer.
//  2) YAYIN AKIŞI : Yayıncının kendi program akışından doğrulanmış eşleşme.
//                   En güncel bilgi — son dakika değişiklikleri buraya yansır.
//  3) KAYNAK      : Federasyon verisindeki kanal alanı (TBF, THF, TVF).
//  4) KURAL       : Lig bazlı sözleşme kuralı (kurallar.json).
//
// Hiçbiri bilmiyorsa BOŞ bırakılır. Kanal asla tahmin edilmez —
// yanlış kanal bilgisi, bilgi vermemekten daha kötüdür.

'use strict';
const fs = require('fs');
const path = require('path');

const KURAL_DOSYA = path.join(__dirname, '..', 'veri', 'kanal-kurallari.json');

// Yayın akışı önerisinin kabul edilmesi için asgari güven
const ASGARI_GUVEN = 60;

function kurallariOku() {
  try {
    return JSON.parse(fs.readFileSync(KURAL_DOSYA, 'utf8'));
  } catch (_) {
    return { ligKurallari: {}, elleGirilenler: {}, guncellendi: null };
  }
}

function kanalAta(mac, kurallar) {
  const k = kurallar || kurallariOku();
  const oneri = mac._yayinOnerisi;
  delete mac._yayinOnerisi;

  // Kaynaktan (federasyon) gelen kanal, önerilerden önce saklanır
  const kaynakKanallari = (mac.kanalKaynak === 'kaynak' && mac.kanallar && mac.kanallar.length)
    ? mac.kanallar.slice() : null;

  // --- 1) ELLE ---
  const elle = k.elleGirilenler && k.elleGirilenler[mac.id];
  if (elle && elle.length) {
    mac.kanallar = [].concat(elle);
    mac.kanalKaynak = 'elle';
    mac.kanalGuven = 100;
    return mac;
  }

  // --- 2) YAYIN AKIŞI ---
  if (oneri && oneri.guven >= ASGARI_GUVEN && oneri.kanallar.length) {
    mac.kanallar = oneri.kanallar;
    mac.kanalKaynak = 'yayin-akisi';
    mac.kanalGuven = oneri.guven;
    mac.kanalDogrulayan = oneri.dogrulayan;
    mac.dijitalYayin = !!oneri.dijital;

    // Federasyon da kanal söylüyorsa ve listede yoksa ekle (ikisi de doğru olabilir)
    if (kaynakKanallari) {
      for (const kk of kaynakKanallari) {
        if (!mac.kanallar.some(x => x.toLowerCase() === kk.toLowerCase())) {
          mac.kanallar.push(kk);
        }
      }
      mac.kanalGuven = Math.min(100, mac.kanalGuven + 5);
    }
    return mac;
  }

  // --- 3) KAYNAK (federasyon) ---
  if (kaynakKanallari) {
    mac.kanallar = kaynakKanallari;
    mac.kanalKaynak = 'kaynak';
    mac.kanalGuven = 85;
    return mac;
  }

  // --- 4) KURAL ---
  const anahtar = mac.brans + ':' + (mac.ligId || mac.lig);
  const kural = k.ligKurallari &&
    (k.ligKurallari[anahtar] || k.ligKurallari[mac.brans + ':' + mac.lig]);
  if (kural && kural.kanallar && kural.kanallar.length) {
    mac.kanallar = [].concat(kural.kanallar);
    mac.kanalKaynak = 'kural';
    mac.kanalGuven = 50;
    return mac;
  }

  // --- Bilinmiyor ---
  mac.kanallar = [];
  mac.kanalKaynak = '';
  mac.kanalGuven = 0;
  return mac;
}

function hepsineAta(maclar) {
  const k = kurallariOku();
  for (const m of maclar) kanalAta(m, k);
  return maclar;
}

/** Kanalı bilinmeyen yaklaşan maçlar — admin panelinin çalışma listesi. */
function eksikKanallar(maclar) {
  return maclar
    .filter(m => !m.kanallar.length && m.durum === 'bekliyor')
    .map(m => ({ id: m.id, brans: m.brans, lig: m.lig,
                 mac: m.evSahibi + ' - ' + m.deplasman, tarih: m.baslangicUtc }));
}

/** Kanal çözümünün genel görünümü — sistemin sağlığını izlemek için. */
function ozet(maclar) {
  const o = { toplam: maclar.length, elle: 0, yayinAkisi: 0, kaynak: 0, kural: 0, yok: 0, dijital: 0 };
  for (const m of maclar) {
    if (m.kanalKaynak === 'elle') o.elle++;
    else if (m.kanalKaynak === 'yayin-akisi') o.yayinAkisi++;
    else if (m.kanalKaynak === 'kaynak') o.kaynak++;
    else if (m.kanalKaynak === 'kural') o.kural++;
    else o.yok++;
    if (m.dijitalYayin) o.dijital++;
  }
  return o;
}

module.exports = { kanalAta, hepsineAta, kurallariOku, eksikKanallar, ozet, KURAL_DOSYA, ASGARI_GUVEN };
