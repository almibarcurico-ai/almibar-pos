const http = require('http');
const net = require('net');

// HTTP API — recibe jobs del POS y los envia a impresoras por TCP
const api = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const job = JSON.parse(body);
        const ip = job.ip || '127.0.0.1';
        const port = job.port || 9100;
        const data = job.data || job.text || '';
        const name = job.printer || ip;

        console.log(`🖨️  Enviando a ${name} (${ip}:${port}) — ${data.length} bytes`);

        const client = new net.Socket();
        client.setTimeout(5000);

        client.connect(port, ip, () => {
          // Enviar datos ESC/POS como buffer binario
          const buf = Buffer.from(data, 'binary');
          client.write(buf, () => {
            client.end();
            console.log(`✅ ${name}: impreso OK`);
          });
        });

        client.on('timeout', () => {
          console.log(`⏱️  ${name}: timeout`);
          client.destroy();
        });

        client.on('error', (err) => {
          console.log(`❌ ${name} (${ip}:${port}): ${err.message}`);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, printer: name }));
      } catch (e) {
        console.log(`❌ Error: ${e.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

api.listen(3333, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  🖨️  Almibar Print Server               ║');
  console.log('║  http://localhost:3333                   ║');
  console.log('║                                          ║');
  console.log('║  Cocina  → 192.168.1.115:9100            ║');
  console.log('║  Barra   → 192.168.1.9:9100              ║');
  console.log('║  Caja    → 192.168.1.9:9100              ║');
  console.log('║                                          ║');
  console.log('║  POST /print { printer, ip, port, data } ║');
  console.log('║  GET  /status                            ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});
