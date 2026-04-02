#!/usr/bin/env node
// AlmíbarPOS — Backup automático de Supabase a JSON + GitHub
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SUPA = 'https://czdnllosfvakyibdijmb.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6ZG5sbG9zZnZha3lpYmRpam1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODE2OTYsImV4cCI6MjA4OTg1NzY5Nn0.Xjkpx2exJXmJb3yIv81uiwvlnNMvhd2gMRdPY4S4UJA';
const HEADERS = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` };
const BACKUP_ROOT = path.join(process.env.HOME, 'AlmibarPOS-backups');
const REPO_DIR = path.join(BACKUP_ROOT, 'repo');
const REPO_URL = 'https://github.com/almibarcurico-ai/almibar-pos-backups.git';
const MAX_BACKUPS = 30;
const WA_PHONE_ID = '112291225051441';
const WA_TOKEN = process.env.WA_TOKEN || '';
const ALERT_NUMBER = '56962590498'; // Hector

const TABLES = [
  'products', 'categories', 'orders', 'order_items', 'payments',
  'clients', 'client_visits', 'tables', 'sectors', 'printers',
  'modifier_groups', 'modifier_options', 'product_modifier_groups',
  'order_item_modifiers', 'cash_registers', 'cash_movements',
  'delivery_orders', 'delivery_order_items', 'delivery_payments',
  'promo_banners', 'ingredients', 'recipes', 'recipe_items',
  'purchase_invoices', 'purchase_items', 'users', 'order_logs',
  'category_printer', 'inventory_counts', 'inventory_count_items',
  'suppliers', 'discounts', 'app_orders', 'app_order_items',
  'trigger_log'
];

async function sendWhatsApp(message) {
  if (!WA_TOKEN) { console.log('⚠ WA_TOKEN no configurado, alerta no enviada'); return; }
  try {
    await fetch(`https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: ALERT_NUMBER,
        type: 'text',
        text: { body: message }
      })
    });
  } catch (e) { console.error('Error WhatsApp:', e.message); }
}

async function fetchTable(table) {
  const rows = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const url = `${SUPA}/rest/v1/${table}?select=*&order=id&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
    const data = await res.json();
    rows.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return rows;
}

async function main() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA');
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }).replace(':', '');
  const folderName = `backup-${dateStr}-${timeStr}`;
  const backupDir = path.join(BACKUP_ROOT, folderName);

  console.log(`\n🔄 Backup AlmíbarPOS — ${dateStr} ${timeStr}`);
  console.log(`📁 ${backupDir}\n`);

  fs.mkdirSync(backupDir, { recursive: true });

  const errors = [];
  const summary = { tables: 0, rows: 0, errors: 0 };

  for (const table of TABLES) {
    try {
      const data = await fetchTable(table);
      fs.writeFileSync(path.join(backupDir, `${table}.json`), JSON.stringify(data, null, 2));
      console.log(`  ✅ ${table}: ${data.length} registros`);
      summary.tables++;
      summary.rows += data.length;
    } catch (e) {
      console.log(`  ❌ ${table}: ${e.message}`);
      errors.push(`${table}: ${e.message}`);
      summary.errors++;
    }
  }

  // Resumen
  const summaryFile = {
    date: now.toISOString(),
    tables: summary.tables,
    totalRows: summary.rows,
    errors: errors,
    duration: `${((Date.now() - now.getTime()) / 1000).toFixed(1)}s`
  };
  fs.writeFileSync(path.join(backupDir, '_summary.json'), JSON.stringify(summaryFile, null, 2));

  console.log(`\n📊 Resumen: ${summary.tables} tablas, ${summary.rows} registros, ${summary.errors} errores`);

  // Push a GitHub
  try {
    if (!fs.existsSync(REPO_DIR)) {
      console.log('\n📦 Clonando repo de backups...');
      execSync(`git clone ${REPO_URL} ${REPO_DIR}`, { stdio: 'pipe' });
    }
    // Copiar backup al repo
    const repoBackupDir = path.join(REPO_DIR, folderName);
    execSync(`cp -r ${backupDir} ${repoBackupDir}`);
    execSync(`cd ${REPO_DIR} && git add -A && git commit -m "backup ${dateStr} ${timeStr}" && git push`, { stdio: 'pipe' });
    console.log('✅ Subido a GitHub');
  } catch (e) {
    console.log('⚠ Error subiendo a GitHub:', e.message);
    errors.push('GitHub push: ' + e.message);
  }

  // Limpiar backups antiguos (mantener últimos 30)
  try {
    const dirs = fs.readdirSync(BACKUP_ROOT)
      .filter(d => d.startsWith('backup-') && fs.statSync(path.join(BACKUP_ROOT, d)).isDirectory())
      .sort();
    if (dirs.length > MAX_BACKUPS) {
      const toDelete = dirs.slice(0, dirs.length - MAX_BACKUPS);
      for (const d of toDelete) {
        fs.rmSync(path.join(BACKUP_ROOT, d), { recursive: true });
        console.log(`🗑 Eliminado backup antiguo: ${d}`);
      }
    }
  } catch (e) { console.log('⚠ Error limpiando:', e.message); }

  // Alerta si hubo errores
  if (errors.length > 0) {
    await sendWhatsApp(`⚠️ BACKUP ALMÍBAR FALLÓ\n${dateStr} ${timeStr}\n\nErrores:\n${errors.join('\n')}`);
  }

  console.log('\n✅ Backup completado\n');
}

main().catch(async (e) => {
  console.error('💥 Error fatal:', e.message);
  await sendWhatsApp(`💥 BACKUP ALMÍBAR ERROR FATAL\n${e.message}`);
  process.exit(1);
});
