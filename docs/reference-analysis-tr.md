# Teknik inceleme: `khrome/ascii-art` ve README odaklı yeni yaklaşım

Bu belge, `khrome/ascii-art` deposunun mimari yaklaşımını ve README ASCII Studio'nun neden farklı tasarlandığını açıklar. Amaç, referans projeyi kopyalamak değil; güçlü fikirlerini ayırıp GitHub README kullanımına özel, güncel ve daha dar kapsamlı bir araç tasarlamaktır.

## 1. Referans projenin kapsamı

`khrome/ascii-art`, yalnızca görsel dönüştüren küçük bir paket değildir. Aşağıdaki alanları ortak bir ANSI/metin ızgarası yaklaşımı altında toplar:

- görsel işleme;
- Figlet ve UTF yazı tipleri;
- ANSI renk ve metin stilleri;
- tablolar ve grafikler;
- çok satırlı metin birleştirme ve kompozisyon;
- tarayıcı ile Node.js desteği;
- callback, Promise ve zincirleme API biçimleri.

Bu geniş kapsam terminal uygulamaları için anlamlıdır. Ancak GitHub README'de temel ihtiyaç daha farklıdır: çıktı ANSI terminali için değil, GitHub Flavored Markdown ve web tabanlı kod bloğu için güvenli olmalıdır.

## 2. Referans görsel hattının incelenmesi

Referansın görüntü modülü ayrı bir paket olan `ascii-art-image` üzerinden kullanılır. Temel akış şu şekildedir:

1. Node tarafında `canvas` ile görsel okunur ve bir Canvas 2D yüzeyine çizilir.
2. Hedef genişlik/yükseklik belirlenir; genişlik verilmezse varsayılan 80 sütundur.
3. Görüntü hedef boyuta indirilir.
4. Her pikselin değeri `(r + g + b) / 3` ile hesaplanır.
5. Bu değer, önceden tanımlı bir karakter dizisindeki konuma eşlenir.
6. Karakterin önüne ANSI renk kodu eklenir.
7. İsteğe bağlı line-art, braille stipple, posterize veya blended modları uygulanabilir.

### Güçlü yanları

- Karakter yoğunluk dizileri açık ve özelleştirilebilirdir.
- ANSI rengi, çizgi sanatı ve braille tabanlı detay modları yaratıcıdır.
- Tarayıcı ve Node için ortak kavramlar sunar.
- Görsel, font, tablo ve metin kompozisyonunu aynı kütüphane ailesinde birleştirir.

### README açısından sınırlamalar

#### ANSI merkezlilik

ANSI kaçış dizileri terminal için yararlıdır; README'de doğrudan taşınabilir bir renk mekanizması değildir. Düz ASCII elde etmek için renk kodlarını temizlemek gerekir; bu da ana tasarımın dışında kalır.

#### Parlaklık hesabı

Aritmetik RGB ortalaması insan görsel algısıyla iyi örtüşmez. Yeşil kanalın algılanan parlaklığa katkısı mavi kanaldan çok daha yüksektir. Bu nedenle eş parlaklıkta algılanmayan renkler aynı karaktere düşebilir.

#### Sabit geometri düzeltmesi

Terminal karakterlerinin en/boy oranı için sabit katsayılar kullanmak bazı font ve yüzeylerde çalışır, fakat GitHub'ın web kod bloğu, yerel terminal ve SVG monospace yığını aynı hücre oranına sahip değildir. Kullanıcının ayarlayabildiği bir oran daha güvenlidir.

#### Detay kaybı

Doğrudan hedef boyuta indirme ve tek parlaklık değerini karakter dizisine eşleme, düşük kontrastlı yüzlerde ve dokulu görsellerde ayrıntıyı hızlı kaybeder. Posterize/stipple modları başka bir estetik sunar; fakat düz README ASCII'si için otomatik seviyeleme ve kontrollü dithering daha uygun bir temel oluşturur.

#### Markdown güvenliği

Bir ASCII karakter dizisi backtick veya tilde içerebilir. Sabit üç backtick ile üretilen kod bloğu, sanat içinde aynı kapanış dizisi oluşursa bozulabilir. Referans projenin ana hedefi Markdown olmadığı için bu durum birincil tasarım konusu değildir.

#### Node bağımlılığı

`canvas`, yerel/native bağımlılıkları nedeniyle bazı geliştirme ve CI ortamlarında ek kurulum maliyeti çıkarabilir. Sadece CLI görsel çözümleme ve yeniden boyutlandırma için Sharp/libvips daha yalın bir seçenek sunar.

## 3. Neden TypeScript seçildi?

Bu proje için en uygun dil TypeScript'tir:

- Tarayıcı arayüzü ve Node CLI aynı çekirdeği paylaşabilir.
- Ham piksel verisi, seçenekler ve çıktı biçimleri tiplerle açıkça tanımlanır.
- Vite ile statik bir GitHub Pages sitesi üretmek kolaydır.
- Sharp'ın Node API'si ve Canvas'ın tarayıcı API'si aynı `RgbaImage` sözleşmesine bağlanabilir.
- Katı tip kontrolü, görüntü boyutu/kanal sayısı gibi hata üretmeye yatkın alanlarda erken güvence sağlar.
- Kullanıcı tarafında Python veya yerel uygulama kurulumu gerekmeden web sürümü çalışır; otomasyon için de CLI kalır.

Python, OpenCV/Pillow ekosistemiyle güçlü bir alternatif olurdu; ancak aynı kod tabanıyla tarayıcıda yerel çalışan arayüz üretmek daha karmaşık hale gelirdi. Rust/WASM yüksek performans sağlayabilirdi; fakat bu ölçek için derleme ve bakım maliyeti gereksiz olurdu. TypeScript burada dağıtım kolaylığı, kullanıcı deneyimi ve yeterli performans arasında en iyi dengeyi kurar.

## 4. Yeni görüntü işleme hattı

### 4.1 Yönlendirme ve yeniden boyutlandırma

CLI, EXIF yönlendirmesini uygular. Varsayılan olarak görüntü nihai karakter ızgarasından 3 kat daha büyük bir ara çözünürlüğe Lanczos3 ile indirilir; `--oversample` seçeneği bu oranı 1–5 arasında ayarlayabilir. Son hücre ortalaması bu ara örneklerden hesaplanır. Böylece tek adımlı sert küçültmeye göre daha kararlı kenarlar elde edilir.

Tarayıcıda aynı yaklaşım yüksek kaliteli Canvas ölçekleme ile uygulanır; 140 sütunun altındaki çıktılar 3 kat, daha geniş çıktılar 2 kat örneklenir.

### 4.2 Karakter hücresi en/boy düzeltmesi

Çıktı satır sayısı şu ilişkiyle hesaplanır:

```text
satır = (kaynak_yükseklik / kaynak_genişlik) × sütun × hücre_oranı
```

Varsayılan `hücre_oranı = 0.5` değeridir. Kullanıcı bunu GitHub görünümüne, seçtiği yazı tipine veya görselin kompozisyonuna göre değiştirebilir.

### 4.3 Alfa kompoziti

Şeffaf piksellerin siyah kabul edilmesi logolarda büyük hatalara yol açar. Her kanal seçili arka planla şu şekilde birleştirilir:

```text
sonuç = ön_plan × alfa + arka_plan × (1 - alfa)
```

Varsayılan arka plan GitHub'ın açık temasıyla uyumlu beyazdır.

### 4.4 Doğrusal sRGB bağıl parlaklık

Önce her sRGB kanalı doğrusal ışık uzayına çevrilir, sonra:

```text
Y = 0.2126 R + 0.7152 G + 0.0722 B
```

kullanılır. Bu yaklaşım, yeşil ve mavi gibi kanalların algısal etkisini aritmetik ortalamadan daha doğru temsil eder.

### 4.5 Yüzdelik tabanlı otomatik seviyeleme

En düşük ve en yüksek tekil pikseller, tüm görüntünün kontrastını gereksiz yere belirlememelidir. Varsayılan olarak yüzde 1 ve yüzde 99 noktaları yeni siyah/beyaz sınırları seçilir. Bu işlem düşük kontrastlı fotoğraflarda karakter rampasının daha büyük bölümünü kullanır.

### 4.6 Yerel detay güçlendirme

3×3 Gauss bulanıklığıyla yerel düşük frekanslı taban hesaplanır. Orijinal değer ile bu taban arasındaki fark, ayarlanabilir miktarda geri eklenir:

```text
detaylı = temel + (temel - bulanık) × detay_miktarı
```

Bu, yüz hatları, kumaş dokusu ve küçük konturların küçültme sırasında tamamen kaybolmasını azaltır.

### 4.7 Ton ayarları

Yerel detaydan sonra kontrast, parlaklık ve gamma uygulanır. İsteğe bağlı ters çevirme en son parlaklık eksenini çevirir. Sıra sabit ve deterministiktir.

### 4.8 Dithering

Desteklenen modlar:

- **Atkinson:** daha hafif hata yayılımı; README için varsayılan ve dengeli görünüm.
- **Floyd–Steinberg:** daha fazla ton ayrımı; geniş ve detaylı çıktılarda etkili.
- **Bayer 4×4:** düzenli/desenli, tamamen yerel ve hızlı kuantizasyon.
- **None:** logo ve keskin çizgi sanatı için doğrudan eşleme.

Hata yayılımı satır yönünü dönüşümlü değiştirir; bu “serpentine” tarama tek yönde oluşan görsel eğilimi azaltır.

### 4.9 Yapısal kenar glifleri

Sobel gradyanı güçlü bir kontur bulduğunda, gradyan yönü `-`, `|`, `/` veya `\` glifine çevrilebilir. Bu özellik yoğunluk rampasının kaybettiği logo ve çizim sınırlarını geri kazandırır. Fotoğraf presetlerinde varsayılan olarak kapalıdır; çünkü aşırı kullanım doğal dokuyu yapaylaştırabilir.

## 5. Markdown için özel güvenlik

### Dinamik çit seçimi

Üretici, sanat içindeki en uzun backtick ve tilde dizilerini ayrı ayrı tarar. Her iki aday çit için en az üç karakter ve içerideki en uzun diziden bir fazla karakter kullanır. Daha kısa güvenli aday seçilir.

Örnek:

`````text
Sanat içinde ``` varsa → ~~~text ... ~~~
Sanat içinde ~~~ varsa → ```text ... ```
Her ikisi de üçlü ise   → ````text ... ````
`````

Bu sayede özel bir karakter rampası Markdown bloğunu kapatamaz.

### `<details>` desteği

Büyük sanat, isteğe bağlı olarak `<details>` içinde üretilebilir. `<summary>` içeriği HTML kaçışından geçirilir ve kod bloğundan önce/sonra gerekli boş satırlar korunur.

### Sondaki boşluklar

Sağ taraftaki boşluklar görüntü için gerekli değildir ve diff'leri büyütür. Bu nedenle varsayılan olarak satır sonlarından temizlenir. Sol girintiler korunur. CLI'da `--keep-trailing-spaces` ile kapatılabilir.

## 6. SVG stratejisi

GitHub kod bloğunun renkleri kullanıcının temasına göre değişir. Bunun avantajı doğal tema uyumudur; dezavantajı kesin görsel kontrolün olmamasıdır.

SVG çıktısı:

- açıkça tanımlanmış ön/arka plan rengi;
- GitHub'a yakın monospace font yığını;
- sabit satır yüksekliği;
- `xml:space="preserve"`;
- HTML/XML kaçışı;
- `role="img"`, `<title>` ve `aria-labelledby`;
- hesaplanan viewBox ve boyut

kullanır. Bu nedenle README kahraman görseli gibi kesin sunum gerektiren alanlarda daha kararlıdır.

## 7. Web ve CLI ayrımı

### Web

- Vite ile derlenen statik uygulama;
- framework gerektirmeyen TypeScript/DOM arayüzü;
- sürükle-bırak, dosya seçme ve panodan görsel yapıştırma;
- canlı önizleme;
- ASCII, Markdown ve SVG kopyalama/indirme;
- uzak API, analitik veya dosya yükleme yok.

### CLI

- Sharp ile çözümleme, EXIF düzeltme, Lanczos3 resize ve ham RGBA alma;
- preset ve tüm önemli parametreler için argüman doğrulaması;
- stdout veya dosya çıktısı;
- `all` biçiminde `.txt`, `.md` ve `.svg` eşzamanlı üretim;
- CI ve README üretim scriptlerine uygun deterministik sonuç.

## 8. Test stratejisi

Testler algoritmanın tüm fotoğraf kalitesini tek başına ölçemez; ancak kritik değişmezleri korur:

- siyah ve beyazın doğru uç değerlere gitmesi;
- yeşilin maviye göre daha yüksek parlaklık ağırlığı;
- yoğun karakterin karanlık piksele eşlenmesi;
- şeffaf pikselin seçili arka planla birleşmesi;
- istenen sütun sayısının korunması;
- aynı giriş/seçenek için aynı dithering çıktısı;
- Markdown çit çakışmalarının güvenli çözümü;
- `<summary>` ve SVG metninde kaçış;
- SVG erişilebilirlik başlığı.

Görsel kalite için örnek kaynak ve üç çıktı biçimi `examples/` klasörüne eklenmiştir.

## 9. Sonuç

Referans proje güçlü ve yaratıcı bir terminal/ANSI kompozisyon kütüphanesidir. Yeni proje onun genel amaçlı kapsamını tekrar etmeye çalışmaz. Bunun yerine tek bir işi daha derin ele alır: bir görseli, GitHub README'de doğrudan kullanılabilecek ayrıntılı, güvenli ve ayarlanabilir ASCII çıktısına dönüştürmek.

Bu nedenle temel teknik kararlar şunlardır:

- terminal ANSI'si yerine düz metin ve SVG;
- RGB ortalaması yerine doğrusal sRGB parlaklığı;
- sabit bozulma yerine ayarlanabilir hücre oranı;
- tek adımlı eşleme yerine oversampling, seviyeleme, detay ve dithering;
- sabit Markdown çiti yerine içerik farkındalıklı çit;
- büyük zincirleme API yerine küçük, saf ve test edilebilir çekirdek;
- native Canvas yerine CLI için Sharp, tarayıcı için Canvas;
- tek kullanım biçimi yerine yerel web arayüzü ve otomasyon CLI'ı.
