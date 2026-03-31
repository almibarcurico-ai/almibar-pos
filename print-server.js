const http = require('http');
const https = require('https');
const fs = require('fs');
const net = require('net');
const path = require('path');

// Configuración de impresoras
const PRINTER_IPS = {
  cocina: { ip: '192.168.1.115', port: 9100 },
  barra:  { ip: '192.168.1.114', port: 9100 },
  caja:   { ip: '192.168.1.114', port: 9100 },
};

// ESC/POS commands
const ESC = '\x1B', GS = '\x1D';
const CMD = {
  INIT: ESC+'@', BOLD_ON: ESC+'E\x01', BOLD_OFF: ESC+'E\x00',
  CENTER: ESC+'a\x01', LEFT: ESC+'a\x00', RIGHT: ESC+'a\x02',
  DOUBLE_BOTH: GS+'!\x11', SIZE_UP: GS+'!\x01', NORMAL: GS+'!\x00',
  CUT: GS+'V\x00',
  LINE: '\u2500'.repeat(32)+'\n', DLINE: '\u2550'.repeat(32)+'\n',
  LINE_SPACING_TIGHT: ESC+'3\x10',
  LINE_SPACING_DEFAULT: ESC+'2',
  CHAR_SPACING_WIDE: ESC+' \x03',
  CHAR_SPACING_DEFAULT: ESC+' \x00',
};

function pad(l, r, w=32) { return l + ' '.repeat(Math.max(w-l.length-r.length, 1)) + r; }
function fmt(n) { return '$' + Math.round(n).toLocaleString('es-CL'); }

function generateBoleta(data) {
  const now = new Date();
  const time = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('es-CL');

  let t = CMD.INIT + CMD.LINE_SPACING_TIGHT;
  t += CMD.CENTER + CMD.BOLD_ON + CMD.DOUBLE_BOTH + 'ALMIBAR\n';
  t += CMD.SIZE_UP + CMD.BOLD_OFF + 'Cocina y Bar\nFrancisco Moreno 418, Curico\n';
  t += CMD.LEFT + CMD.DLINE;
  t += pad('Mesa:', String(data.table)) + '\n';
  t += pad('Garzon:', data.waiter) + '\n';
  t += pad('Hora:', date + ' ' + time) + '\n';
  if (data.orderNumber) t += pad('Orden:', '#' + data.orderNumber) + '\n';
  t += CMD.LINE + CMD.NORMAL;
  for (const item of data.items) {
    t += item.qty + 'x ' + item.name + '\n';
    t += CMD.RIGHT + fmt(item.total) + '\n' + CMD.LEFT;
  }
  t += CMD.LINE + CMD.BOLD_ON + CMD.SIZE_UP + CMD.CHAR_SPACING_WIDE;
  t += pad('Subtotal:', fmt(data.subtotal)) + '\n';
  if (data.tip > 0) t += pad('Propina:', fmt(data.tip)) + '\n';
  t += CMD.DOUBLE_BOTH + pad('TOTAL:', fmt(data.total)) + '\n';
  t += CMD.CHAR_SPACING_DEFAULT + CMD.SIZE_UP + CMD.BOLD_OFF + CMD.LINE;
  t += CMD.SIZE_UP;
  for (const p of (data.payments || [])) {
    const label = p.method === 'efectivo' ? 'Efectivo' : p.method === 'debito' ? 'Debito' : p.method === 'credito' ? 'Credito' : 'Transf.';
    t += pad(label + ':', fmt(p.amount)) + '\n';
  }
  t += '\n' + CMD.CENTER + CMD.SIZE_UP + 'Nos encanto tenerte, vuelve pronto!\n';
  t += CMD.NORMAL + '@almibar.bar\n' + CMD.LINE_SPACING_DEFAULT + '\n\n\n\n\n\n' + CMD.CUT;
  return t;
}

function sendTCP(name, ip, port, data) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    client.setTimeout(5000);
    client.connect(port, ip, () => {
      client.write(Buffer.from(data, 'binary'), () => {
        client.end();
        console.log(`✅ ${name}: impreso OK`);
        resolve(true);
      });
    });
    client.on('timeout', () => { console.log(`⏱️ ${name}: timeout`); client.destroy(); resolve(false); });
    client.on('error', (err) => { console.log(`❌ ${name} (${ip}:${port}): ${err.message}`); resolve(false); });
  });
}

// Handler compartido HTTP + HTTPS
function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      if (req.method === 'POST' && req.url === '/print') {
        const job = JSON.parse(body);
        const name = job.printer || '';
        const override = PRINTER_IPS[name.toLowerCase()];
        const ip = override?.ip || job.ip || '127.0.0.1';
        const port = override?.port || job.port || 9100;
        const data = job.data || job.text || '';

        console.log(`🖨️  Enviando a ${name} (${ip}:${port}) — ${data.length} bytes`);
        sendTCP(name, ip, port, data);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, printer: name }));

      } else if (req.method === 'POST' && req.url === '/precuenta') {
        const data = JSON.parse(body);
        console.log(`🧾 Pre-cuenta Mesa ${data.table} — ${data.items?.length || 0} items`);

        const ticket = generateBoleta(data);
        const printer = PRINTER_IPS.caja;
        sendTCP('Caja', printer.ip, printer.port, ticket);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, printer: 'Caja' }));

      } else if (req.method === 'GET' && req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (e) {
      console.log(`❌ Error: ${e.message}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

// HTTP server
http.createServer(handler).listen(3333, () => {
  console.log('  ✅ HTTP  → http://localhost:3333');
});

// HTTPS server
const certPath = path.join(__dirname, 'server.cert');
const keyPath = path.join(__dirname, 'server.key');
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const opts = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  https.createServer(opts, handler).listen(3334, () => {
    console.log('  ✅ HTTPS → https://localhost:3334');
  });
}

console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║  🖨️  Almibar Print Server               ║');
console.log('║                                          ║');
console.log('║  Cocina  → 192.168.1.115:9100            ║');
console.log('║  Barra   → 192.168.1.114:9100            ║');
console.log('║  Caja    → 192.168.1.114:9100            ║');
console.log('║                                          ║');
console.log('║  POST /print     → comanda ESC/POS       ║');
console.log('║  POST /precuenta → boleta en Caja        ║');
console.log('║  GET  /status                            ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');
