// test-bildirim.js — Tek bir konuya elle test bildirimi gönderir.
// Amaç: zincirin (uygulama aboneliği → FCM → telefon) gerçekten
// çalıştığını doğrulamak. Kuyruğa dokunmaz, dosya yazmaz.
// Bilerek kendi kendine yeter: bildirim-gonder.js'i değiştirmeden çalışır.

'use strict';
const crypto = require('crypto');

async function erisimBelirteci(hesap) {
  const simdi = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const imzalanacak = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: hesap.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: simdi,
    exp: simdi + 3600
  });
  const imza = crypto.createSign('RSA-SHA256')
    .update(imzalanacak).sign(hesap.private_key, 'base64url');

  const y = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: imzalanacak + '.' + imza
    })
  });
  if (!y.ok) throw new Error('Belirteç alınamadı: ' + y.status);
  return (await y.json()).access_token;
}
async function calistir() {
  const proje = process.env.FIREBASE_PROJE;
  const ham = process.env.FIREBASE_HESAP_JSON;
  const konu = String(process.env.KONU || '').trim();

  if (!proje) throw new Error('FIREBASE_PROJE tanımlı değil');
  if (!ham) throw new Error('FIREBASE_HESAP_JSON tanımlı değil');
  if (!konu) throw new Error('KONU boş olamaz');
  if (!/^[a-zA-Z0-9_.~%-]+$/.test(konu)) throw new Error('Konu adı geçersiz: ' + konu);

  const belirtec = await erisimBelirteci(JSON.parse(ham));

  const y = await fetch('https://fcm.googleapis.com/v1/projects/' + proje + '/messages:send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + belirtec, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        topic: konu,
        notification: {
          title: process.env.BASLIK || 'Maç Vakti',
          body: process.env.GOVDE || 'Test bildirimi.'
        },
        data: { tip: 'test' },
        android: {
          priority: 'HIGH',
          notification: { channel_id: 'mac_bildirimleri' }
        }
      }
    })
  });
  const metin = await y.text();
  if (!y.ok) {
    console.error('[test] FCM ' + y.status + ': ' + metin.slice(0, 300));
    if (/NOT_FOUND|INVALID_ARGUMENT/.test(metin)) {
      console.error('[test] Bu konuya HİÇ abone olunmamış olabilir.');
    }
    process.exit(1);
  }
  console.log('[test] "' + konu + '" konusuna bildirim gönderildi.');
  console.log('[test] Yanıt: ' + metin.slice(0, 200));
  console.log('[test] Telefonda çıkmazsa: bildirim izni, pil optimizasyonu veya "zorla durdur".');
}

calistir().catch((e) => { console.error('[test] HATA: ' + e.message); process.exit(1); });
