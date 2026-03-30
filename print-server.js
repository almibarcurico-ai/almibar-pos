const http = require('http');
const net = require('net');

// Simulated printers - listen on different ports
const PRINTERS = [
  { name: 'Cocina', port: 9101 },
  { name: 'Barra', port: 9102 },
  { name: 'Caja', port: 9103 },
];

// TCP printer simulators
PRINTERS.forEach(p => {
  const server = net.createServer(socket => {
    let data = '';
    socket.on('data', chunk => { data += chunk.toString(); });
    socket.on('end', () => {
      console.log(`\n${'═'.repeat(40)}`);
      console.log(`🖨️  ${p.name} (port ${p.port})`);
      console.log(`${'═'.repeat(40)}`);
      console.log(data);
      console.log(`${'─'.repeat(40)}\n`);
    });
  });
  server.listen(p.port, () => console.log(`✅ ${p.name} simulada en puerto ${p.port}`));
});

// HTTP API for the POS to send print jobs
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
        
        // Connect to simulated printer
        const client = new net.Socket();
        client.connect(port, ip, () => {
          client.write(job.data || job.text || '');
          client.end();
        });
        client.on('error', (err) => {
          console.log(`❌ Error imprimiendo en ${ip}:${port}:`, err.message);
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, printer: job.printer }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

api.listen(3333, () => {
  console.log('\n🖨️  Print Server iniciado en http://localhost:3333');
  console.log('   POST /print { printer, ip, port, data }');
  console.log('   Impresoras simuladas: Cocina(:9101) Barra(:9102) Caja(:9103)\n');
});
