// bildirim-gonder.js — Bekleyen bildirimleri Firebase Cloud Messaging'e gönderir.
//
// İki kaynak birleştirilir:
//   1) Kuyruk      : topla.js'in ürettiği değişiklik bildirimleri (saat, kanal, erteleme)
//   2) Hatırlatma  : yaklaşan maçlar için zamana dayalı bildirimler (T-60, T-15)
//
// Konu (topic) tabanlı gönderim kullanılır: kullanıcı listesi tutulmaz,
// cihaz kaydı gerekmez, sınırsız ölçeklenir ve ücretsizdir.
//
// Bağımlılık YOK: OAuth2 belirteci Node'un yerleşik crypto'su ile üretilir.

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const metin = require('./metin');

const VERI = path.join(__dirname, '..', 'veri');
const KUYRUK = path.join(VERI, 'bildirim-kuyrugu.json');
const GONDERILEN = path.join(VERI, 'gonderilenler.json');
const MACLAR = path.join(VERI, 'maclar.json');

// Hatırlatma pencereleri (dakika). Sapma toleransı cron aralığına göre.
const HATIRLATMALAR = [
  { dakika: 60, tolerans: 20, etiket: 't60' },
  { dakika: 15, tolerans: 10, etiket: 't15' }
];

// Sessiz saat (TR): bu aralıkta yalnızca yüksek öncelikli bildirim gider.
const SESSIZ_BASLA = 0, SESSIZ_BITIS = 8;

function oku(p, v) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return v; } }
function yaz(p, o) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 1), 'utf8'); }

function trSaatiKac(d) {
  return new Date(d.getTime() + 180 * 60000).getUTCHours();
}

/** Servis hesabı JSON'undan OAuth2 erişim belirteci alır (bağımlılıksız). */
async function erisimBelirteci(hesap) {
  const simdi = Math.floor(Date.now() / 1000);
  const basdlik = { alg: 'RS256', typ: 'JWT' };
  const govde = {
    iss: hesap.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: simdi,
    exp: simdi + 3600
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const imzalanacak = b64(basdlik) + '.' + b64(govde);
  const imza = crypto.createSign('RSA-SHA256').update(imzalanacak).sign(hesap.private_key, 'base64url');
  const jwt = imzalanacak + '.' + imza;

  const y = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  if (!y.ok) throw new Error('Belirteç alınamadı: ' + y.status + ' ' + await y.text());
  return (await y.json()).access_token;
}

/** Tek bir konuya bildirim gönderir. */
async function konuyaGonder(proje, belirtec, konu, bildirim) {
  const y = await fetch('https://fcm.googleapis.com/v1/projects/' + proje + '/messages:send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + belirtec, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        topic: konu,
        notification: { title: bildirim.baslik, body: bildirim.govde },
        data: {
          macId: String(bildirim.macId || ''),
          tip: String(bildirim.tip || '')
        },
        android: {
          priority: bildirim.oncelik === 'yuksek' ? 'HIGH' : 'NORMAL',
          notification: { channel_id: 'mac_bildirimleri' }
        }
      }
    })
  });
  if (!y.ok) {
    const t = await y.text();
    // Kimse abone değilse hata değil
    if (/NOT_FOUND|INVALID_ARGUMENT/.test(t)) return { atlandi: true };
    throw new Error('FCM ' + y.status + ': ' + t.slice(0, 200));
  }
  return { gonderildi: true };
}

/** Yaklaşan maçlar için zamana dayalı hatırlatmalar üretir. */
function hatirlatmalariUret(maclar, gonderilenler) {
  const simdi = Date.now();
  const yeni = [];
  for (const m of maclar) {
    if (m.durum !== 'bekliyor') continue;
    const fark = (new Date(m.baslangicUtc).getTime() - simdi) / 60000;
    for (const h of HATIRLATMALAR) {
      if (fark <= h.dakika && fark > h.dakika - h.tolerans) {
        const anahtar = m.id + ':' + h.etiket;
        if (gonderilenler[anahtar]) continue;
        const b = metin.hatirlatma(m, Math.max(1, Math.round(fark)));
        yeni.push({
          anahtar, macId: m.id, tip: 'hatirlatma',
          konular: konularUret(m),
          baslik: b.baslik, govde: b.govde,
          oncelik: 'orta'
        });
      }
    }
  }
  return yeni;
}

function konularUret(mac) {
  const k = ['brans_' + mac.brans];
  if (mac.ligId) k.push('lig_' + mac.brans + '_' + String(mac.ligId).replace(/[^\w]/g, ''));
  const t = (ad) => 'takim_' + String(ad).toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]/gu, '');
  k.push(t(mac.evSahibi), t(mac.deplasman));
  return k;
}

async function calistir() {
  const projeId = process.env.FIREBASE_PROJE;
  const hesapHam = process.env.FIREBASE_HESAP_JSON;

  const kuyruk = oku(KUYRUK, { bekleyen: [] });
  const gonderilenler = oku(GONDERILEN, {});
  const veri = oku(MACLAR, { maclar: [] });

  const hatirlatmalar = hatirlatmalariUret(veri.maclar || [], gonderilenler);
  const tumu = (kuyruk.bekleyen || []).concat(hatirlatmalar);

  if (!tumu.length) { console.log('Gönderilecek bildirim yok.'); return; }

  if (!projeId || !hesapHam) {
    console.log('Firebase henüz yapılandırılmamış — ' + tumu.length
      + ' bildirim kuyrukta bekletiliyor.');
    // Hatırlatmaları da kuyruğa ekle ki Firebase gelince kaybolmasın
    if (hatirlatmalar.length) {
      kuyruk.bekleyen = (kuyruk.bekleyen || []).concat(hatirlatmalar);
      yaz(KUYRUK, kuyruk);
    }
    return;
  }

  const hesap = JSON.parse(hesapHam);
  const belirtec = await erisimBelirteci(hesap);
  const saat = trSaatiKac(new Date());
  const sessiz = saat >= SESSIZ_BASLA && saat < SESSIZ_BITIS;

  const kalanlar = [];
  let gonderildi = 0, atlandi = 0;

  for (const b of tumu) {
    if (sessiz && b.oncelik !== 'yuksek') { kalanlar.push(b); atlandi++; continue; }
    try {
      for (const konu of b.konular) {
        await konuyaGonder(projeId, belirtec, konu, b);
      }
      gonderildi++;
      if (b.anahtar) gonderilenler[b.anahtar] = new Date().toISOString();
    } catch (e) {
      console.error('Gönderilemedi (' + b.tip + '): ' + e.message);
      kalanlar.push(b);
    }
  }

  // Eski gönderim kayıtlarını temizle (30 günden eski)
  const esik = Date.now() - 30 * 86400000;
  for (const k of Object.keys(gonderilenler)) {
    if (new Date(gonderilenler[k]).getTime() < esik) delete gonderilenler[k];
  }

  yaz(KUYRUK, { bekleyen: kalanlar });
  yaz(GONDERILEN, gonderilenler);
  console.log('Gönderildi: ' + gonderildi + ', sessiz saat nedeniyle bekleyen: ' + atlandi
    + ', kuyrukta kalan: ' + kalanlar.length);
}

if (require.main === module) {
  calistir().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { calistir, hatirlatmalariUret, konularUret };
