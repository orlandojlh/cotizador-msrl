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

        // Construir partes del mensaje para Gemini
        const parts = [];

        // System prompt + texto del usuario
        parts.push({ text: system + '\n\nTRABAJO A COTIZAR:\n' + text });

        // Imágenes si las hay
        if (images && images.length > 0) {
          images.forEach(img => {
            parts.push({
              inline_data: {
                mime_type: img.mimeType,
                data: img.data
              }
            });
          });
          parts.push({ text: 'Analiza las imágenes anteriores junto con la descripción para generar la cotización.' });
        }

        const geminiPayload = {
          contents: [{ parts }],
          generationConfig: {
            maxOutputTokens: 1500,
            temperature: 0.3
          }
        };

        const postData = JSON.stringify(geminiPayload);
        const apiPath = `/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

        const options = {
          hostname: 'generativelanguage.googleapis.com',
          path: apiPath,
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
            try {
              const geminiRes = JSON.parse(data);
              const text = geminiRes.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta.';
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ content: [{ type: 'text', text }] }));
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Error procesando respuesta de Gemini' }));
            }
          });
        });

        apiReq.on('error', err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });

        apiReq.write(postData);
        apiReq.end();

      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request inválido' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('Cotizador MSR&L (Gemini) corriendo en puerto ' + PORT);
});
