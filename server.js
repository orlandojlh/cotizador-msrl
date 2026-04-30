const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
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
        const payload = JSON.parse(body);
        const { system, text, images } = payload;

        const parts = [];
        parts.push({ text: system + '\n\nTRABAJO:\n' + (text || 'Ver imágenes adjuntas.') });

        if (images && images.length > 0) {
          images.forEach(img => {
            parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
          });
        }

        const geminiPayload = {
          contents: [{ parts }],
          generationConfig: { maxOutputTokens: 2000, temperature: 0.2 }
        };

        const postData = JSON.stringify(geminiPayload);

        const options = {
          hostname: 'generativelanguage.googleapis.com',
          path: '/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_KEY,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const apiReq = https.request(options, apiRes => {
          let data = '';
          apiRes.on('data', chunk => data += chunk);
          apiRes.on('end', () => {
            console.log('Status:', apiRes.statusCode);
            console.log('Response:', data.substring(0, 300));
            try {
              const parsed = JSON.parse(data);
              const txt = parsed.candidates?.[0]?.content?.parts?.[0]?.text
                || parsed.error?.message
                || JSON.stringify(parsed).substring(0, 300);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ content: [{ type: 'text', text: txt }] }));
            } catch (e) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ content: [{ type: 'text', text: 'Parse error: ' + data.substring(0, 200) }] }));
            }
          });
        });

        apiReq.on('error', err => {
          console.error('Error:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ content: [{ type: 'text', text: 'Error red: ' + err.message }] }));
        });

        apiReq.write(postData);
        apiReq.end();

      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: [{ type: 'text', text: 'Error request: ' + e.message }] }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('Cotizador MSR&L (Gemini 2.0) puerto ' + PORT);
});
