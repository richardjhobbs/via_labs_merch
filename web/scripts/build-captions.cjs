// Captions for "A merchandiser's day" (landing video) in all six locales.
// Times come from a word-level transcript of web/public/video/via-merch-intro.mp4 (faster-whisper small.en),
// matched to Richard's final English script. Writes web/public/video/via-merch-intro.<locale>.vtt.
// Usage (from web/): node scripts/build-captions.cjs public/video
const fs = require('fs'), path = require('path');
const CUES = [
  [0.00, 2.60, {
    en: 'The admin is done before she arrives.',
    de: 'Die Verwaltung ist erledigt, bevor sie ankommt.',
    bn: 'তিনি পৌঁছানোর আগেই কাগুজে কাজ শেষ।',
    zh: '她到公司之前，杂务已经处理完了。',
    vi: 'Việc giấy tờ đã xong trước khi cô đến.',
    es: 'El trabajo administrativo está hecho antes de que llegue.' }],
  [2.70, 7.90, {
    en: 'Overnight, her agent read every message,\ncaptured the dates, and drafted the replies.',
    de: 'Über Nacht hat ihr Agent jede Nachricht gelesen,\ndie Termine erfasst und die Antworten entworfen.',
    bn: 'রাতের মধ্যেই তাঁর এজেন্ট প্রতিটি মেসেজ পড়েছে,\nতারিখগুলো তুলে রেখেছে, আর উত্তরের খসড়া করেছে।',
    zh: '一夜之间，她的智能体读完了每条消息，\n记下了所有日期，并起草好了回复。',
    vi: 'Qua đêm, agent của cô đã đọc mọi tin nhắn,\nghi lại các mốc ngày và soạn sẵn câu trả lời.',
    es: 'Durante la noche, su agente leyó cada mensaje,\nregistró las fechas y redactó las respuestas.' }],
  [7.96, 10.70, {
    en: 'So the day does not start in the inbox.',
    de: 'Der Tag beginnt also nicht im Posteingang.',
    bn: 'তাই দিনটা ইনবক্স দিয়ে শুরু হয় না।',
    zh: '所以，这一天不是从收件箱开始的。',
    vi: 'Vì vậy, ngày làm việc không bắt đầu từ hộp thư.',
    es: 'Así que el día no empieza en la bandeja de entrada.' }],
  [10.86, 13.20, {
    en: 'Two decisions. One tap each.',
    de: 'Zwei Entscheidungen. Je ein Tippen.',
    bn: 'দুটি সিদ্ধান্ত। প্রতিটিতে একটি ট্যাপ।',
    zh: '两个决定，各点一下。',
    vi: 'Hai quyết định. Mỗi cái một chạm.',
    es: 'Dos decisiones. Un toque cada una.' }],
  [13.30, 14.60, {
    en: 'Then she leaves.',
    de: 'Dann geht sie los.',
    bn: 'তারপর তিনি বেরিয়ে পড়েন।',
    zh: '然后她就出门了。',
    vi: 'Rồi cô lên đường.',
    es: 'Luego se va.' }],
  [14.68, 16.60, {
    en: 'The morning is for fabric.',
    de: 'Der Vormittag gehört dem Stoff.',
    bn: 'সকালটা কাপড়ের জন্য।',
    zh: '上午留给面料。',
    vi: 'Buổi sáng dành cho vải.',
    es: 'La mañana es para el tejido.' }],
  [16.66, 21.10, {
    en: 'The questions that used to wait in her inbox\nare being answered while she researches.',
    de: 'Die Fragen, die früher in ihrem Posteingang warteten,\nwerden beantwortet, während sie recherchiert.',
    bn: 'যে প্রশ্নগুলো আগে ইনবক্সে পড়ে থাকত,\nতিনি খোঁজখবর নেওয়ার সময়েই সেগুলোর উত্তর হয়ে যাচ্ছে।',
    zh: '以前积压在收件箱里的问题，\n在她做调研的同时就已经得到了答复。',
    vi: 'Những câu hỏi từng nằm chờ trong hộp thư\nđang được trả lời trong lúc cô tìm hiểu.',
    es: 'Las preguntas que antes esperaban en su bandeja\nse responden mientras ella investiga.' }],
  [21.16, 22.80, {
    en: 'She dictates on the way.',
    de: 'Unterwegs diktiert sie.',
    bn: 'পথে যেতে যেতে তিনি বলে দেন।',
    zh: '她在路上口述。',
    vi: 'Cô đọc tin nhắn trên đường đi.',
    es: 'Dicta por el camino.' }],
  [22.86, 25.80, {
    en: 'Her agent drafts the confirmation and holds it.',
    de: 'Ihr Agent entwirft die Bestätigung und hält sie zurück.',
    bn: 'তাঁর এজেন্ট কনফার্মেশনের খসড়া করে রেখে দেয়।',
    zh: '她的智能体起草好确认函，先不发出。',
    vi: 'Agent của cô soạn xác nhận và giữ lại.',
    es: 'Su agente redacta la confirmación y la retiene.' }],
  [25.86, 28.20, {
    en: 'Then it checks the record and asks back:',
    de: 'Dann prüft er den Datensatz und fragt zurück:',
    bn: 'তারপর রেকর্ড দেখে পাল্টা প্রশ্ন করে:',
    zh: '接着它核对记录，反问她：',
    vi: 'Rồi nó kiểm tra hồ sơ và hỏi lại:',
    es: 'Después revisa el registro y pregunta:' }],
  [28.30, 30.80, {
    en: 'the lab dip was approved on the eighteenth.',
    de: 'Der Lab Dip wurde am Achtzehnten freigegeben.',
    bn: 'ল্যাব ডিপ তো আঠারো তারিখেই অনুমোদিত হয়েছে।',
    zh: '色样（LAB DIP）18 号就已经批准了。',
    vi: 'lab dip đã được duyệt ngày 18.',
    es: 'el lab dip se aprobó el día dieciocho.' }],
  [30.84, 32.40, {
    en: 'Did she mean another colour?',
    de: 'Meinte sie eine andere Farbe?',
    bn: 'তিনি কি অন্য কোনো রঙের কথা বলছেন?',
    zh: '她说的是另一个颜色吗？',
    vi: 'Có phải cô muốn nói màu khác?',
    es: '¿Se refería a otro color?' }],
  [32.46, 34.25, {
    en: 'On the road, she gets a summary,',
    de: 'Unterwegs bekommt sie eine Zusammenfassung,',
    bn: 'রাস্তায় তিনি একটি সারসংক্ষেপ পান,',
    zh: '在路上，她收到一份摘要，',
    vi: 'Trên đường, cô nhận được bản tóm tắt,',
    es: 'En la carretera recibe un resumen;' }],
  [34.30, 36.55, {
    en: 'she does not have to read the whole thread.',
    de: 'sie muss nicht den ganzen Verlauf lesen.',
    bn: 'পুরো থ্রেড পড়তে হয় না।',
    zh: '不必把整串对话读完。',
    vi: 'không phải đọc cả chuỗi tin nhắn.',
    es: 'no tiene que leer toda la conversación.' }],
  [36.62, 38.80, {
    en: 'The afternoon is for the product.',
    de: 'Der Nachmittag gehört dem Produkt.',
    bn: 'বিকেলটা প্রোডাক্টের জন্য।',
    zh: '下午留给产品。',
    vi: 'Buổi chiều dành cho sản phẩm.',
    es: 'La tarde es para el producto.' }],
  [38.88, 40.70, {
    en: 'A measurement is slightly off.',
    de: 'Ein Maß weicht leicht ab.',
    bn: 'একটি মাপ সামান্য ভুল।',
    zh: '有一个尺寸稍有偏差。',
    vi: 'Một số đo hơi lệch.',
    es: 'Una medida está ligeramente desviada.' }],
  [40.78, 42.80, {
    en: 'The photo goes on the order record.',
    de: 'Das Foto kommt in den Auftragsdatensatz.',
    bn: 'ছবিটি অর্ডারের রেকর্ডে যোগ হয়।',
    zh: '照片存入订单记录。',
    vi: 'Ảnh được lưu vào hồ sơ đơn hàng.',
    es: 'La foto queda en el registro del pedido.' }],
  [42.88, 46.30, {
    en: 'The order’s sub-agent sees it\nbefore anyone writes an email.',
    de: 'Der Sub-Agent des Auftrags sieht es,\nbevor jemand eine E-Mail schreibt.',
    bn: 'কেউ ইমেইল লেখার আগেই\nঅর্ডারের সাব-এজেন্ট সেটি দেখে ফেলে।',
    zh: '还没人写邮件，\n这个订单的子智能体就已经看到了。',
    vi: 'Agent phụ của đơn hàng thấy ngay,\ntrước khi ai đó kịp viết email.',
    es: 'El subagente del pedido lo ve\nantes de que nadie escriba un correo.' }],
  [46.38, 48.20, {
    en: 'Nothing piles up behind her.',
    de: 'Hinter ihr stapelt sich nichts.',
    bn: 'তাঁর পেছনে কিছুই জমে থাকে না।',
    zh: '她身后没有任何积压。',
    vi: 'Không có gì dồn lại phía sau cô.',
    es: 'Nada se acumula a sus espaldas.' }],
  [48.26, 50.25, {
    en: 'The evening is for the customer.',
    de: 'Der Abend gehört dem Kunden.',
    bn: 'সন্ধ্যাটা বায়ারের জন্য।',
    zh: '晚上留给客户。',
    vi: 'Buổi tối dành cho khách hàng.',
    es: 'La noche es para el cliente.' }],
  [50.32, 52.30, {
    en: 'The phone stays face down.',
    de: 'Das Telefon bleibt umgedreht liegen.',
    bn: 'ফোনটা উপুড় করেই রাখা থাকে।',
    zh: '手机一直扣在桌上。',
    vi: 'Điện thoại vẫn úp mặt xuống bàn.',
    es: 'El teléfono se queda boca abajo.' }],
  [52.36, 56.30, {
    en: 'Every decision she made today is on the record,\nin three languages.',
    de: 'Jede Entscheidung, die sie heute getroffen hat, ist festgehalten,\nin drei Sprachen.',
    bn: 'আজ তিনি যত সিদ্ধান্ত নিয়েছেন, সবই রেকর্ডে আছে,\nতিনটি ভাষায়।',
    zh: '她今天做的每一个决定都有记录，\n用三种语言。',
    vi: 'Mọi quyết định hôm nay của cô đều được ghi lại,\nbằng ba ngôn ngữ.',
    es: 'Cada decisión que tomó hoy queda registrada,\nen tres idiomas.' }],
  [56.36, 59.80, {
    en: 'The ones that really needed her\nwere the ones that reached her.',
    de: 'Bei ihr kamen nur die an,\ndie sie wirklich brauchten.',
    bn: 'যেগুলোতে সত্যিই তাঁকে দরকার ছিল,\nশুধু সেগুলোই তাঁর কাছে পৌঁছেছে।',
    zh: '真正需要她的事，\n才会送到她面前。',
    vi: 'Chỉ những việc thật sự cần cô\nmới đến tay cô.',
    es: 'Solo le llegaron\nlas que de verdad la necesitaban.' }],
  [59.88, 63.50, {
    en: 'Nothing waiting on the desk,\nbecause it never piled up there.',
    de: 'Nichts wartet auf dem Schreibtisch,\nweil sich dort nie etwas angestaut hat.',
    bn: 'ডেস্কে কিছুই অপেক্ষায় নেই,\nকারণ সেখানে কখনো কিছু জমেনি।',
    zh: '桌上没有任何待办，\n因为事情从来没在那里堆积过。',
    vi: 'Không có gì chờ trên bàn,\nvì chưa bao giờ có gì dồn lại ở đó.',
    es: 'Nada espera en el escritorio,\nporque nunca se acumuló allí.' }],
  [63.56, 66.90, {
    en: 'VIA Merch. An agent for every merchandiser.',
    de: 'VIA Merch. Ein Agent für jeden Merchandiser.',
    bn: 'VIA Merch। প্রত্যেক মার্চেন্ডাইজারের জন্য একটি এজেন্ট।',
    zh: 'VIA Merch。每位跟单员，都有一个专属智能体。',
    vi: 'VIA Merch. Mỗi merchandiser một agent.',
    es: 'VIA Merch. Un agente para cada merchandiser.' }],
  [66.98, 70.80, { all: 'merch.getvia.xyz' }],
];
const LOCALES = ['en', 'de', 'bn', 'zh', 'vi', 'es'];
const ts = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = (s % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x}`; };
const dir = process.argv[2];
for (const l of LOCALES) {
  const body = CUES.map(([s, e, t], i) => `${i + 1}\n${ts(s)} --> ${ts(e)}\n${t.all || t[l]}`).join('\n\n');
  fs.writeFileSync(path.join(dir, `via-merch-intro.${l}.vtt`), `WEBVTT\n\n${body}\n`, 'utf8');
}
console.log(`wrote ${LOCALES.length} files, ${CUES.length} cues each`);
