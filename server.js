const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

function geminiRequest(parts, callback) {
  const payload = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { maxOutputTokens: 2000, temperature: 0.2 }
  });
  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: '/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_KEY,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };
  const req = https.request(options, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      try {
        const p = JSON.parse(data);
        if (p.error) return callback(p.error.message, null);
        const txt = p.candidates?.[0]?.content?.parts?.[0]?.text;
        callback(null, txt || 'Sin respuesta de Gemini.');
      } catch(e) { callback('Parse error: ' + data.substring(0,100), null); }
    });
  });
  req.on('error', e => callback(e.message, null));
  req.write(payload);
  req.end();
}

function groqRequest(system, text, callback) {
  const payload = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 2000,
    messages: [{ role: 'system', content: system }, { role: 'user', content: text }]
  });
  const options = {
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY, 'Content-Length': Buffer.byteLength(payload) }
  };
  const req = https.request(options, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      try {
        const p = JSON.parse(data);
        const txt = p.choices?.[0]?.message?.content;
        callback(null, txt || 'Sin respuesta de Groq.');
      } catch(e) { callback('Error Groq', null); }
    });
  });
  req.on('error', e => callback(e.message, null));
  req.write(payload);
  req.end();
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/cotizar') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { system, text, images } = JSON.parse(body);
        const hasImages = images && images.length > 0;

        const respond = (txt) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ content: [{ type: 'text', text: txt }] }));
        };

        if (hasImages) {
          // Con imágenes: usar Gemini
          const parts = [{ text: system + '\n\nTRABAJO:\n' + (text || 'Analiza las imágenes.') }];
          images.forEach(img => parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } }));

          geminiRequest(parts, (err, txt) => {
            if (err && err.includes('quota')) {
              // Quota excedida: esperar 35s y reintentar
              console.log('Quota excedida, reintentando en 35s...');
              setTimeout(() => {
                geminiRequest(parts, (err2, txt2) => {
                  if (err2) {
                    // Fallback: Groq sin imagen
                    const textFallback = (text || '') + '\n[No se pudo procesar la imagen. Cotiza basándote en la descripción.]';
                    groqRequest(system, textFallback, (e3, t3) => respond(t3 || 'Error: ' + e3));
                  } else respond(txt2);
                });
              }, 35000);
            } else if (err) {
              respond('Error Gemini: ' + err);
            } else {
              respond(txt);
            }
          });

        } else {
          // Sin imágenes: usar Groq (más rápido y sin límites)
          groqRequest(system, text || '', (err, txt) => {
            if (err) respond('Error: ' + err);
            else respond(txt);
          });
        }

      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: [{ type: 'text', text: 'Error: ' + e.message }] }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => console.log('Cotizador MSR&L (Gemini+Groq) puerto ' + PORT));
