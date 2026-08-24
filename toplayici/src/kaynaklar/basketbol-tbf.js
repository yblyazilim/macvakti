// basketbol-tbf.js — Türkiye Basketbol Federasyonu resmi JSON servisi.
// Önce tarih aralığındaki maç sayıları alınır, yalnızca DOLU günlere istek atılır.

'use strict';
const O = require('../ortak');

const KOK = 'https://www.tbf.org.tr/api/Match';

function gunDamgasi(d) {
  return d.toISOString().slice(0, 10) + 'T00:00:00.000Z';
}

function durumCevir(m) {
  const d = String(m.matchStatus || '').toLocaleLowerCase('tr-TR');
  // Olumsuz ekler önce: "oynanmadı" ile "oynandı" karışmasın.
  if (/oynanmad|bekle|planlan|başlamad/.test(d)) return O.DURUM.BEKLIYOR;
  if (/ertele/.test(d)) return O.DURUM.ERTELENDI;
  if (/iptal|hükmen/.test(d)) return O.DURUM.IPTAL;
  if (/canlı|devam|oynanıyor/.test(d)) return O.DURUM.CANLI;
  if (/oynandı|bitti|tamamland|sona/.test(d)) return O.DURUM.BITTI;
  return O.DURUM.BEKLIYOR;
}

function skorAl(t) {
  if (!t || t.score === undefined || t.score === null || t.score === '') return null;
  const n = parseInt(String(t.score), 10);
  return Number.isNaN(n) ? null : n;
}

function donustur(m, grupAdi) {
  const baslangic = O.yerelDamgaToUtc(m.matchDate);
  if (!baslangic) return null;

  // logoUrl alanına bilinçli olarak DOKUNULMUYOR (telif kuralı 1)
  const ev = O.takimAdiSadelestir(m.homeTeam && m.homeTeam.name);
  const dep = O.takimAdiSadelestir(m.awayTeam && m.awayTeam.name);
  if (!ev || !dep) return null;

  const kanal = String(m.broadcastChannel || '').trim();
  const kanallar = kanal ? [kanal] : [];
  const durum = durumCevir(m);

  return O.macOlustur({
    id: 'basketbol:tbf:' + (m.matchId || m.genuisId),
    brans: 'basketbol',
    lig: m.activityDisplayName || m.activityName || grupAdi || '',
    ligId: m.activityId ? String(m.activityId) : '',
    sezon: m.season || '',
    hafta: m.week || '',
    baslangicUtc: baslangic,
    evSahibi: ev,
    deplasman: dep,
    mekan: m.venueName || '',
    durum,
    skorEv: durum === O.DURUM.BEKLIYOR ? null : skorAl(m.homeTeam),
    skorDep: durum === O.DURUM.BEKLIYOR ? null : skorAl(m.awayTeam),
    kanallar,
    kanalKaynak: kanallar.length ? 'kaynak' : '',
    kaynak: 'tbf'
  });
}

/** Belirli bir günün maçları. */
async function gunuTopla(tarih) {
  const url = KOK + '/get-daily-matches?MatchDate=' + encodeURIComponent(gunDamgasi(tarih)) + '&';
  const y = await O.getir(url, { tur: 'json' });
  const gruplar = (y && y.data) || [];
  const maclar = [];
  for (const g of gruplar) {
    for (const m of (g.matches || [])) {
      try {
        const d = donustur(m, g.groupName);
        if (d) maclar.push(d);
      } catch (_) {}
    }
  }
  return maclar;
}

/**
 * gunSayisi kadar ileriyi tarar.
 * Önce maç sayıları sorgulanır; boş günlere istek atılmaz (kaynağı yormamak için).
 */
async function topla(gunSayisi = 14) {
  const bugun = new Date();
  const bitis = new Date(bugun.getTime() + gunSayisi * 86400000);

  let doluGunler = null;
  try {
    const sayimUrl = KOK + '/tarih-mac-sayisi'
      + '?StartDate=' + encodeURIComponent(gunDamgasi(bugun))
      + '&EndDate=' + encodeURIComponent(gunDamgasi(bitis)) + '&';
    const sayim = await O.getir(sayimUrl, { tur: 'json' });
    const liste = (sayim && sayim.data) || [];
    if (Array.isArray(liste) && liste.length) {
      doluGunler = new Set();
      for (const s of liste) {
        const adet = s.matchCount ?? s.count ?? s.totalCount ?? s.macSayisi ?? 0;
        const t = s.date || s.matchDate || s.tarih;
        if (adet > 0 && t) doluGunler.add(String(t).slice(0, 10));
      }
    }
  } catch (_) {
    doluGunler = null; // sayım alınamazsa her günü tara
  }

  const hepsi = [];
  for (let i = 0; i < gunSayisi; i++) {
    const g = new Date(bugun.getTime() + i * 86400000);
    const anahtar = g.toISOString().slice(0, 10);
    if (doluGunler && !doluGunler.has(anahtar)) continue;
    try {
      hepsi.push(...await gunuTopla(g));
    } catch (_) {}
    await O.uyu(250); // kaynağa nazik davran
  }
  return hepsi;
}

module.exports = { topla, gunuTopla, donustur, _KOK: KOK };
