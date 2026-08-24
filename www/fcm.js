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
    return window.Capacitor.Plugins.FCM || null;
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
    if (!fcm) return;

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

  if (hazirMi()) { dinleyicileriKur(); izinIste(); }
})();
