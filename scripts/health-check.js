#!/usr/bin/env node
// AlmíbarPOS — Health Check completo del sistema
const fs = require('fs');
const path = require('path');
const net = require('net');

const SUPA = 'https://czdnllosfvakyibdijmb.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6ZG5sbG9zZnZha3lpYmRpam1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODE2OTYsImV4cCI6MjA4OTg1NzY5Nn0.Xjkpx2exJXmJb3yIv81uiwvlnNMvhd2gMRdPY4S4UJA';
const HEADERS = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` };
const LOG_DIR = path.join(process.env.HOME, 'AlmibarPOS-backups', 'health-logs');
const WA_PHONE_ID = '112291225051441';
const WA_TOKEN = process.env.WA_TOKEN || '';
const ALERT_NUMBER = '56962590498';

const results = [];
let failures = 0;

function log(ok, area, detail) {
  const status = ok ? '✅' : '❌';
  console.log(`  ${status} ${area}: ${detail}`);
  results.push({ ok, area, detail, time: new Date().toISOString() });
  if (!ok) failures++;
}

async function sendWhatsApp(message) {
  if (!WA_TOKEN) return;
  try {
    await fetch(`https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: ALERT_NUMBER, type: 'text', text: { body: message } })
    });
  } catch (e) { console.error('Error WA:', e.message); }
}

async function countTable(table) {
  const res = await fetch(`${SUPA}/rest/v1/${table}?select=id&limit=1`, {
    headers: { ...HEADERS, 'Prefer': 'count=exact' }
  });
  const count = parseInt(res.headers.get('content-range')?.split('/')[1] || '0');
  return count;
}

function checkTCP(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeout);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => { sock.destroy(); resolve(false); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

async function checkHTTP(url, timeout = 10000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: e.message };
  }
}

async function main() {
  const now = new Date();
  console.log(`\n🔍 HEALTH CHECK ALMÍBAR — ${now.toLocaleString('es-CL')}\n`);

  // ═══ A) SUPABASE TABLES ═══
  console.log('── Supabase ──');
  const tableChecks = [
    ['products', 100], ['categories', 10], ['clients', 500],
    ['tables', 50], ['users', 5], ['orders', 0],
    ['order_items', 0], ['payments', 0], ['ingredients', 50],
    ['printers', 1], ['sectors', 1], ['modifier_groups', 1],
  ];
  for (const [table, minCount] of tableChecks) {
    try {
      const count = await countTable(table);
      const ok = count >= minCount;
      log(ok, `DB: ${table}`, `${count} registros${!ok ? ` (mín: ${minCount})` : ''}`);
    } catch (e) {
      log(false, `DB: ${table}`, e.message);
    }
  }

  // ═══ B) PRINT SERVER ═══
  console.log('\n── Print Server ──');
  const printCheck = await checkHTTP('http://localhost:3333/status', 3000);
  log(printCheck.ok, 'Print Server', `localhost:3333 → ${printCheck.status}`);

  // ═══ C) IMPRESORAS ═══
  console.log('\n── Impresoras ──');
  const cocina = await checkTCP('192.168.1.115', 9100);
  log(cocina, 'Impresora Cocina', `192.168.1.115:9100 → ${cocina ? 'OK' : 'SIN CONEXIÓN'}`);
  const barra = await checkTCP('192.168.1.114', 9100);
  log(barra, 'Impresora Barra', `192.168.1.114:9100 → ${barra ? 'OK' : 'SIN CONEXIÓN'}`);

  // ═══ D) SITIOS WEB ═══
  console.log('\n── Sitios Web ──');
  const sites = [
    ['PWA Cliente', 'https://almibarcurico-ai.github.io/'],
    ['POS Vercel', 'https://almibar-pos.vercel.app/'],
    ['Reloj Control', 'https://almibar-reloj-control.vercel.app/'],
  ];
  for (const [name, url] of sites) {
    const check = await checkHTTP(url);
    log(check.ok, name, `${check.status}`);
  }

  // ═══ E) DATOS HUÉRFANOS ═══
  console.log('\n── Integridad de Datos ──');

  // Items sin orden válida
  try {
    const res = await fetch(`${SUPA}/rest/v1/rpc/`, { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: '{}' });
    // Use direct query instead
    const itemsRes = await fetch(`${SUPA}/rest/v1/order_items?select=id,order_id&order_id=is.null&limit=1`, { headers: HEADERS });
    const orphanItems = await itemsRes.json();
    log(orphanItems.length === 0, 'Items huérfanos', orphanItems.length === 0 ? 'Ninguno' : `${orphanItems.length} items sin orden`);
  } catch (e) { log(false, 'Items huérfanos', e.message); }

  // Payments sin orden
  try {
    const res = await fetch(`${SUPA}/rest/v1/payments?select=id,order_id&order_id=is.null&limit=1`, { headers: HEADERS });
    const orphanPays = await res.json();
    log(orphanPays.length === 0, 'Pagos huérfanos', orphanPays.length === 0 ? 'Ninguno' : `${orphanPays.length} pagos sin orden`);
  } catch (e) { log(false, 'Pagos huérfanos', e.message); }

  // Mesas stuck (ocupada > 12 horas)
  try {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${SUPA}/rest/v1/orders?select=id,table_id,opened_at&status=eq.abierta&opened_at=lt.${cutoff}&limit=10`, { headers: HEADERS });
    const stuck = await res.json();
    log(stuck.length === 0, 'Mesas stuck (>12h)', stuck.length === 0 ? 'Ninguna' : `${stuck.length} órdenes abiertas >12h`);
  } catch (e) { log(false, 'Mesas stuck', e.message); }

  // Productos sin categoría válida
  try {
    const res = await fetch(`${SUPA}/rest/v1/products?select=id,name,category_id&category_id=is.null&active=eq.true&limit=5`, { headers: HEADERS });
    const noCat = await res.json();
    log(noCat.length === 0, 'Productos sin categoría', noCat.length === 0 ? 'Ninguno' : `${noCat.length}: ${noCat.map(p => p.name).join(', ')}`);
  } catch (e) { log(false, 'Productos sin categoría', e.message); }

  // ═══ RESUMEN ═══
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 RESULTADO: ${results.length - failures}/${results.length} OK · ${failures} fallos`);
  console.log(`${'═'.repeat(50)}\n`);

  // Guardar log
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `health-${now.toLocaleDateString('en-CA')}-${now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }).replace(':', '')}.json`);
  fs.writeFileSync(logFile, JSON.stringify({ date: now.toISOString(), results, failures, total: results.length }, null, 2));
  console.log(`📝 Log: ${logFile}`);

  // Alerta si hay fallos
  if (failures > 0) {
    const failList = results.filter(r => !r.ok).map(r => `❌ ${r.area}: ${r.detail}`).join('\n');
    await sendWhatsApp(`⚠️ HEALTH CHECK ALMÍBAR\n${failures} fallos detectados:\n\n${failList}`);
    console.log('📱 Alerta WhatsApp enviada');
  }
}

main().catch(async (e) => {
  console.error('💥 Error fatal:', e.message);
  await sendWhatsApp(`💥 HEALTH CHECK ERROR: ${e.message}`);
  process.exit(1);
});
