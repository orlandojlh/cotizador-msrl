const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.DEEPSEEK_API_KEY;

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

        // DeepSeek soporta visión con imágenes
        const userContent = [];

        if (text) {
          userContent.push({ type: 'text', text: text });
        }

        if (images && images.length > 0) {
          images.forEach(img => {
            userContent.push({
              type: 'image_url',
              image_url: { url: 'data:' + img.mimeType + ';base64,' + img.data }
            });
          });
          if (!text) userContent.push({ type: 'text', text: 'Analiza las imágenes y genera la cotización.' });
        }

        const deepseekPayload = {
          model: 'deepseek-chat',
          max_tokens: 2000,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userContent.length === 1 && userContent[0].type === 'text'
                ? userContent[0].text
                : userContent
            }
          ]
        };

        const postData = JSON.stringify(deepseekPayload);

        const options = {
          hostname: 'api.deepseek.com',
          path: '/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + API_KEY,
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const apiReq = https.request(options, apiRes => {
          let data = '';
          apiRes.on('data', chunk => data += chunk);
          apiRes.on('end', () => {
            console.log('DeepSeek status:', apiRes.statusCode);
            console.log('Response:', data.substring(0, 200));
            try {
              const parsed = JSON.parse(data);
              const txt = parsed.choices?.[0]?.message?.content
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
          res.end(JSON.stringify({ content: [{ type: 'text', text: 'Error: ' + err.message }] }));
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
  console.log('Cotizador MSR&L (DeepSeek) puerto ' + PORT);
});
