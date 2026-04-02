#!/usr/bin/env node
// Importar ventas de Fudo XLS a tabla fudo_sales en Supabase
const XLSX = require('xlsx');
const path = require('path');

const SUPA = 'https://czdnllosfvakyibdijmb.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6ZG5sbG9zZnZha3lpYmRpam1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODE2OTYsImV4cCI6MjA4OTg1NzY5Nn0.Xjkpx2exJXmJb3yIv81uiwvlnNMvhd2gMRdPY4S4UJA';
const HEADERS = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

const file = process.argv[2] || '/tmp/fudo_ventas/ventas.xls';
console.log(`\n📂 Importando: ${file}\n`);

const wb = XLSX.readFile(file);
const ws = wb.Sheets[wb.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });

// Headers in row 3 (index 3)
const headers = raw[3];
const rows = raw.slice(4).filter(r => r && r.length > 5 && r[0]);

console.log(`📊 ${rows.length} ventas encontradas\n`);

// Parse rows
const sales = rows.map(r => {
  const serial = r[1]; // Fecha (Excel serial)
  let fecha = null;
  if (typeof serial === 'number') {
    const d = new Date((serial - 25569) * 86400 * 1000);
    fecha = d.toISOString().split('T')[0];
  }
  const serialCreacion = r[2];
  let creacion = null;
  if (typeof serialCreacion === 'number') {
    creacion = new Date((serialCreacion - 25569) * 86400 * 1000).toISOString();
  }
  const serialCerrada = r[3];
  let cerrada = null;
  if (typeof serialCerrada === 'number') {
    cerrada = new Date((serialCerrada - 25569) * 86400 * 1000).toISOString();
  }

  return {
    fudo_id: r[0],
    fecha,
    created_at: creacion,
    closed_at: cerrada,
    caja: r[4] || null,
    estado: r[5] || null,
    cliente: r[6] || null,
    mesa: r[7] ? String(r[7]) : null,
    sala: r[8] || null,
    personas: r[9] || 0,
    camarero: r[10] || null,
    medio_pago: r[11] || null,
    total: r[12] || 0,
    fiscal: r[13] || null,
    tipo_venta: r[14] || null,
    comentario: r[15] || null,
    origen: r[16] || null,
  };
}).filter(s => s.fecha);

// Group by month
const byMonth = {};
sales.forEach(s => {
  const key = s.fecha.substring(0, 7);
  if (!byMonth[key]) byMonth[key] = [];
  byMonth[key].push(s);
});

console.log('=== RESUMEN POR MES ===');
Object.entries(byMonth).sort().forEach(([month, rows]) => {
  const total = rows.reduce((a, r) => a + (r.total || 0), 0);
  const cerradas = rows.filter(r => r.estado === 'Cerrada');
  console.log(`${month}: ${rows.length} ventas · ${cerradas.length} cerradas · Total: $${Math.round(total).toLocaleString('es-CL')}`);
});

// Upload in batches
async function upload() {
  console.log('\n⬆ Subiendo a Supabase...\n');

  // Insert in batches of 100
  const batch = 100;
  let uploaded = 0;
  let errors = 0;

  for (let i = 0; i < sales.length; i += batch) {
    const chunk = sales.slice(i, i + batch);
    const res = await fetch(`${SUPA}/rest/v1/fudo_sales`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(chunk),
    });
    if (res.ok) {
      uploaded += chunk.length;
      process.stdout.write(`\r  ${uploaded}/${sales.length} subidos`);
    } else {
      const err = await res.text();
      if (i === 0) console.log('\n❌ Error:', err);
      errors++;
    }
  }
  console.log(`\n\n✅ ${uploaded} ventas subidas · ${errors} errores`);
}

upload().catch(e => console.error('Error:', e.message));
