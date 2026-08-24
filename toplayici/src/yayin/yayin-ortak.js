// yayin-ortak.js — Yayın (EPG) kaynaklarının ortak yardımcıları.
//
// AMAÇ: Kanal bilgisini tahminle değil, YAYIN AKIŞINDAN doğrulayarak bulmak.
// Yöntem "ters eşleştirme": kanalların program akışı taranır, program
// başlığındaki takım çifti bizim maçlarımızla eşleştirilir.

'use strict';

/** Türkçe karakterleri katlar, karşılaştırma için sadeleştirir. */
function katla(s) {
  return String(s || '')
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Program başlığında maç dışı içeriği ele veren kalıplar
const TEKRAR_KALIPLARI = /(\bbant\b|tekrar|[oö]zet\w*|highlight\w*|replay|analiz|[oö]nceki)/i;
const CANLI_KALIPLARI  = /\b(canl[ıi]|live|naklen)\b/i;

// Maç olmayan program türleri
const MAC_DISI = /(magazin|haber|g[uü]ndem|st[uü]dyo|belgesel|r[oö]portaj|panel|yorum|trio|derin\s*futbol)/i;

/** Yayının canlı mı tekrar mı olduğunu belirler. */
function yayinTuru(baslik) {
  if (TEKRAR_KALIPLARI.test(baslik)) return 'tekrar';
  if (CANLI_KALIPLARI.test(baslik)) return 'canli';
  return 'belirsiz';
}

/**
 * Program başlığından takım çiftini çıkarır.
 * "SUPER LIG (26-27) 2. HAFTA ALANYASPOR - BESIKTAS - BANT -" -> [alanyaspor, besiktas]
 */
function takimlariCikar(baslik) {
  let s = String(baslik || '');
  // Parantezli sezon/ek bilgileri at
  s = s.replace(/\([^)]*\)/g, ' ');
  // Baştaki lig/hafta etiketlerini at
  s = s.replace(/\b\d+\s*\.\s*hafta\b/gi, ' ');
  s = s.replace(/\b(super\s*lig|süper\s*lig|tff\s*\d\s*\.?\s*lig|1\.\s*lig|2\.\s*lig|3\.\s*lig|kupa|türkiye\s*kupası)\b/gi, ' ');
  // Sondaki yayın türü etiketlerini at
  s = s.replace(/[-–]\s*(bant|canl[ıi]|tekrar|ozet|özet|naklen|live)\s*[-–]?\s*$/gi, ' ');
  s = s.replace(/\/\s*(bant|canl[ıi]|tekrar|haber|pazar|cumartesi)\s*$/gi, ' ');

  // Ayraçla böl: " - " veya " – " veya " vs "
  const parcalar = s.split(/\s+[-–]\s+|\s+vs\.?\s+/i)
    .map(x => x.replace(/\s+/g, ' ').trim())
    .filter(x => x.length >= 3);

  if (parcalar.length < 2) return null;

  // Ardışık iki anlamlı parçayı takım kabul et
  for (let i = 0; i < parcalar.length - 1; i++) {
    const a = parcalar[i], b = parcalar[i + 1];
    if (TEKRAR_KALIPLARI.test(a) || TEKRAR_KALIPLARI.test(b)) continue;
    if (/^\d+$/.test(katla(a)) || /^\d+$/.test(katla(b))) continue;
    if (katla(a).length < 3 || katla(b).length < 3) continue;
    return [a, b];
  }
  return null;
}

/**
 * İki takım adının aynı kulübü gösterip göstermediğine karar verir.
 * Sponsor ekleri ve kısaltmalar nedeniyle tam eşitlik aranmaz.
 */
function takimEslesir(a, b) {
  const ka = katla(a), kb = katla(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // Biri diğerini içeriyorsa (sponsor öneki, "FK" eki vb.)
  if (ka.length >= 5 && kb.includes(ka)) return true;
  if (kb.length >= 5 && ka.includes(kb)) return true;
  // Baştan ortak kök (en az 6 harf) — "besiktas" / "besiktasas"
  const n = Math.min(ka.length, kb.length);
  if (n >= 6 && ka.slice(0, 6) === kb.slice(0, 6)) {
    const uzun = Math.max(ka.length, kb.length);
    if (uzun - n <= 6) return true;
  }
  return false;
}

/** Program ile maçın aynı karşılaşma olup olmadığını puanlar. */
function eslesmePuani(program, mac) {
  const cift = program.takimlar;
  if (!cift) return 0;

  const duz = takimEslesir(cift[0], mac.evSahibi) && takimEslesir(cift[1], mac.deplasman);
  const ters = takimEslesir(cift[0], mac.deplasman) && takimEslesir(cift[1], mac.evSahibi);
  if (!duz && !ters) return 0;

  // Zaman yakınlığı: yayın başlangıcı maç saatine ne kadar yakın?
  const fark = Math.abs(new Date(program.baslangicUtc).getTime()
                      - new Date(mac.baslangicUtc).getTime()) / 60000;

  let puan = 0;
  if (fark <= 20) puan = 100;        // aynı saat — güçlü kanıt
  else if (fark <= 45) puan = 80;
  else if (fark <= 90) puan = 45;    // erken kuşak/uzun program olabilir
  else return 0;                     // farklı zaman: tekrar yayını, eşleştirme

  if (duz) puan += 5;                // ev-deplasman sırası da tutuyor
  if (program.tur === 'tekrar') puan -= 60;
  if (program.tur === 'canli') puan += 10;
  return puan;
}

module.exports = {
  katla, yayinTuru, takimlariCikar, takimEslesir, eslesmePuani,
  TEKRAR_KALIPLARI, CANLI_KALIPLARI, MAC_DISI
};
