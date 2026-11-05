# MVP doğrulaması

5 Kasım 2026.

**6 otomatik test geçti.**

- Gerçek yerel WebSocket relay'ine iki istemci: oda oluşturma/katılma, play, pause, seek, playbackRate, host heartbeat ve guest resync.
- Üçüncü bağlantıyı reddetme, reconnect ile durum/theater geri alma, leave ve oda expiration.
- Geçersiz message type, ek URL alanı ve geçersiz zaman değerini reddetme; flood bağlantısını kapatma.
- İki izole service-worker JavaScript bağlamı + gerçek WebSocket: ortak kontrol, sayfa yenilenmesini temsil eden yeni player raporu, otomatik reconnect ve leave. Chrome API'leri bu testte taklit edilir.
- Content script DOM simülasyonu: çoklu videoda büyük player seçimi, play/pause/rate, küçük/orta/büyük drift, theater CSS/scroll geri yükleme ve Esc olayı.
- Fullscreen helper'ın API çağrısını sayfa içi tıklamaya kadar yapmaması (DOM simülasyonu).
- JavaScript syntax kontrolü ve `npm audit --omit=dev`: açık bulunmadı (kilitli ws 8.22.1).

**Doğrulanmayanlar:** gerçek Chrome/Edge'de iki profil, browser autoplay/fullscreen izinleri, gerçek iframe/site CSS davranışları, public WSS deployment ve iki farklı ülke bağlantısı. Ortamda yerel tarayıcı yoktu; Playwright Chromium indirmesi geçersiz ZIP döndürdüğü için gerçek tarayıcı testi yapılamadı. Simülasyonlar bu testlerin yerine geçmiş sayılmaz.

Public deployment sonrası kısa kabul testi: iki bilgisayarda aynı video → create/join → A play → B pause → A seek → B rate → Theater/ESC → Real Fullscreen sayfa düğmesi → bir sayfayı yenile → kısa ağ kesintisi/reconnect. Ardından birden fazla video ve iframe içeren sayfayı deneyin. Her iki ekranda zamanı karşılaştırın; video trafiğinin her tarayıcının kendi medya kaynağından geldiğini Network panelinde doğrulayın.
