const http = require('http');
const https = require('https');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Supabase
const supabase = createClient(
  'https://czdnllosfvakyibdijmb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6ZG5sbG9zZnZha3lpYmRpam1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODE2OTYsImV4cCI6MjA4OTg1NzY5Nn0.Xjkpx2exJXmJb3yIv81uiwvlnNMvhd2gMRdPY4S4UJA'
);

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
  FONT_A: ESC+'M\x00',
  CUT: GS+'V\x00',
  LINE: '\u2500'.repeat(32)+'\n', DLINE: '\u2550'.repeat(32)+'\n',
  LINE_SPACING_TIGHT: ESC+'3\x10',
  LINE_SPACING_WIDE: ESC+'3\x3C',
  LINE_SPACING_DEFAULT: ESC+'2',
  CHAR_SPACING_WIDE: ESC+' \x03',
  CHAR_SPACING_DEFAULT: ESC+' \x00',
  // Márgenes
  MARGIN_LEFT: GS+'L\x10\x00',
  PRINT_WIDTH: GS+'W\x20\x02',
};

function pad(l, r, w=32) { return l + ' '.repeat(Math.max(w-l.length-r.length, 1)) + r; }
function fmt(n) { return '$' + Math.round(n).toLocaleString('es-CL'); }

// =============================================
// Generador de COMANDA (cocina/barra)
// =============================================
function generateComanda(data) {
  const now = new Date();
  const time = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('es-CL');

  let t = CMD.INIT + CMD.FONT_A;
  // Título centrado grande
  t += CMD.CENTER + CMD.BOLD_ON + CMD.DOUBLE_BOTH;
  t += 'COMANDA\n';
  t += (data.station || '').toUpperCase() + '\n';
  // Info mesa - doble alto, sin negritas, espaciado entre letras
  t += CMD.SIZE_UP + CMD.BOLD_OFF + CMD.CHAR_SPACING_WIDE + CMD.LEFT;
  t += CMD.LINE;
  t += '  ' + pad('Mesa:', String(data.table || ''), 28) + '\n';
  t += '  ' + pad('Garzon:', data.waiter || '', 28) + '\n';
  t += '  ' + pad('Fecha:', date + ' ' + time, 28) + '\n';
  if (data.orderNumber) t += '  ' + pad('Orden:', '#' + data.orderNumber, 28) + '\n';
  t += CMD.CHAR_SPACING_DEFAULT;
  t += CMD.LINE;
  // Items - doble ancho+alto (30% más grande) + bold + espaciado
  t += CMD.BOLD_ON + CMD.DOUBLE_BOTH + CMD.CHAR_SPACING_WIDE + CMD.LINE_SPACING_WIDE;
  for (const item of (data.items || [])) {
    t += item.qty + 'x ' + item.name + '\n';
    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        t += '  > ' + mod + '\n';
      }
    }
    if (item.notes) {
      t += '  * ' + item.notes + '\n';
    }
  }
  t += CMD.CHAR_SPACING_DEFAULT + CMD.LINE_SPACING_DEFAULT;
  t += CMD.BOLD_OFF + CMD.SIZE_UP;
  t += CMD.LINE;
  // Mensaje final grande
  t += CMD.CENTER + CMD.BOLD_ON + CMD.DOUBLE_BOTH;
  t += 'OJO: Leer comentarios!\n';
  t += CMD.BOLD_OFF + CMD.NORMAL;
  t += '\n\n\n\n\n\n\n\n';
  t += CMD.CUT;
  return t;
}

// =============================================
// Generador de BOLETA (pre-cuenta)
// =============================================
function generateBoleta(data) {
  const now = new Date();
  const time = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('es-CL');

  let t = CMD.INIT + CMD.LINE_SPACING_TIGHT;
  t += CMD.CENTER + CMD.BOLD_ON + CMD.DOUBLE_BOTH + 'ALMIBAR\n';
  t += CMD.SIZE_UP + CMD.BOLD_OFF + 'Cocina y Bar\nFrancisco Moreno 418, Curico\n';
  t += CMD.LEFT + CMD.DLINE;
  t += pad('Mesa:', String(data.table)) + '\n';
  t += pad('Garzon:', data.waiter || '') + '\n';
  t += pad('Hora:', date + ' ' + time) + '\n';
  if (data.orderNumber) t += pad('Orden:', '#' + data.orderNumber) + '\n';
  t += CMD.LINE + CMD.NORMAL;
  for (const item of (data.items || [])) {
    t += item.qty + 'x ' + item.name + '\n';
    t += CMD.RIGHT + fmt(item.total) + '\n' + CMD.LEFT;
  }
  t += CMD.LINE + CMD.BOLD_ON + CMD.SIZE_UP + CMD.CHAR_SPACING_WIDE;
  t += pad('Subtotal:', fmt(data.subtotal || 0)) + '\n';
  if (data.tip > 0) t += pad('Propina:', fmt(data.tip)) + '\n';
  t += CMD.DOUBLE_BOTH + pad('TOTAL:', fmt(data.total || 0)) + '\n';
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

// =============================================
// Cola de impresión con reintentos
// =============================================
const printQueue = [];
let processing = false;
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000;
let printStats = { ok: 0, fail: 0, retries: 0, lastError: null, lastPrint: null };

function sendTCP(name, ip, port, data, retries = 0) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    client.setTimeout(5000);
    client.connect(port, ip, () => {
      client.write(Buffer.from(data, 'binary'), () => {
        client.end();
        console.log('  ✅ ' + name + ': impreso OK');
        printStats.ok++;
        printStats.lastPrint = new Date().toISOString();
        resolve(true);
      });
    });
    client.on('timeout', () => {
      console.log('  ⏱️ ' + name + ': timeout');
      client.destroy();
      if (retries < MAX_RETRIES) {
        console.log('  🔄 Reintentando ' + name + ' (' + (retries+1) + '/' + MAX_RETRIES + ')...');
        printStats.retries++;
        setTimeout(() => sendTCP(name, ip, port, data, retries+1).then(resolve), RETRY_DELAY);
      } else {
        console.log('  ❌ ' + name + ': falló después de ' + MAX_RETRIES + ' intentos');
        printStats.fail++;
        printStats.lastError = { printer: name, time: new Date().toISOString(), error: 'timeout' };
        resolve(false);
      }
    });
    client.on('error', (err) => {
      console.log('  ❌ ' + name + ' (' + ip + ':' + port + '): ' + err.message);
      if (retries < MAX_RETRIES) {
        console.log('  🔄 Reintentando ' + name + ' (' + (retries+1) + '/' + MAX_RETRIES + ')...');
        printStats.retries++;
        setTimeout(() => sendTCP(name, ip, port, data, retries+1).then(resolve), RETRY_DELAY);
      } else {
        printStats.fail++;
        printStats.lastError = { printer: name, time: new Date().toISOString(), error: err.message };
        resolve(false);
      }
    });
  });
}

function queuePrint(name, ip, port, data) {
  printQueue.push({ name, ip, port, data, added: Date.now() });
  processQueue();
}

async function processQueue() {
  if (processing || printQueue.length === 0) return;
  processing = true;
  while (printQueue.length > 0) {
    const job = printQueue.shift();
    await sendTCP(job.name, job.ip, job.port, job.data);
  }
  processing = false;
}

// =============================================
// Cache de categorías y mapeos para comandas
// =============================================
let categoryPrinterMap = {};  // category_id -> [printer_station]
let categoriesMap = {};       // category_id -> name

async function loadPrinterMappings() {
  const { data: cp } = await supabase.from('category_printer').select('category_id, printer_id');
  const { data: printers } = await supabase.from('printers').select('id, name, station').eq('active', true);
  const { data: cats } = await supabase.from('categories').select('id, name');

  categoryPrinterMap = {};
  for (const mapping of (cp || [])) {
    const printer = (printers || []).find(p => p.id === mapping.printer_id);
    if (!printer) continue;
    const station = printer.station || printer.name.toLowerCase();
    if (!categoryPrinterMap[mapping.category_id]) categoryPrinterMap[mapping.category_id] = [];
    if (!categoryPrinterMap[mapping.category_id].includes(station)) {
      categoryPrinterMap[mapping.category_id].push(station);
    }
  }
  categoriesMap = {};
  for (const c of (cats || [])) categoriesMap[c.id] = c.name;

  console.log('  📋 Mapeos cargados: ' + Object.keys(categoryPrinterMap).length + ' categorías');
}

// =============================================
// Realtime: escuchar cambios en order_items
// Cuando items cambian a "preparando", imprimir comanda
// =============================================
const recentlyPrinted = new Set(); // evitar duplicados

supabase.channel('items-changes')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'order_items' }, async (payload) => {
    const item = payload.new;
    const oldItem = payload.old;

    // Solo cuando cambia a "preparando" (recién enviado)
    if (item.status === 'preparando' && oldItem.status === 'pendiente') {
      if (recentlyPrinted.has(item.id)) return;
      recentlyPrinted.add(item.id);
      setTimeout(() => recentlyPrinted.delete(item.id), 10000);

      // Esperar un poco para agrupar items que se envían juntos
      setTimeout(async () => {
        try {
          // Buscar la orden y todos los items recién enviados
          const { data: order } = await supabase
            .from('orders')
            .select('*, table:tables(number), order_items(*, product:products(name, category_id), modifiers:order_item_modifiers(option_name))')
            .eq('id', item.order_id)
            .single();

          if (!order) return;

          const { data: waiter } = await supabase.from('users').select('name').eq('id', order.created_by).single();

          // Filtrar items recién enviados (los que están en recentlyPrinted)
          const newItems = (order.order_items || []).filter(i => recentlyPrinted.has(i.id));
          if (newItems.length === 0) return;

          // Agrupar por estación de impresora
          const byStation = {};
          for (const oi of newItems) {
            const catId = oi.product?.category_id;
            const stations = categoryPrinterMap[catId] || [];
            for (const station of stations) {
              if (!byStation[station]) byStation[station] = [];
              byStation[station].push(oi);
            }
          }

          const tableNum = order.table?.number || '?';
          console.log('\n🖨️  Comanda Mesa ' + tableNum + ' — ' + newItems.length + ' items');

          for (const [station, items] of Object.entries(byStation)) {
            const printer = PRINTER_IPS[station];
            if (!printer) { console.log('  ⚠️ No hay impresora para estación: ' + station); continue; }

            const ticket = generateComanda({
              table: tableNum,
              waiter: waiter?.name || '',
              station: station,
              items: items.map(i => ({
                name: i.product?.name || 'Item',
                qty: i.quantity,
                notes: i.notes || undefined,
                modifiers: (i.modifiers || []).map(m => m.option_name),
              })),
              orderNumber: order.order_number,
            });

            queuePrint(station.charAt(0).toUpperCase() + station.slice(1), printer.ip, printer.port, ticket);
          }
        } catch (e) {
          console.log('  ❌ Error comanda: ' + e.message);
        }
      }, 1500); // esperar 1.5s para agrupar
    }
  })
  .subscribe((status) => {
    console.log('  🔔 Realtime order_items: ' + status);
  });

// =============================================
// Realtime: escuchar cambios en tablas
// Cuando una mesa cambia a "cuenta", imprimir boleta
// =============================================
const printedCuentas = new Set();

supabase.channel('tables-changes')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables' }, async (payload) => {
    const table = payload.new;
    const oldTable = payload.old;

    if (table.status === 'cuenta' && oldTable.status !== 'cuenta') {
      if (printedCuentas.has(table.id)) return;
      printedCuentas.add(table.id);
      setTimeout(() => printedCuentas.delete(table.id), 30000);

      console.log('\n🧾 Mesa ' + table.number + ' -> CUENTA! Imprimiendo boleta...');

      try {
        const { data: order } = await supabase
          .from('orders')
          .select('*, order_items(*, product:products(name))')
          .eq('id', table.current_order_id)
          .single();

        if (!order) { console.log('  No se encontró orden'); return; }

        const { data: waiter } = await supabase.from('users').select('name').eq('id', order.created_by).single();
        const unpaidItems = (order.order_items || []).filter(i => !i.paid);
        const subtotal = unpaidItems.reduce((a, i) => a + (i.total_price || 0), 0);
        const tip = Math.round(subtotal * 0.1);

        const ticket = generateBoleta({
          table: table.number, waiter: waiter?.name || '',
          items: unpaidItems.map(i => ({ name: i.product?.name || 'Item', qty: i.quantity, price: i.unit_price, total: i.total_price })),
          subtotal, tip, total: subtotal + tip, payments: [], orderNumber: order.order_number,
        });

        const printer = PRINTER_IPS.caja;
        queuePrint('Caja (pre-cuenta)', printer.ip, printer.port, ticket);
      } catch (e) {
        console.log('  ❌ Error boleta: ' + e.message);
      }
    }
  })
  .subscribe((status) => {
    console.log('  🔔 Realtime tables: ' + status);
  });

// =============================================
// HTTP Handler (fallback para /print directo)
// =============================================
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
        const station = name.toLowerCase();

        // Interceptar comandas: regenerar con formato nuevo
        if ((station === 'cocina' || station === 'barra') && data.length > 0) {
          console.log('\n🖨️  Comanda ' + name + ' — regenerando con formato nuevo...');
          // Extraer info del ESC/POS viejo: buscar Mesa, Garzon, items
          const lines = data.replace(/[\x1B\x1D]./g, '').replace(/[^\x20-\x7E\n\u2500\u2550áéíóúñÁÉÍÓÚÑ]/g, '').split('\n').map(l => l.trim()).filter(l => l);
          let mesa = '', garzon = '', orden = '', items = [];
          for (const line of lines) {
            if (line.startsWith('Mesa:')) mesa = line.replace('Mesa:', '').trim();
            else if (line.startsWith('Garzon:')) garzon = line.replace('Garzon:', '').trim();
            else if (line.startsWith('Orden:')) orden = line.replace('Orden:', '').trim().replace('#', '');
            else if (/^\d+x\s/.test(line)) {
              const m = line.match(/^(\d+)x\s+(.+)$/);
              if (m) items.push({ qty: parseInt(m[1]), name: m[2], modifiers: [], notes: '' });
            }
            else if (line.startsWith('*') && items.length > 0) items[items.length-1].notes = line.replace(/^\*\s*/, '');
            else if (line.startsWith('>') && items.length > 0) items[items.length-1].modifiers.push(line.replace(/^>\s*/, ''));
            else if (line.startsWith('→') && items.length > 0) items[items.length-1].modifiers.push(line.replace(/^→\s*/, ''));
          }
          if (items.length > 0) {
            const ticket = generateComanda({ table: mesa, waiter: garzon, station, items, orderNumber: orden || undefined });
            queuePrint(name, ip, port, ticket);
          } else {
            // Fallback: enviar datos originales
            console.log('  (sin items detectados, enviando original)');
            queuePrint(name, ip, port, data);
          }
        } else {
          console.log('\n🖨️  Enviando a ' + name + ' (' + ip + ':' + port + ') — ' + data.length + ' bytes');
          queuePrint(name, ip, port, data);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, printer: name }));

      } else if (req.method === 'POST' && req.url === '/precuenta') {
        const data = JSON.parse(body);
        console.log('\n🧾 Pre-cuenta Mesa ' + data.table + ' (via HTTP)');
        const ticket = generateBoleta(data);
        const printer = PRINTER_IPS.caja;
        queuePrint('Caja', printer.ip, printer.port, ticket);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, printer: 'Caja' }));

      } else if (req.method === 'GET' && req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok', uptime: process.uptime(),
          queue: printQueue.length,
          stats: printStats,
          printers: PRINTER_IPS,
        }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (e) {
      console.log('  ❌ Error: ' + e.message);
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

// Cargar mapeos al iniciar
loadPrinterMappings();

console.log('');
console.log('╔═══════════════════════════════════════════════╗');
console.log('║  🖨️  Almibar Print Server v2                 ║');
console.log('║                                               ║');
console.log('║  Cocina  → 192.168.1.115:9100                 ║');
console.log('║  Barra   → 192.168.1.114:9100                 ║');
console.log('║  Caja    → 192.168.1.114:9100                 ║');
console.log('║                                               ║');
console.log('║  Realtime: comandas auto al enviar items       ║');
console.log('║  Realtime: boleta auto al pedir cuenta         ║');
console.log('║  POST /precuenta → boleta manual               ║');
console.log('║  GET  /status                                  ║');
console.log('╚═══════════════════════════════════════════════╝');
console.log('');
