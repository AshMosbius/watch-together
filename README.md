# Watch Together — MVP

Chrome 116+ ve güncel Edge için Manifest V3 eklentisi. Her kullanıcı aynı videoyu kendi bağlantısıyla açar. Relay yalnız oynatma durumu ve görünüm olaylarını taşır; video, stream, sayfa adresi veya video adresi göndermez. İki bilgisayarın aynı ağda olması gerekmez.

**Durum:** Kod ve deployment yapılandırması hazır. Public servis henüz deploy edilmedi; gerçek bir WSS adresi girilmeden internet üzerinden oda kurulamaz.

## 1. Public relay — bir kez

Seçilen servis: **Render Free Web Service**. Bir GitHub repository'sine bu klasörün içeriğini (`render.yaml` repository kökünde olacak şekilde) yükleyin. Render'da giriş yapın, **New → Blueprint**, repository'yi seçin ve ücretsiz `watch-together-relay` servisini oluşturun. Blueprint Node sürümünü, build/start komutlarını ve health check'i ayarlar. Alternatif deployment seçenekleri gerekmiyor.

Servis hazır olduğunda `https://SERVIS.onrender.com/health` adresinde `ok` görünmelidir. Eklentinin Relay alanına iki bilgisayarda da `wss://SERVIS.onrender.com` yazın. TLS'yi Render sağlar; backend portunu internete kendiniz açmazsınız.

İstenirse dağıtmadan önce `python tools/set-endpoint.py wss://SERVIS.onrender.com` çalıştırın: adres eklentinin varsayılanı olur. `extension` klasörünü yeniden ZIP'leyin.

Ücretsiz servis boşta 15 dakika sonra uyuyabilir; ilk bağlantı yaklaşık bir dakika sürebilir. Otomatik retry bunu bekler. Free tier kota/kesintileri olabilir; ödeme veya kimlik doğrulaması istenirse o aşamada hesap sahibi tamamlamalıdır. Kalıcı veri tabanı yok: servis restart/deploy olursa odalar kaybolur, yeni oda oluşturun.

Resmî kaynaklar: https://render.com/docs/free · https://render.com/docs/websocket

## 2. İki bilgisayara kurulum

1. ZIP'i normal bir klasöre çıkarın; klasörü sonra silmeyin/taşımayın.
2. Chrome: `chrome://extensions` / Edge: `edge://extensions`.
3. **Developer Mode → Load unpacked → extension** klasörünü seçin.
4. Eklentiyi araç çubuğuna sabitleyin. Zaten açık olan video sayfasını yenileyin.

Geniş HTTP/HTTPS site izni, farklı siteler ve iframe'lerde video bulabilmek içindir. Browser'ın site erişimi ayarı enjeksiyonu engellerse izin verip sayfayı yenileyin. Mağaza yayını gerekmez.

## 3. Birlikte kullanım

- A ve B aynı içeriği kendileri açar; gerekiyorsa kendi hesaplarıyla giriş yapar. İlk kullanımdan önce videoyu bir kez oynatıp durdurmak autoplay engelini azaltır.
- A: eklentiyi açın, WSS adresini girin, **Create Room → Copy Code**.
- B: aynı WSS adresini girin, kodu yapıştırın, **Join Room**.
- **Connected · 2/2** görünce izlemeye başlayın. İki kullanıcı da play/pause/seek/rate kontrolüne sahiptir. Kod bir davet sırrıdır; yalnız izleme arkadaşınızla paylaşın.
- **Leave Room** yalnız bulunduğunuz sekmeyi odadan çıkarır. Popup kapanınca bağlantı devam eder. Video sekmesi yenilenince mevcut odaya bağlanır; tarayıcı tamamen kapatılırsa yeniden katılın.

## Görünüm

**Theater Mode:** videoyu bulunduğu frame'in viewport'una büyütür, oranını korur; diğer kullanıcıya otomatik uygulanır. Esc veya Exit Theater ile özgün inline stiller ve scroll konumu geri yüklenir. Video DOM'da taşınmaz. Iframe içindeki video, iframe sınırının dışına büyüyemez; mümkünse player sayfasını doğrudan açın.

**Real Fullscreen:** popup düğmesi, video sayfasında tıklanacak ikinci bir düğme gösterir. Fullscreen API o yerel tıklamadan çağrılır. Diğer kullanıcı fullscreen'e girerse “Other viewer entered fullscreen — click to match” görünür. Remote fullscreen zorlanmaz. Iframe'in fullscreen policy'si izin vermiyorsa Theater kullanın.

## Destek / sınırlar

- Normal HTML5 video, HTML5 video kullanan custom player, açık shadow DOM ve script enjeksiyonuna izin verilen iframe'ler (cross-origin dahil).
- Görünür videolar arasında alan ve oynama durumuna göre seçim; küçük thumbnail yerine büyük video tercih edilir. İki benzer boyutta aktif player varsa yanlış seçim olabilir.
- Erişilemeyen iframe bulunan ve kontrol edilebilir video bulunamayan sayfada **Player detected but not controllable** gösterilir. Bu iframe sezgisidir; kapalı frame'in gerçekten video içerdiği doğrulanamaz.
- DRM/paywall/abonelik/ülke engeli aşılmaz. YouTube gibi özel siteler için adapter yok. Canvas player, kapalı shadow root, reklam geçişleri ve ağır site CSS'i garanti edilmez.
- Canlı yayın/DVR yerine süreli film/dizi hedeflenir. İçeriğin aynı olması gerekir; farklı reklam/kurgular senkronu bozar. Buffering ve autoplay engeli gecikmeye yol açabilir.
- Heartbeat yaklaşık 4 saniyede bir: ≤0.25 sn fark yok sayılır; 0.25–1.5 sn fark kısa ±%5 rate düzeltmesiyle, >1.5 sn fark seek ile düzeltilir. Host heartbeat saati olur; her iki kullanıcı bilinçli kontroller gönderebilir. Frame düzeyinde eşleşme vaat edilmez.

## Güvenlik ve geliştirme

144 bit rastgele oda kodu; oda başına iki bağlantı; 30 dakika hareketsizlikte silme; sıkı mesaj/alan doğrulaması; 2 KB payload; bağlantı ve mesaj hızı sınırı. Room code ve oynatma durumu bellektedir; uygulama bunları loglamaz. Hesap, cookie, medya proxy'si, uzaktan kod çalıştırma veya eval yok. WSS zorunlu; yalnız localhost testinde WS kabul edilir.

Backend: Node 22+, `cd backend && npm ci && npm start` (port 3000). Yerel test adresi `ws://localhost:3000`; bu adres farklı bilgisayarlarda internet kullanımının yerine geçmez. Production tek instance olmalıdır; odalar bellekte tutulur.

Test: backend'de `npm ci`, proje kökünde `node --test test/*.test.js`. `TEST_RESULTS.md` kapsamı açıklar. `playerAdapter` arayüzü `extension/content.js` içindedir; sonraki site adaptörleri buraya eklenebilir.
