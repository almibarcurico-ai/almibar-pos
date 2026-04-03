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
  LINE: '-'.repeat(32)+'\n', DLINE: '='.repeat(32)+'\n',
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
  if (data.discount && data.discount > 0) {
    t += pad(data.discountLabel || 'Descuento:', '-' + fmt(data.discount)) + '\n';
    t += pad('Neto:', fmt((data.subtotal || 0) - data.discount)) + '\n';
  }
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
// Polling: buscar items nuevos cada 3 segundos
// Guarda lastCheckTime en archivo para sobrevivir restarts
// =============================================
const LAST_CHECK_FILE = path.join(__dirname, '.last_poll_time');
const LAST_MOD_CHECK_FILE = path.join(__dirname, '.last_mod_poll_time');

function loadLastCheckTime() {
  try {
    if (fs.existsSync(LAST_CHECK_FILE)) return fs.readFileSync(LAST_CHECK_FILE, 'utf8').trim();
  } catch {}
  return new Date().toISOString();
}

function saveLastCheckTime(t) {
  try { fs.writeFileSync(LAST_CHECK_FILE, t); } catch {}
}

function loadLastModCheckTime() {
  try {
    if (fs.existsSync(LAST_MOD_CHECK_FILE)) return fs.readFileSync(LAST_MOD_CHECK_FILE, 'utf8').trim();
  } catch {}
  return new Date().toISOString();
}

function saveLastModCheckTime(t) {
  try { fs.writeFileSync(LAST_MOD_CHECK_FILE, t); } catch {}
}

let lastCheckTime = loadLastCheckTime();
let lastModCheckTime = loadLastModCheckTime();

async function pollNewItems() {
  try {
    const { data: items, error } = await supabase
      .from('order_items')
      .select('id, order_id, status, created_at')
      .eq('status', 'preparando')
      .gt('created_at', lastCheckTime)
      .order('created_at', { ascending: true });

    if (error) { console.log('  ❌ Poll error: ' + error.message); return; }
    if (!items || items.length === 0) return;

    // Avanzar y guardar timestamp
    lastCheckTime = items[items.length - 1].created_at;
    saveLastCheckTime(lastCheckTime);

    console.log('  📡 Poll: ' + items.length + ' items nuevos');

    // Agrupar por order_id
    const orderIds = [...new Set(items.map(i => i.order_id))];
    for (const orderId of orderIds) {
      await printComandaForOrder(orderId, items.filter(i => i.order_id === orderId).map(i => i.id));
    }
  } catch (e) {
    // Silenciar errores de polling
  }
}

// =============================================
// Polling: buscar modificadores nuevos en items ya impresos
// Para reimprimir solo los mods agregados después del envío
// =============================================
async function pollNewModifiers() {
  try {
    // Buscar modifiers creados después del último check
    const { data: newMods, error } = await supabase
      .from('order_item_modifiers')
      .select('id, order_item_id, option_name, created_at')
      .gt('created_at', lastModCheckTime)
      .order('created_at', { ascending: true });

    if (error || !newMods || newMods.length === 0) return;

    // Avanzar timestamp
    lastModCheckTime = newMods[newMods.length - 1].created_at;
    saveLastModCheckTime(lastModCheckTime);

    // Obtener los order_items correspondientes (solo los ya impresos)
    const itemIds = [...new Set(newMods.map(m => m.order_item_id))];
    const { data: items } = await supabase
      .from('order_items')
      .select('id, order_id, product_id, printed, status, created_at, product:products(name, category_id)')
      .in('id', itemIds)
      .eq('printed', true);

    if (!items || items.length === 0) return;

    // Para cada item ya impreso, verificar si los mods son posteriores al envío
    for (const item of items) {
      // Solo reimprimir mods creados más de 5 segundos después del item
      // (los mods iniciales se crean junto con el item, no necesitan reimpresión)
      const itemTime = new Date(item.created_at).getTime();
      const nuevos = newMods.filter(m => m.order_item_id === item.id && (new Date(m.created_at).getTime() - itemTime) > 5000);
      if (nuevos.length === 0) continue;

      // Obtener la orden para mesa y garzón
      const { data: order } = await supabase
        .from('orders')
        .select('id, table_id, created_by, order_number')
        .eq('id', item.order_id)
        .single();

      if (!order) continue;

      const { data: tableData } = order.table_id
        ? await supabase.from('tables').select('number').eq('id', order.table_id).single()
        : { data: null };
      const { data: waiter } = await supabase.from('users').select('name').eq('id', order.created_by).single();

      const catId = item.product?.category_id;
      const stations = categoryPrinterMap[catId] || [];
      const tableNum = tableData?.number || '?';

      console.log('\n🖨️  Nuevos modificadores Mesa ' + tableNum + ' — ' + item.product?.name + ' +' + nuevos.length + ' mods');

      for (const station of stations) {
        const printer = PRINTER_IPS[station];
        if (!printer) continue;

        const ticket = generateComanda({
          table: tableNum,
          waiter: waiter?.name || '',
          station: station,
          items: [{
            name: item.product?.name || 'Item',
            qty: 1,
            modifiers: nuevos.map(m => m.option_name),
            notes: 'MODIFICADORES AGREGADOS',
          }],
          orderNumber: order.order_number,
        });

        queuePrint(station.charAt(0).toUpperCase() + station.slice(1), printer.ip, printer.port, ticket);
      }
    }
  } catch (e) {
    // Silenciar errores
  }
}

// Polling se inicia después de cargar mappings (ver abajo)

async function printComandaForOrder(orderId, itemIds) {
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('*, order_items(*, product:products(name, category_id), modifiers:order_item_modifiers(option_name))')
      .eq('id', orderId)
      .single();

    if (!order) return;

    const newItems = (order.order_items || []).filter(i => itemIds.includes(i.id));
    if (newItems.length === 0) return;

    // Obtener mesa y garzón
    const { data: tableData } = order.table_id ? await supabase.from('tables').select('number').eq('id', order.table_id).single() : { data: null };
    const { data: waiter } = await supabase.from('users').select('name').eq('id', order.created_by).single();

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

    const tableNum = tableData?.number || '?';
    console.log('\n🖨️  Comanda Mesa ' + tableNum + ' — ' + newItems.length + ' items (polling)');

    for (const [station, items] of Object.entries(byStation)) {
      const printer = PRINTER_IPS[station];
      if (!printer) { console.log('  ⚠️ No hay impresora para: ' + station); continue; }

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
}

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

        // Descuento: leer de la orden si existe, o calcular miércoles
        const esMiercoles = new Date().getDay() === 3;
        let discount = 0, discountLabel = '';
        if (order.discount_value && order.discount_value > 0) {
          discount = order.discount_value;
          discountLabel = order.discount_type === 'percent' ? 'Dcto ' + Math.round(order.discount_value / subtotal * 100) + '%:' : 'Descuento:';
        } else if (esMiercoles) {
          discount = Math.round(subtotal * 0.4);
          discountLabel = 'Dcto 40% Mie:';
        }
        const subtotalConDesc = subtotal - discount;
        const tip = Math.round(subtotal * 0.1);

        const ticket = generateBoleta({
          table: table.number, waiter: waiter?.name || '',
          items: unpaidItems.map(i => ({ name: i.product?.name || 'Item', qty: i.quantity, price: i.unit_price, total: i.total_price })),
          subtotal, discount, discountLabel, tip, total: subtotalConDesc + tip, payments: [], orderNumber: order.order_number,
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

        // Ignorar comandas de cocina/barra por /print — el polling se encarga
        // EXCEPTO si viene con force:true (ej: modificadores pendientes)
        if ((station === 'cocina' || station === 'barra') && data.length > 0 && !job.force) {
          console.log('  ⏭️  /print ' + name + ' ignorado (polling)');
        } else {
          console.log('\n🖨️  Enviando a ' + name + ' (' + ip + ':' + port + ') — ' + data.length + ' bytes' + (job.force ? ' [FORCE]' : ''));
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

// Cargar mapeos e iniciar polling
loadPrinterMappings();

// =============================================
// Polling: auto-procesar items de app cliente
// Items pendientes → enviar a cocina (el poll normal los imprime)
// =============================================
const APP_USER_ID = 'a0000000-0000-0000-0000-000000000099';

async function pollAppItems() {
  try {
    const { data: items } = await supabase
      .from('order_items')
      .select('id')
      .eq('status', 'pendiente')
      .eq('created_by', APP_USER_ID);

    if (!items || items.length === 0) return;

    const ids = items.map(i => i.id);
    console.log('\n📱 App: ' + ids.length + ' items pendientes → enviando a cocina');
    const { error } = await supabase.rpc('send_order_and_deduct_stock', { p_item_ids: ids });
    if (error) console.log('  ❌ RPC error: ' + error.message);
    else {
      // Forzar que el poll normal los encuentre ahora
      // Retroceder lastCheckTime 10 segundos para capturar items recién cambiados
      const tenSecsAgo = new Date(Date.now() - 10000).toISOString();
      if (lastCheckTime > tenSecsAgo) lastCheckTime = tenSecsAgo;
      saveLastCheckTime(lastCheckTime);
      console.log('  ✅ Enviados a cocina, poll los imprimirá');
    }
  } catch (e) {
    // silenciar
  }
}

// =============================================
// Polling: notificaciones app (llamar garzón, pedir cuenta)
// =============================================
async function pollAppNotifications() {
  try {
    const { data: notifs } = await supabase
      .from('app_orders')
      .select('id, table_number, customer_name, created_at')
      .eq('status', 'pendiente');

    if (!notifs || notifs.length === 0) return;

    for (const notif of notifs) {
      const isLlamada = notif.customer_name && notif.customer_name.includes('LLAMADA GARZON');
      const isCuenta = notif.customer_name && notif.customer_name.includes('PEDIR CUENTA');

      if (isLlamada || isCuenta) {
        const tipo = isLlamada ? 'LLAMADA GARZON' : 'PEDIR CUENTA';
        const time = new Date(notif.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

        const ticket = CMD.INIT + CMD.FONT_A + CMD.MARGIN_LEFT + CMD.PRINT_WIDTH
          + CMD.CENTER + CMD.BOLD_ON + CMD.DOUBLE_BOTH
          + tipo + '\n'
          + CMD.SIZE_UP + CMD.BOLD_OFF + CMD.LEFT
          + CMD.LINE
          + '  Mesa: ' + notif.table_number + '\n'
          + '  Hora: ' + time + '\n'
          + CMD.LINE
          + CMD.CENTER + CMD.BOLD_ON + CMD.SIZE_UP
          + (isLlamada ? 'Acercarse a la mesa\n' : 'Llevar cuenta a mesa\n')
          + CMD.BOLD_OFF + CMD.NORMAL
          + '\n\n\n\n\n\n'
          + CMD.CUT;

        const printer = PRINTER_IPS.barra;
        console.log('\n📱 ' + tipo + ': Mesa ' + notif.table_number);
        queuePrint('Barra (notif)', printer.ip, printer.port, ticket);
      }
    }

    // Marcar todas como confirmadas
    await supabase.from('app_orders').update({
      status: 'confirmado',
      confirmed_at: new Date().toISOString(),
    }).eq('status', 'pendiente');
  } catch (e) {
    // silenciar
  }
}

// Polling loop — busca items nuevos cada 3 segundos
(function startPolling() {
  console.log('  🔄 Polling order_items: iniciado');
  console.log('  🔄 Polling modifiers: iniciado');
  console.log('  🔄 Polling app items + notificaciones: iniciado');
  async function loop() {
    await pollAppItems();
    await pollNewItems();
    await pollNewModifiers();
    await pollAppNotifications();
    setTimeout(loop, 3000);
  }
  loop();
})();

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
