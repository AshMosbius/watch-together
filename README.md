# Watch Together — Cloudflare backend

Render yerine kart gerektirmeyen Workers Free planı için hazırlanmıştır. Cloudflare hesabı gerekir; domain satın almak veya kredi kartı eklemek gerekmez. Birlikte izleyecek kişinin hosting hesabına ihtiyacı yoktur. Free plan kotası aşılırsa hizmet hata verebilir; ücretli plana geçmeyin.

## Mevcut GitHub repository'sine ekle

ZIP'i çıkarın ve **cloudflare klasörünü** mevcut `AshMosbius/watch-together` repository'sinin ana ekranına Add file → Upload files ile yükleyin. Klasörün kendisini sürükleyin; böylece ana ekranda backend/extension yanında cloudflare klasörü oluşur. Önceki dosyaları silmeyin.

## Cloudflare kurulumu

1. https://dash.cloudflare.com üzerinden hesap açın/giriş yapın; gerekiyorsa e-postayı doğrulayın.
2. Workers & Pages bölümünden Worker oluşturun; GitHub repository'sinden deploy yolunu seçin.
3. Repository: `AshMosbius/watch-together`, branch: `main`.
4. Worker/project name: **watch-together-relay** (wrangler.jsonc içindeki adla aynı olmalı).
5. Root directory: **cloudflare**.
6. Build command: **npm ci**. Deploy command: **npx wrangler deploy**.
7. Free planda deploy edin. `wrangler.jsonc` Durable Object binding ve SQLite migration'ı tanımlar; bunları elle eklemeyin. Domain/Pages/static site/ücretli container kullanmayın.

Oluşan `https://watch-together-relay.HESABINIZ.workers.dev/health` adresi `ok` döndürmelidir. Eklentinin Relay alanına **wss://watch-together-relay.HESABINIZ.workers.dev** girin. HESABINIZ kısmı örnektir; gerçek adresi deployment ekranından alın. İki bilgisayarda aynı adresi kullanın. Mevcut extension değişmez; Create Room / Join Room ile devam edilir.

## Teknik

Worker yalnız sync mesajlarını iletir: play, pause, seek, playbackRate, heartbeat, theater ve fullscreen bildirimi. Video/sayfa URL'si, medya ve stream kabul edilmez. Oda oluşturma/katılma/ayrılma ve bağlantı ping/pong mesajları da vardır.

WebSocket Hibernation, 144 bit oda kodu, oda başına iki kullanıcı, 30 dakika inactivity, 2 KB payload ve bağlantı başına token bucket hız sınırı uygulanır. Oda üst sınırı 100, eşzamanlı socket üst sınırı 100'dür. Oda state'i hibernation sonrası geri alınabilmesi için Cloudflare storage'a yazılır; inactivity alarmı ile silinir (yaklaşık 30–35 dakika). Oda kodunu gizli tutun. Uygulama medya veya kodları loglamaz.

Test için Node 22+: `npm ci` ardından `npm test`. Bu, Miniflare/workerd yerel Cloudflare runtime'ında iki bağımsız WebSocket istemcisiyle kontroller, oda kapasitesi, heartbeat, reconnect, theater/fullscreen mesajları ve invalid/flood mesajlarını sınar. 5 Kasım 2026: iki test geçti. Public deployment, gerçek tarayıcı ve farklı ülke testi henüz yapılmadı. Eklentinin önceki README'sindeki player/iframe/fullscreen sınırları geçerlidir.

Resmî kaynaklar:
- https://www.cloudflare.com/products/workers/ (no credit card required)
- https://developers.cloudflare.com/changelog/post/2025-04-07-durable-objects-free-tier/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
