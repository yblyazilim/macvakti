// fcm.js — Bildirim aboneliği (Capacitor Push Notifications).
// Konu (topic) tabanlı: kullanıcı kaydı tutulmaz, sunucu maliyeti yoktur.
// Tarayıcıda çalışırken sessizce devre dışı kalır.

(function () {
  'use strict';

  var aboneOlunan = [];

  function hazirMi() {
    return window.Capacitor && window.Capacitor.Plugins &&
           window.Capacitor.Plugins.PushNotifications;
  }

  function eklenti() { return window.Capacitor.Plugins.PushNotifications; }
  function fcmEklenti() {
    var p = window.Capacitor.Plugins;
    return p.FCM || p.Fcm || null;
  }

  async function izinIste() {
    if (!hazirMi()) return false;
    try {
      var sonuc = await eklenti().checkPermissions();
      if (sonuc.receive !== 'granted') {
        sonuc = await eklenti().requestPermissions();
      }
      if (sonuc.receive !== 'granted') return false;
      await eklenti().register();
      return true;
    } catch (e) {
      console.log('bildirim izni alinamadi', e);
      return false;
    }
  }

  // Konu aboneliklerini istenen listeye eşitler.
  async function konularaAbone(konular) {
    if (!hazirMi()) return;
    var fcm = fcmEklenti();
    if (!fcm) {
      // SESSIZ KALMA. Eklenti yoksa hicbir konuya abone olunmaz ve
      // bildirim hic gelmez; bunun gorunmez kalmasi en kotu senaryo.
      console.error('[fcm] FCM eklentisi yok - konu aboneligi YAPILAMADI');
      window.__fcmDurum = { hata: 'FCM eklentisi yok', konular: konular || [] };
      return;
    }

    var istenen = konular || [];
    // Artık istenmeyenlerden çık
    for (var i = 0; i < aboneOlunan.length; i++) {
      if (istenen.indexOf(aboneOlunan[i]) < 0) {
        try { await fcm.unsubscribeFrom({ topic: aboneOlunan[i] }); } catch (e) {}
      }
    }
    // Yenilere gir
    for (var j = 0; j < istenen.length; j++) {
      if (aboneOlunan.indexOf(istenen[j]) < 0) {
        try { await fcm.subscribeTo({ topic: istenen[j] }); } catch (e) {}
      }
    }
    aboneOlunan = istenen.slice();
    window.__fcmDurum = { hata: null, konular: aboneOlunan.slice() };
    console.log('[fcm] abone olunan konular: ' + aboneOlunan.join(', '));
  }

  function dinleyicileriKur() {
    if (!hazirMi()) return;
    eklenti().addListener('registration', function () {
      // Belirteç sunucuya gönderilmez; konu tabanlı çalışıyoruz.
    });
    eklenti().addListener('registrationError', function (h) {
      console.log('bildirim kaydi hatasi', h);
    });
    eklenti().addListener('pushNotificationActionPerformed', function (olay) {
      var veri = olay && olay.notification && olay.notification.data;
      if (veri && veri.macId && typeof window.macaGit === 'function') {
        window.macaGit(veri.macId);
      }
    });
  }

  window.FCMAbone = function (konular) { konularaAbone(konular); };
  window.FCMIzinIste = izinIste;

  document.addEventListener('deviceready', function () {
    dinleyicileriKur();
    izinIste();
  }, false);

  // Capacitor bazen script'ten sonra hazir olur; birkac kez dene.
  var deneme = 0;
  (function baslat() {
    if (hazirMi()) { dinleyicileriKur(); izinIste(); return; }
    if (++deneme < 20) setTimeout(baslat, 250);
  })();
})();
