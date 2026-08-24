// dogrula.js — Bağımsız doğrulama. Ağ gerektirmez; kaydedilmiş gerçek
// sayfa desenleriyle ayrıştırıcıları ve dönüşümleri sınar.

'use strict';
const O = require('../src/ortak');
const futbol = require('../src/kaynaklar/futbol-tff');
const basket = require('../src/kaynaklar/basketbol-tbf');
const hentbol = require('../src/kaynaklar/hentbol-thf');
const metin = require('../src/metin');
const kanal = require('../src/kanal');
const bildirim = require('../src/bildirim-gonder');
const takimAgac = require('../src/takimlar');
const fsT = require('fs');
const pathT = require('path');

let gecti = 0, kaldi = 0;
function ol(ad, kosul, ek) {
  if (kosul) { gecti++; console.log('  ✓ ' + ad); }
  else { kaldi++; console.log('  ✗ ' + ad + (ek ? '  -> ' + ek : '')); }
}
function baslik(s) { console.log('\n' + s); }

// ---------- 1. Zaman dönüşümleri ----------
baslik('ZAMAN');
ol('TR saati UTC-3 olur',
   O.trSaatiniUtcYap(2026, 8, 21, 21, 30) === '2026-08-21T18:30:00.000Z',
   O.trSaatiniUtcYap(2026, 8, 21, 21, 30));
ol('gg.aa.yyyy + ss:dd ayrıştırılır',
   O.trTarihSaatToUtc('21.08.2026', '21:30') === '2026-08-21T18:30:00.000Z');
ol('ofsetsiz yerel damga TR kabul edilir',
   O.yerelDamgaToUtc('2026-08-23T19:00:00') === '2026-08-23T16:00:00.000Z');
ol('ofsetli damga korunur',
   O.yerelDamgaToUtc('2026-08-23T19:00:00Z') === '2026-08-23T19:00:00.000Z');
ol('gece yarısını aşan maç doğru güne düşer',
   O.trSaatiniUtcYap(2026, 8, 21, 1, 0) === '2026-08-20T22:00:00.000Z');

// ---------- 2. Takım adı sadeleştirme ----------
baslik('TAKIM ADLARI');
const C = futbol.CEKIRDEK_ADLAR;
const adTestleri = [
  ['GALATASARAY A.Ş.', 'Galatasaray'],
  ['ZECORNER KAYSERİSPOR', 'Kayserispor'],
  ['TÜMOSAN KONYASPOR', 'Konyaspor'],
  ['ARCA ÇORUM FK', 'Çorum'],
  ['RAMS BAŞAKŞEHİR FUTBOL KULÜBÜ', 'Başakşehir'],
  ['ERZURUMSPOR FK', 'Erzurumspor'],
  ['GENÇLERBİRLİĞİ', 'Gençlerbirliği']
];
for (const [ham, beklenen] of adTestleri) {
  const c = O.sponsorTemizle(ham, C);
  ol(ham + ' -> ' + beklenen, c === beklenen, c);
}

// ---------- 3. Futbol ayrıştırıcı (gerçek TFF deseni) ----------
baslik('FUTBOL AYRIŞTIRICI');
const sahteTff = `
<html><body>
<input type="hidden" name="__VIEWSTATE" value="AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH1234567890" />
<div>Trendyol Süper Lig 2026-2027 Sezonu Fikstürü</div>
<div>2.Hafta</div>
<table><tr><td><table><tr><td>21.08.2026</td><td>21:30</td></tr></table></td>
<td>ERZURUMSPOR FK</td><td>0 - 4</td><td>GALATASARAY A.&#350;.</td><td><a>Detaylar</a></td></tr>
<tr><td>24.08.2026</td><td>21:30</td><td>KOCAEL&#304;SPOR</td><td>-</td>
<td>AMED SPORT&#304;F FAAL&#304;YETLER</td><td><a>Detaylar</a></td></tr></table>
</body></html>`;
const fmaclar = futbol.sayfayiAyristir(sahteTff, { id: '198', ad: 'Süper Lig', kisa: 'SL' });
ol('iki maç bulundu', fmaclar.length === 2, 'bulunan: ' + fmaclar.length);
if (fmaclar.length >= 1) {
  const m = fmaclar[0];
  ol('ev sahibi doğru', m.evSahibi === 'Erzurumspor', m.evSahibi);
  ol('deplasman doğru', m.deplasman === 'Galatasaray', m.deplasman);
  ol('skor doğru', m.skorEv === 0 && m.skorDep === 4, m.skorEv + '-' + m.skorDep);
  ol('durum bitti', m.durum === O.DURUM.BITTI, m.durum);
  ol('saat UTC doğru', m.baslangicUtc === '2026-08-21T18:30:00.000Z', m.baslangicUtc);
  ol('sezon yakalandı', m.sezon === '2026-2027', m.sezon);
  ol('hafta yakalandı', m.hafta === '2. Hafta', m.hafta);
  ol('ViewState metne karışmadı', !/AAAABBBB/.test(m.evSahibi + m.deplasman));
}
if (fmaclar.length >= 2) {
  const m2 = fmaclar[1];
  ol('oynanmamış maç bekliyor', m2.durum === O.DURUM.BEKLIYOR, m2.durum);
  ol('oynanmamış maçta skor yok', m2.skorEv === null && m2.skorDep === null);
}

// ---------- 4. Basketbol dönüşümü (gerçek TBF alan adları) ----------
baslik('BASKETBOL DÖNÜŞÜMÜ');
const bHam = {
  matchId: 345677, activityDisplayName: 'Basketbol Süper Ligi', activityId: 22212,
  season: '2026-2027', matchDate: '2026-08-23T19:00:00', matchTime: '19:00',
  week: '1. Hafta', venueName: 'Sinan Erdem Spor Salonu', matchStatus: 'Oynandı',
  broadcastChannel: 'S Sport 2',
  homeTeam: { id: 1, name: 'FENERBAHÇE BEKO', score: '85',
              logoUrl: 'https://ornek/logo.png' },
  awayTeam: { id: 2, name: 'ANADOLU EFES', score: '80',
              logoUrl: 'https://ornek/logo2.png' }
};
const bm = basket.donustur(bHam);
ol('basketbol maçı dönüştü', !!bm);
if (bm) {
  ol('UTC doğru', bm.baslangicUtc === '2026-08-23T16:00:00.000Z', bm.baslangicUtc);
  ol('kanal kaynaktan alındı', bm.kanallar[0] === 'S Sport 2' && bm.kanalKaynak === 'kaynak');
  ol('skor doğru', bm.skorEv === 85 && bm.skorDep === 80);
  ol('salon doğru', bm.mekan === 'Sinan Erdem Spor Salonu');
  const j = JSON.stringify(bm);
  ol('LOGO SIZDIRMIYOR (telif)', !/logo|\.png/i.test(j), 'logo alanı çıktıya kaçmış!');
}

// ---------- 5. Hentbol dönüşümü (gerçek THF alan adları) ----------
baslik('HENTBOL DÖNÜŞÜMÜ');
const hHam = {
  id: 3035, leagueId: 5, league: { name: 'Hentbol Süper Lig' },
  week: { name: '3. Hafta' }, season: { name: '2026-2027' },
  homeTeamName: 'BEŞİKTAŞ SPOR KULÜBÜ', awayTeamName: 'ANKARA SPOR KULÜBÜ',
  homeTeamCurrentScore: 0, awayTeamCurrentScore: 0,
  matchDate: '2026-08-25T00:00:00', matchTime: '2026-08-25T12:00:00',
  sportsHall: { name: 'BJK Akatlar' }, matchStatus: { name: 'Oynanmadı' },
  liveBroadcast: 'TRT Spor', isLiveBroadcast: true,
  liveLogo: { name: 'TRT', logoUrl: 'https://ornek/trt.png' },
  fieldRefereeOne: { nameSurname: 'A. Yılmaz' }, fieldRefereeTwo: { nameSurname: 'B. Demir' }
};
const hm2 = hentbol.donustur(hHam);
ol('hentbol maçı dönüştü', !!hm2);
if (hm2) {
  ol('matchTime önceliklendi', hm2.baslangicUtc === '2026-08-25T09:00:00.000Z', hm2.baslangicUtc);
  ol('yayın kanalı alındı', hm2.kanallar[0] === 'TRT Spor');
  ol('hakemler alındı', hm2.hakem === 'A. Yılmaz, B. Demir', hm2.hakem);
  ol('oynanmamışta skor null', hm2.skorEv === null);
  ol('LOGO SIZDIRMIYOR (telif)', !/logoUrl|\.png/i.test(JSON.stringify(hm2)));
}

// ---------- 6. Değişiklik tespiti ----------
baslik('DEĞİŞİKLİK TESPİTİ');
const t1 = O.macOlustur({ id: 'x', brans: 'futbol', baslangicUtc: '2026-08-21T18:30:00.000Z',
  evSahibi: 'A', deplasman: 'B', durum: O.DURUM.BEKLIYOR, kanallar: ['beIN Sports 1'] });
const t2 = O.macOlustur({ id: 'x', brans: 'futbol', baslangicUtc: '2026-08-21T20:00:00.000Z',
  evSahibi: 'A', deplasman: 'B', durum: O.DURUM.BEKLIYOR, kanallar: ['beIN Sports 1'] });
const d1 = O.degisiklikBul(t1, t2);
ol('saat değişikliği yakalandı', d1.some(x => x.tip === 'saat'));
const t3 = O.macOlustur({ id: 'x', brans: 'futbol', baslangicUtc: t1.baslangicUtc,
  evSahibi: 'A', deplasman: 'B', durum: O.DURUM.ERTELENDI, kanallar: ['beIN Sports 1'] });
ol('erteleme yakalandı', O.degisiklikBul(t1, t3).some(x => x.tip === 'ertelendi'));
ol('değişiklik yoksa boş', O.degisiklikBul(t1, t1).length === 0);
ol('parmak izi tutarlı', O.parmakIzi(t1) === O.parmakIzi(t1));

// ---------- 7. Metin üretimi (telif: şablondan) ----------
baslik('METİN ÜRETİMİ');
const om = O.macOlustur({ id: 'futbol:tff:SL:abc', brans: 'futbol', lig: 'Süper Lig',
  baslangicUtc: '2026-08-21T18:30:00.000Z', evSahibi: 'Trabzonspor', deplasman: 'Antalyaspor',
  mekan: 'Papara Park', kanallar: ['beIN Sports 1'], durum: O.DURUM.BEKLIYOR });
const h = metin.hatirlatma(om, 60);
ol('hatırlatma başlığı üretildi', h.baslik.includes('Trabzonspor'), h.baslik);
ol('hatırlatma gövdesinde kanal var', h.govde.includes('beIN Sports 1'), h.govde);
ol('TR saati doğru gösteriliyor', metin.trSaat(om.baslangicUtc) === '21:30', metin.trSaat(om.baslangicUtc));
ol('özet metni üretildi', metin.macOzeti(om).includes('Papara Park'));
const h2 = metin.hatirlatma(om, 60);
ol('aynı maç için metin kararlı', h.baslik === h2.baslik && h.govde === h2.govde);
const sd = metin.saatDegisti(om, '2026-08-21T17:00:00.000Z');
ol('saat değişikliği metni iki saati de içerir',
   sd.govde.includes('20:00') && sd.govde.includes('21:30'), sd.govde);

// ---------- 8. Kanal katmanları ----------
baslik('KANAL KATMANLARI');
const kurallar = {
  ligKurallari: { 'futbol:198': { kanallar: ['beIN Sports 1'] } },
  elleGirilenler: { 'futbol:tff:SL:derbi': ['TRT Spor'] }
};
const k1 = kanal.kanalAta(O.macOlustur({ id: 'futbol:tff:SL:x', brans: 'futbol', ligId: '198',
  baslangicUtc: '2026-01-01T00:00:00.000Z', evSahibi: 'A', deplasman: 'B' }), kurallar);
ol('kural katmanı uygulandı', k1.kanallar[0] === 'beIN Sports 1' && k1.kanalKaynak === 'kural');
const k2 = kanal.kanalAta(O.macOlustur({ id: 'futbol:tff:SL:derbi', brans: 'futbol', ligId: '198',
  baslangicUtc: '2026-01-01T00:00:00.000Z', evSahibi: 'A', deplasman: 'B' }), kurallar);
ol('elle giriş kuralı ezdi', k2.kanallar[0] === 'TRT Spor' && k2.kanalKaynak === 'elle');
const k3 = kanal.kanalAta(O.macOlustur({ id: 'z', brans: 'basketbol', ligId: '99',
  baslangicUtc: '2026-01-01T00:00:00.000Z', evSahibi: 'A', deplasman: 'B',
  kanallar: ['S Sport'], kanalKaynak: 'kaynak' }), kurallar);
ol('kaynak kanalı korundu', k3.kanallar[0] === 'S Sport');
const k4 = kanal.kanalAta(O.macOlustur({ id: 'q', brans: 'voleybol', ligId: 'yok',
  baslangicUtc: '2026-01-01T00:00:00.000Z', evSahibi: 'A', deplasman: 'B' }), kurallar);
ol('bilinmeyen kanal UYDURULMADI', k4.kanallar.length === 0);

// ---------- 9. Yayın akışı eşleştirme ----------
baslik('YAYIN AKIŞI EŞLEŞTİRME');
const Y = require('../src/yayin/yayin-ortak');
const E = require('../src/yayin/eslestir');

ol('Türkçe katlama doğru', Y.katla('Beşiktaş A.Ş.') === 'besiktasas', Y.katla('Beşiktaş A.Ş.'));
ol('ASCII başlık Türkçe adla eşleşir', Y.takimEslesir('BESIKTAS', 'Beşiktaş'));
ol('GOZTEPE ~ Göztepe', Y.takimEslesir('GOZTEPE', 'Göztepe'));
ol('farklı takımlar eşleşmez', !Y.takimEslesir('Beşiktaş', 'Fenerbahçe'));
ol('kısa/anlamsız eşleşmez', !Y.takimEslesir('AB', 'Fenerbahçe'));

ol('BANT tekrar sayılır', Y.yayinTuru('SUPER LIG ALANYASPOR - BESIKTAS - BANT -') === 'tekrar');
ol('CANLI canlı sayılır', Y.yayinTuru('ALANYASPOR - BESIKTAS - CANLI -') === 'canli');
ol('özet programı tekrar sayılır', Y.yayinTuru('Süper Lig Maç Özetleri') === 'tekrar');

const c1 = Y.takimlariCikar('SUPER LIG (26-27) 2. HAFTA ALANYASPOR - BESIKTAS - BANT -');
ol('lig/hafta etiketleri temizlendi', c1 && c1[0] === 'ALANYASPOR' && c1[1] === 'BESIKTAS',
   JSON.stringify(c1));
ol('haber programı maç dışı sayılır', Y.MAC_DISI.test('Süper Lig Maç Özetleri - Haber'));

function prog(kanal, bas, iso, kaynak, dijital) {
  return { kanal, dijital: !!dijital, baslik: bas, baslangicUtc: iso,
           tur: Y.yayinTuru(bas), macDisi: Y.MAC_DISI.test(bas),
           takimlar: Y.takimlariCikar(bas), kaynak };
}
const mac1 = O.macOlustur({ id: 'y1', brans: 'futbol',
  baslangicUtc: '2026-08-23T18:30:00.000Z', evSahibi: 'Alanyaspor', deplasman: 'Beşiktaş' });
const mac2 = O.macOlustur({ id: 'y2', brans: 'futbol',
  baslangicUtc: '2026-08-25T18:00:00.000Z', evSahibi: 'Kayserispor', deplasman: 'Konyaspor' });

E.maclaraUygula([mac1, mac2], [
  prog('beIN Sports 1', 'SUPER LIG (26-27) 2. HAFTA ALANYASPOR - BESIKTAS - CANLI -',
       '2026-08-23T18:30:00.000Z', 'digiturk'),
  prog('beIN Sports 1', 'SUPER LIG (26-27) 2. HAFTA ALANYASPOR - BESIKTAS - BANT -',
       '2026-08-24T14:45:00.000Z', 'digiturk')
]);
ol('canlı yayın eşleşti', mac1._yayinOnerisi && mac1._yayinOnerisi.kanallar[0] === 'beIN Sports 1');
ol('TEKRAR yayını canlı sanılmadı',
   mac1._yayinOnerisi && mac1._yayinOnerisi.tur !== 'tekrar', mac1._yayinOnerisi && mac1._yayinOnerisi.tur);
ol('eşleşmeyen maça kanal UYDURULMADI', !mac2._yayinOnerisi);

// Çapraz doğrulama güveni artırmalı
const mac3 = O.macOlustur({ id: 'y3', brans: 'futbol',
  baslangicUtc: '2026-08-23T18:30:00.000Z', evSahibi: 'Göztepe', deplasman: 'Gençlerbirliği' });
E.maclaraUygula([mac3], [
  prog('TRT Spor', 'GOZTEPE - GENCLERBIRLIGI', '2026-08-23T18:30:00.000Z', 'digiturk'),
  prog('TRT Spor', 'Göztepe - Gençlerbirliği', '2026-08-23T18:30:00.000Z', 'tvplus')
]);
ol('iki kaynak doğrulayınca güven yükseldi',
   mac3._yayinOnerisi && mac3._yayinOnerisi.dogrulayan === 2, 
   mac3._yayinOnerisi && mac3._yayinOnerisi.dogrulayan);

// Dijital platform işaretlenmeli
const mac4 = O.macOlustur({ id: 'y4', brans: 'futbol',
  baslangicUtc: '2026-08-23T18:30:00.000Z', evSahibi: 'Eyüpspor', deplasman: 'Gaziantep' });
E.maclaraUygula([mac4], [
  prog('tabii spor', 'EYUPSPOR - GAZIANTEP FK', '2026-08-23T18:30:00.000Z', 'tvplus', true)
]);
ol('dijital yayın işaretlendi', mac4._yayinOnerisi && mac4._yayinOnerisi.dijital === true);

// ---------- 10. Kanal katman önceliği ----------
baslik('KANAL KATMAN ÖNCELİĞİ');
const kur2 = { ligKurallari: { 'futbol:198': { kanallar: ['Kural Kanalı'] } },
               elleGirilenler: { 'p3': ['Elle Kanal'] } };

const p1 = O.macOlustur({ id: 'p1', brans: 'futbol', ligId: '198',
  baslangicUtc: '2026-01-01T00:00:00.000Z', evSahibi: 'A', deplasman: 'B' });
p1._yayinOnerisi = { kanallar: ['Yayın Kanalı'], guven: 100, dogrulayan: 1, dijital: false, tur: 'canli' };
kanal.kanalAta(p1, kur2);
ol('yayın akışı kuralı ezdi', p1.kanallar[0] === 'Yayın Kanalı' && p1.kanalKaynak === 'yayin-akisi');

const p2 = O.macOlustur({ id: 'p2', brans: 'basketbol', ligId: '9',
  baslangicUtc: '2026-01-01T00:00:00.000Z', evSahibi: 'A', deplasman: 'B',
  kanallar: ['Federasyon Kanalı'], kanalKaynak: 'kaynak' });
p2._yayinOnerisi = { kanallar: ['Yayın Kanalı'], guven: 100, dogrulayan: 1, dijital: false, tur: 'canli' };
kanal.kanalAta(p2, kur2);
ol('yayın akışı federasyonu ezdi ama onu da korudu',
   p2.kanallar[0] === 'Yayın Kanalı' && p2.kanallar.indexOf('Federasyon Kanalı') > 0,
   p2.kanallar.join('+'));

const p3 = O.macOlustur({ id: 'p3', brans: 'futbol', ligId: '198',
  baslangicUtc: '2026-01-01T00:00:00.000Z', evSahibi: 'A', deplasman: 'B' });
p3._yayinOnerisi = { kanallar: ['Yayın Kanalı'], guven: 100, dogrulayan: 1, dijital: false, tur: 'canli' };
kanal.kanalAta(p3, kur2);
ol('ELLE giriş yayın akışını da ezdi', p3.kanallar[0] === 'Elle Kanal' && p3.kanalKaynak === 'elle');

const p4 = O.macOlustur({ id: 'p4', brans: 'futbol', ligId: '198',
  baslangicUtc: '2026-01-01T00:00:00.000Z', evSahibi: 'A', deplasman: 'B' });
p4._yayinOnerisi = { kanallar: ['Zayıf Eşleşme'], guven: 30, dogrulayan: 1, dijital: false, tur: 'belirsiz' };
kanal.kanalAta(p4, kur2);
ol('düşük güvenli öneri reddedildi, kurala düşüldü',
   p4.kanallar[0] === 'Kural Kanalı' && p4.kanalKaynak === 'kural', p4.kanalKaynak);

// ---------- Bildirim konuları: SADECE takip edilene gitmeli ----------
baslik('BİLDİRİM KONULARI (kapsam)');
const km = O.macOlustur({ id: 'futbol:tff:SL:20260821abc', brans: 'futbol', ligId: '198',
  lig: 'Süper Lig', baslangicUtc: '2026-08-21T18:30:00.000Z',
  evSahibi: 'Beşiktaş', deplasman: 'Gençlerbirliği' });
const kk = bildirim.konularUret(km);

ol('branş konusuna GÖNDERİLMEZ (toplu bildirim olmaz)',
   !kk.some(k => k.indexOf('brans_') === 0), kk.join(','));
ol('lig konusuna GÖNDERİLMEZ',
   !kk.some(k => k.indexOf('lig_') === 0), kk.join(','));
ol('her iki takım konusu üretilir',
   kk.indexOf('takim_besiktas_futbol') >= 0 && kk.indexOf('takim_genclerbirligi_futbol') >= 0,
   kk.join(','));
ol('maça özel konu üretilir',
   kk.some(k => k.indexOf('mac_') === 0), kk.join(','));
ol('takım konusu BRANŞA özel (başka branşa sızmaz)',
   !kk.some(k => k === 'takim_besiktas_basketbol'), kk.join(','));
ol('üretilen tüm konular FCM için geçerli',
   kk.every(k => /^[a-zA-Z0-9_.~%-]+$/.test(k)), kk.join(','));

// Türkçe karakterli tüm takımlar geçerli konu üretmeli
const turkce = ['Beşiktaş','Karagümrük','Göztepe','Ümraniyespor','Şanlıurfaspor',
                'İstanbulspor','Gençlerbirliği','Çorum','Kasımpaşa','Iğdır'];
let hepsiGecerli = true;
for (const t of turkce) {
  const km2 = O.macOlustur({ id: 'x', brans: 'futbol', baslangicUtc: '2026-01-01T00:00:00.000Z',
    evSahibi: t, deplasman: 'A' });
  if (!bildirim.konularUret(km2).every(k => /^[a-zA-Z0-9_.~%-]+$/.test(k))) hepsiGecerli = false;
}
ol('Türkçe karakterli takımlar geçerli konu üretir (FCM ASCII şartı)', hepsiGecerli);

// İstemci ve sunucu AYNI katlamayı yapmalı; yoksa abone/gönderi eşleşmez.
const istemciKaynak = fsT.readFileSync(pathT.join(__dirname, '..', '..', 'www', 'index.html'), 'utf8');
const eslesme = istemciKaynak.match(/function konuAnahtar\(ad\) \{[\s\S]*?\n\}/);
ol('istemcide konuAnahtar bulundu', !!eslesme);
if (eslesme) {
  const istemciFn = eval('(' + eslesme[0].replace('function konuAnahtar', 'function') + ')');
  const ornekler = ['Beşiktaş','Amed Sportif Faaliyetler','1461 Trabzon FK','Spor Toto','Iğdır FK'];
  ol('istemci ve sunucu anahtarları BİREBİR aynı',
     ornekler.every(o => istemciFn(o) === bildirim.konuAnahtar(o)),
     ornekler.map(o => o + ':' + istemciFn(o) + '/' + bildirim.konuAnahtar(o)).join(' '));
}

// ---------- Takım ağacı ----------
baslik('TAKIM AĞACI');
const sahteMaclar = [
  O.macOlustur({ id: 'a', brans: 'futbol', ligId: '198', lig: 'Süper Lig',
    baslangicUtc: '2026-01-01T00:00:00.000Z', evSahibi: 'Fenerbahçe', deplasman: 'Beşiktaş' }),
  O.macOlustur({ id: 'b', brans: 'basketbol', ligId: 'BSL', lig: 'Basketbol Süper Ligi',
    baslangicUtc: '2026-01-02T00:00:00.000Z', evSahibi: 'Fenerbahçe', deplasman: 'Anadolu Efes' })
];
const agac = takimAgac.agacKur(sahteMaclar, {});
ol('iki branş ayrıldı', agac.branslar.length === 2, agac.branslar.map(b => b.k).join(','));
ol('lig altında takımlar toplandı',
   agac.branslar.find(b => b.k === 'futbol').ligler[0].takimlar.length === 2);
ol('çok branşlı kulüp her iki branşta görünür',
   agac.takimlar['fenerbahce'].branslar.length === 2,
   JSON.stringify(agac.takimlar['fenerbahce'].branslar));
ol('künyesi olmayan takıma UYDURMA künye yazılmaz',
   !agac.takimlar['besiktas'].kunye);

const kunyeli = takimAgac.agacKur(sahteMaclar,
  { 'Beşiktaş': { bulundu: true, kurulus: 1903, sehir: 'İstanbul' } });
ol('doğrulanmış künye aktarılır',
   kunyeli.takimlar['besiktas'].kunye.kurulus === 1903 &&
   kunyeli.takimlar['besiktas'].kunye.sehir === 'İstanbul');
ol('künyede boş alan hiç yazılmaz',
   !('stat' in kunyeli.takimlar['besiktas'].kunye));
ol('ağaç anahtarı ile konu anahtarı aynı',
   takimAgac.anahtar('Beşiktaş') === bildirim.konuAnahtar('Beşiktaş'));

// ---------- Logo sızıntısı (telif) ----------
baslik('TELİF');
ol('istemcide logo/amblem alanı kullanılmıyor',
   !/logoUrl|liveLogo|badgeUrl|crestUrl/i.test(istemciKaynak));

console.log('\n' + '='.repeat(46));
console.log('GEÇTİ: ' + gecti + '   KALDI: ' + kaldi);
console.log('='.repeat(46));
process.exit(kaldi ? 1 : 0);
