// hentbol-thf.js — Türkiye Hentbol Federasyonu resmi açık servisi.
// En zengin kaynak: yayın kanalı, hakem, salon, canlı dakika birlikte gelir.

'use strict';
const O = require('../ortak');

const KOK = 'https://api.thf.org.tr/api/v1/Public';

// Kaynağın durum metinlerini ortak dile çevirir.
function durumCevir(mac) {
  const s = (mac.matchStatus && (mac.matchStatus.name || mac.matchStatus.description)) || '';
  const d = String(s).toLocaleLowerCase('tr-TR');
  // DİKKAT: olumsuz ekler önce sınanır. "oynanmadı" da "oynan" içerir;
  // sıra ters olursa oynanmamış maç bitmiş sayılır.
  if (/oynanmad|bekle|planlan|başlamad/.test(d)) return O.DURUM.BEKLIYOR;
  if (/ertele/.test(d)) return O.DURUM.ERTELENDI;
  if (/iptal/.test(d)) return O.DURUM.IPTAL;
  if (/canlı|devam|oynanıyor/.test(d)) return O.DURUM.CANLI;
  if (/oynandı|bitti|tamamland|sona/.test(d)) return O.DURUM.BITTI;
  if (mac.liveMinute) return O.DURUM.CANLI;
  // Skor varsa bitmiş kabul et, yoksa bekliyor
  const e = mac.homeTeamCurrentScore, a = mac.awayTeamCurrentScore;
  if ((e || a) && (e + a) > 0) return O.DURUM.BITTI;
  return O.DURUM.BEKLIYOR;
}

function kanalCikar(mac) {
  const k = [];
  const ad = mac.liveBroadcast || (mac.liveLogo && mac.liveLogo.name) || '';
  if (ad && String(ad).trim()) k.push(String(ad).trim());
  return k;
}

// Yalnızca ad alanını al; logo/görsel alanlarına bilinçli olarak dokunulmuyor.
function ad(nesne, yedek) {
  if (!nesne) return yedek || '';
  return nesne.name || nesne.title || nesne.description || yedek || '';
}

function donustur(m) {
  const baslangic =
    O.yerelDamgaToUtc(m.matchTime) ||
    O.yerelDamgaToUtc(m.matchDate);
  if (!baslangic) return null;

  const ev = O.takimAdiSadelestir(m.homeTeamName || ad(m.homeTeam));
  const dep = O.takimAdiSadelestir(m.awayTeamName || ad(m.awayTeam));
  if (!ev || !dep) return null;

  const hakemler = [m.fieldRefereeOne, m.fieldRefereeTwo]
    .map(h => h && (h.nameSurname || h.name))
    .filter(Boolean).join(', ');

  const kanallar = kanalCikar(m);
  const durum = durumCevir(m);

  return O.macOlustur({
    id: 'hentbol:thf:' + m.id,
    brans: 'hentbol',
    lig: ad(m.league),
    ligId: m.leagueId ? String(m.leagueId) : '',
    sezon: ad(m.season),
    hafta: ad(m.week),
    baslangicUtc: baslangic,
    evSahibi: ev,
    deplasman: dep,
    mekan: ad(m.sportsHall),
    hakem: hakemler,
    durum,
    skorEv: durum === O.DURUM.BEKLIYOR ? null : (m.homeTeamCurrentScore ?? null),
    skorDep: durum === O.DURUM.BEKLIYOR ? null : (m.awayTeamCurrentScore ?? null),
    kanallar,
    kanalKaynak: kanallar.length ? 'kaynak' : '',
    kaynak: 'thf'
  });
}

/** Dünden itibaren 7 günlük pencereyi getirir. */
async function topla() {
  const y = await O.getir(KOK + '/GetMatchesFromYesterdayAndNextSixDays', { tur: 'json' });
  const liste = Array.isArray(y) ? y : (y.data || []);
  const maclar = [];
  for (const m of liste) {
    try {
      const d = donustur(m);
      if (d) maclar.push(d);
    } catch (_) { /* tek maç bozuksa tümünü düşürme */ }
  }
  return maclar;
}

module.exports = { topla, donustur, _KOK: KOK };
