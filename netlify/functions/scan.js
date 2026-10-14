// Netlify Function: baca foto struk memakai API Claude.
// Env var di Netlify: ANTHROPIC_API_KEY (wajib), CLAUDE_MODEL (opsional), ALLOWED_ORIGIN (opsional, mis. https://namamu.netlify.app)
const PROMPT = "Kamu membaca foto struk restoran atau pesan-antar. Keluarkan HANYA JSON (tanpa teks lain, tanpa markdown) berbentuk:\n{\"currency\":\"IDR\",\"items\":[{\"name\":\"...\",\"price\":0,\"discount\":0}],\"tax_amount\":0,\"tax_percent\":null,\"service_amount\":0,\"service_percent\":null,\"discount_amount\":0,\"shipping\":0,\"platform_fee\":0,\"total\":0}\nAturan: tulis semua angka persis seperti tercetak di struk, JANGAN dibulatkan dan JANGAN dikonversi mata uang. Gunakan titik untuk desimal dan tanpa pemisah ribuan (struk rupiah 35.000 ditulis 35000; struk dolar 44.00 ditulis 44.00; 2.47 ditulis 2.47). Bila tidak ada simbol mata uang, tebak dari konteks struk. price = harga total baris itu (sudah dikali qty; jika qty>1 tulis misalnya \"Es Teh x2\" di name). discount di dalam item = potongan khusus item itu (positif). discount_amount = total diskon/voucher/promo tingkat keseluruhan (positif). Isi 0 bila tidak ada, percent null bila tidak tercetak. total = total akhir yang dibayar di struk. Jangan memasukkan baris subtotal, pajak, service, diskon, atau ongkir sebagai item. currency = kode ISO 3 huruf.";

const json = (code, obj) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: 'no_key' });

  const allowed = process.env.ALLOWED_ORIGIN;
  const origin = event.headers.origin || event.headers.referer || '';
  if (allowed && !origin.startsWith(allowed)) return json(403, { error: 'origin' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'json' }); }
  const { image, mediaType } = body;
  const okType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType);
  // batas ~4 MB base64 supaya aman dari limit 6 MB Netlify
  if (typeof image !== 'string' || !image || image.length > 4_500_000 || !okType) {
    return json(400, { error: 'image' });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-5-5',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });
    if (!r.ok) return json(502, { error: 'upstream', status: r.status });
    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b < a) return json(502, { error: 'parse' });
    return json(200, JSON.parse(text.slice(a, b + 1)));
  } catch (e) {
    return json(502, { error: 'fail' });
  }
};
