// src/screens/admin/ReportsScreen.tsx
// Reportes estilo Fudo: sidebar + contenido con gráficos
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Dimensions } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';

type Section = 'ventas' | 'productos' | 'mesas' | 'garzones' | 'pagos';
type Period = 'turno' | 'diario' | 'semanal' | 'mensual' | 'anual' | 'rango';

const toLocal = (d: Date) => d.toLocaleDateString('en-CA');
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');
const toChileISO = (ds: string) => { const l = new Date(ds + 'T00:00:00'); const om = l.getTimezoneOffset(); const sg = om <= 0 ? '+' : '-'; const ao = Math.abs(om); return ds + 'T00:00:00' + sg + String(Math.floor(ao/60)).padStart(2,'0') + ':' + String(ao%60).padStart(2,'0'); };
const toChileEnd = (ds: string) => { const l = new Date(ds + 'T23:59:59'); const om = l.getTimezoneOffset(); const sg = om <= 0 ? '+' : '-'; const ao = Math.abs(om); return ds + 'T23:59:59' + sg + String(Math.floor(ao/60)).padStart(2,'0') + ':' + String(ao%60).padStart(2,'0'); };
const SW = Dimensions.get('window').width;

export default function ReportsScreen() {
  const [section, setSection] = useState<Section>('ventas');
  const [period, setPeriod] = useState<Period>('diario');
  const [date, setDate] = useState(toLocal(new Date()));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { load(); }, [period, date]);

  const loadMeta = async () => {
    const [u, c] = await Promise.all([
      supabase.from('users').select('id,name').order('name'),
      supabase.from('categories').select('id,name').eq('active', true).order('sort_order'),
    ]);
    if (u.data) setUsers(u.data);
    if (c.data) setCategories(c.data);
  };

  const getRange = () => {
    const d = new Date(date + 'T12:00:00');
    if (period === 'rango') return { since: toChileISO(dateFrom), until: toChileEnd(dateTo) };
    if (period === 'turno') {
      const from = new Date(); from.setHours(from.getHours() - 12);
      return { since: toChileISO(toLocal(from)), until: toChileEnd(toLocal(new Date())) };
    }
    if (period === 'diario') return { since: toChileISO(date), until: toChileEnd(date) };
    if (period === 'semanal') { const s = new Date(d); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); const e = new Date(s); e.setDate(e.getDate() + 6); return { since: toChileISO(toLocal(s)), until: toChileEnd(toLocal(e)) }; }
    if (period === 'mensual') { const s = new Date(d.getFullYear(), d.getMonth(), 1); const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); return { since: toChileISO(toLocal(s)), until: toChileEnd(toLocal(e)) }; }
    return { since: toChileISO(`${d.getFullYear()}-01-01`), until: toChileEnd(`${d.getFullYear()}-12-31`) };
  };

  const load = async () => {
    setLoading(true);
    const { since, until } = getRange();
    const { data: o } = await supabase.from('orders').select('*, table:table_id(number)').eq('status', 'cerrada').gte('closed_at', since).lte('closed_at', until).order('closed_at', { ascending: false });
    setOrders(o || []);
    const ids = (o || []).map((x: any) => x.id);
    if (ids.length > 0) {
      const [itRes, payRes] = await Promise.all([
        supabase.from('order_items').select('*, product:product_id(name, category_id, price)').in('order_id', ids),
        supabase.from('payments').select('*').in('order_id', ids),
      ]);
      setItems(itRes.data || []);
      setPayments(payRes.data || []);
    } else { setItems([]); setPayments([]); }
    setLoading(false);
  };

  const changeDate = (dir: number) => {
    const d = new Date(date + 'T12:00:00');
    if (period === 'diario') d.setDate(d.getDate() + dir);
    else if (period === 'semanal') d.setDate(d.getDate() + (dir * 7));
    else if (period === 'mensual') d.setMonth(d.getMonth() + dir);
    else if (period === 'anual') d.setFullYear(d.getFullYear() + dir);
    setDate(toLocal(d));
  };

  const dateLabel = () => {
    const d = new Date(date + 'T12:00:00');
    if (period === 'turno') return 'Turno actual';
    if (period === 'diario') return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (period === 'semanal') return `Semana del ${d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`;
    if (period === 'mensual') return d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    if (period === 'anual') return String(d.getFullYear());
    return `${dateFrom} → ${dateTo}`;
  };

  const waiterName = (id: string) => users.find(u => u.id === id)?.name || '?';
  const catName = (id: string) => categories.find(c => c.id === id)?.name || '?';

  // ── Cálculos ──
  const totalVentas = orders.reduce((s: number, o: any) => s + (o.total || 0), 0);
  const totalTips = payments.reduce((s: number, p: any) => s + (p.tip_amount || 0), 0);
  const avgTicket = orders.length > 0 ? Math.round(totalVentas / orders.length) : 0;

  const exportCSV = () => {
    const header = 'Fecha,Mesa,Método,Subtotal,Descuento,Total,Propina\n';
    const rows = orders.map((o: any) => `${o.closed_at ? new Date(o.closed_at).toLocaleDateString('en-CA') : ''},${o.table?.number || ''},${o.payment_method || ''},${o.subtotal || 0},${o.discount_value || 0},${o.total || 0},${o.tip_amount || 0}`).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `reporte_${date}.csv`; a.click();
  };

  // ── Sidebar ──
  const SECTIONS: { key: Section; label: string; icon: string }[] = [
    { key: 'ventas', label: 'Ventas', icon: '💰' },
    { key: 'productos', label: 'Productos', icon: '🍕' },
    { key: 'mesas', label: 'Mesas', icon: '🪑' },
    { key: 'garzones', label: 'Garzones', icon: '👤' },
    { key: 'pagos', label: 'Medios de Pago', icon: '💳' },
  ];

  return (
    <View style={st.wrap}>
      {/* Sidebar */}
      <View style={st.sidebar}>
        <Text style={st.sideTitle}>REPORTES</Text>
        {SECTIONS.map(s => (
          <TouchableOpacity key={s.key} style={[st.sideBtn, section === s.key && st.sideBtnA]} onPress={() => setSection(s.key)}>
            <Text style={{ fontSize: 16 }}>{s.icon}</Text>
            <Text style={[st.sideBtnT, section === s.key && st.sideBtnTA]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
        <View style={{ marginTop: 'auto', padding: 12 }}>
          <TouchableOpacity onPress={exportCSV} style={st.exportBtn}>
            <Text style={st.exportBtnT}>📥 Exportar CSV</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <View style={st.content}>
        {/* Period bar */}
        <View style={st.periodBar}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(['turno', 'diario', 'semanal', 'mensual', 'anual', 'rango'] as const).map(p => (
              <TouchableOpacity key={p} style={[st.pChip, period === p && st.pChipA]} onPress={() => setPeriod(p)}>
                <Text style={[st.pChipT, period === p && st.pChipTA]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {period !== 'turno' && period !== 'rango' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 16 }}>
              <TouchableOpacity onPress={() => changeDate(-1)} style={st.navBtn}><Text style={st.navBtnT}>◀</Text></TouchableOpacity>
              <Text style={st.dateLabel}>{dateLabel()}</Text>
              <TouchableOpacity onPress={() => changeDate(1)} style={st.navBtn}><Text style={st.navBtnT}>▶</Text></TouchableOpacity>
            </View>
          )}
          {period === 'rango' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 16 }}>
              <TextInput style={st.dateInput} value={dateFrom} onChangeText={setDateFrom} placeholder="2026-01-01" placeholderTextColor={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted }}>→</Text>
              <TextInput style={st.dateInput} value={dateTo} onChangeText={setDateTo} placeholder="2026-12-31" placeholderTextColor={COLORS.textMuted} />
              <TouchableOpacity onPress={load} style={[st.pChip, st.pChipA]}><Text style={st.pChipTA}>Buscar</Text></TouchableOpacity>
            </View>
          )}
        </View>

        {/* Summary cards */}
        <View style={st.summaryRow}>
          <SC label="Ventas totales" value={fmt(totalVentas)} color={COLORS.primary} />
          <SC label="Órdenes" value={String(orders.length)} />
          <SC label="Ticket promedio" value={fmt(avgTicket)} />
          <SC label="Propinas" value={fmt(totalTips)} color={COLORS.warning} />
        </View>

        {/* Section content */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          {loading && <Text style={{ textAlign: 'center', color: COLORS.textMuted, padding: 40 }}>Cargando...</Text>}

          {!loading && section === 'ventas' && <VentasSection orders={orders} />}
          {!loading && section === 'productos' && <ProductosSection items={items} catName={catName} categories={categories} />}
          {!loading && section === 'mesas' && <MesasSection orders={orders} />}
          {!loading && section === 'garzones' && <GarzonesSection orders={orders} items={items} payments={payments} waiterName={waiterName} />}
          {!loading && section === 'pagos' && <PagosSection payments={payments} />}
        </ScrollView>
      </View>
    </View>
  );
}

// ── VENTAS ──
function VentasSection({ orders }: { orders: any[] }) {
  const byDay: Record<string, { ventas: number; ordenes: number }> = {};
  orders.forEach(o => { const d = o.closed_at ? new Date(o.closed_at).toLocaleDateString('en-CA') : '?'; if (!byDay[d]) byDay[d] = { ventas: 0, ordenes: 0 }; byDay[d].ventas += o.total || 0; byDay[d].ordenes++; });
  const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(...days.map(([, d]) => d.ventas), 1);
  if (days.length === 0) return <Empty />;
  return (
    <View>
      <Text style={st.secTitle}>VENTAS POR DÍA</Text>
      <Text style={st.secSub}>{days.length} días con ventas</Text>
      {days.map(([day, d]) => (
        <View key={day} style={st.barRow}>
          <Text style={st.barLabel}>{day.slice(5)}</Text>
          <View style={st.barTrack}><View style={[st.barFill, { width: `${(d.ventas / max) * 100}%`, backgroundColor: COLORS.primary }]} /></View>
          <Text style={st.barValue}>{fmt(d.ventas)}</Text>
          <Text style={st.barSub}>{d.ordenes}</Text>
        </View>
      ))}
    </View>
  );
}

// ── PRODUCTOS ──
function ProductosSection({ items, catName, categories }: { items: any[]; catName: (id: string) => string; categories: any[] }) {
  const [filterCat, setFilterCat] = React.useState('todas');
  const [sortOrder, setSortOrder] = React.useState<'top' | 'bottom'>('top');

  const prodMap: Record<string, { name: string; qty: number; total: number; price: number; catId: string }> = {};
  items.forEach(i => {
    const name = i.product?.name || '?';
    if (!prodMap[name]) prodMap[name] = { name, qty: 0, total: 0, price: i.product?.price || i.unit_price, catId: i.product?.category_id || '' };
    prodMap[name].qty += i.quantity; prodMap[name].total += i.total_price;
  });

  let filtered = Object.values(prodMap);
  if (filterCat !== 'todas') filtered = filtered.filter(p => p.catId === filterCat);

  const sorted = sortOrder === 'top'
    ? filtered.sort((a, b) => b.qty - a.qty)
    : filtered.sort((a, b) => a.qty - b.qty);

  const display = sorted.slice(0, 100);
  const maxQty = Math.max(...display.map(p => p.qty), 1);
  const COLORS_BAR = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1'];

  // Categorías que tienen ventas
  const catsWithSales = new Set(Object.values(prodMap).map(p => p.catId));
  const activeCats = categories.filter(c => catsWithSales.has(c.id));

  if (Object.keys(prodMap).length === 0) return <Empty />;
  return (
    <View>
      <Text style={st.secTitle}>PRODUCTOS</Text>
      <Text style={st.secSub}>{filtered.length} productos · mostrando {display.length}</Text>

      {/* Filtros */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Orden */}
        <TouchableOpacity onPress={() => setSortOrder(sortOrder === 'top' ? 'bottom' : 'top')}
          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.primary, flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{sortOrder === 'top' ? '🔥 Más vendidos' : '📉 Menos vendidos'}</Text>
        </TouchableOpacity>
        {/* Categoría: Todas */}
        <TouchableOpacity onPress={() => setFilterCat('todas')}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: filterCat === 'todas' ? COLORS.text : COLORS.card, borderWidth: 1, borderColor: filterCat === 'todas' ? COLORS.text : COLORS.border }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: filterCat === 'todas' ? '#fff' : COLORS.textSecondary }}>Todas</Text>
        </TouchableOpacity>
        {activeCats.map(c => (
          <TouchableOpacity key={c.id} onPress={() => setFilterCat(c.id)}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: filterCat === c.id ? COLORS.text : COLORS.card, borderWidth: 1, borderColor: filterCat === c.id ? COLORS.text : COLORS.border }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: filterCat === c.id ? '#fff' : COLORS.textSecondary }}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 20 }}>
        {/* Chart */}
        <View style={{ flex: 1 }}>
          {display.slice(0, 20).map((p, i) => (
            <View key={p.name} style={st.barRow}>
              <Text style={[st.barLabel, { width: 120, fontSize: 11 }]} numberOfLines={1}>{p.name}</Text>
              <View style={st.barTrack}><View style={[st.barFill, { width: `${(p.qty / maxQty) * 100}%`, backgroundColor: COLORS_BAR[i % COLORS_BAR.length] }]} /></View>
              <Text style={st.barValue}>{p.qty}</Text>
            </View>
          ))}
        </View>
        {/* Table */}
        <View style={{ minWidth: 360 }}>
          <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: COLORS.border }}>
            <Text style={[st.th, { width: 30 }]}>#</Text>
            <Text style={[st.th, { flex: 1 }]}>Producto</Text>
            <Text style={[st.th, { width: 50 }]}>Uds</Text>
            <Text style={[st.th, { width: 80, textAlign: 'right' }]}>Total</Text>
            <Text style={[st.th, { width: 70, textAlign: 'right' }]}>Precio</Text>
          </View>
          {display.map((p, i) => (
            <View key={p.name} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' }}>
              <Text style={{ width: 30, fontSize: 12, color: COLORS.textMuted }}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{p.name}</Text>
                <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{catName(p.catId)}</Text>
              </View>
              <Text style={{ width: 50, fontSize: 14, fontWeight: '800', color: COLORS.primary, textAlign: 'center' }}>{p.qty}</Text>
              <Text style={{ width: 80, fontSize: 12, fontWeight: '600', color: COLORS.text, textAlign: 'right' }}>{fmt(p.total)}</Text>
              <Text style={{ width: 70, fontSize: 12, color: COLORS.textMuted, textAlign: 'right' }}>{fmt(p.price)}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ── MESAS ──
function MesasSection({ orders }: { orders: any[] }) {
  const byMesa: Record<string, { num: string; ventas: number; ordenes: number; avgTicket: number }> = {};
  orders.forEach(o => {
    const n = String(o.table?.number || o.table_number || '?');
    if (!byMesa[n]) byMesa[n] = { num: n, ventas: 0, ordenes: 0, avgTicket: 0 };
    byMesa[n].ventas += o.total || 0; byMesa[n].ordenes++;
  });
  Object.values(byMesa).forEach(m => { m.avgTicket = m.ordenes > 0 ? Math.round(m.ventas / m.ordenes) : 0; });
  const sorted = Object.values(byMesa).sort((a, b) => b.ventas - a.ventas);
  const max = Math.max(...sorted.map(m => m.ventas), 1);
  if (sorted.length === 0) return <Empty />;
  return (
    <View>
      <Text style={st.secTitle}>MESAS</Text>
      <Text style={st.secSub}>{sorted.length} mesas con ventas</Text>
      {sorted.map((m, i) => (
        <View key={m.num} style={st.barRow}>
          <Text style={[st.barLabel, { width: 60, fontWeight: '700' }]}>Mesa {m.num}</Text>
          <View style={st.barTrack}><View style={[st.barFill, { width: `${(m.ventas / max) * 100}%`, backgroundColor: '#06b6d4' }]} /></View>
          <Text style={st.barValue}>{fmt(m.ventas)}</Text>
          <Text style={st.barSub}>{m.ordenes} ord</Text>
        </View>
      ))}
    </View>
  );
}

// ── GARZONES ──
function GarzonesSection({ orders, items, payments, waiterName }: { orders: any[]; items: any[]; payments: any[]; waiterName: (id: string) => string }) {
  // Agrupar por quien ENVIÓ cada producto (created_by), no por quien abrió la mesa
  const byW: Record<string, { name: string; ventas: number; items: number; ordenes: Set<string>; tips: number }> = {};
  items.forEach(i => {
    const wid = i.created_by || '?';
    if (!byW[wid]) byW[wid] = { name: waiterName(wid), ventas: 0, items: 0, ordenes: new Set(), tips: 0 };
    byW[wid].ventas += i.total_price || 0;
    byW[wid].items++;
    byW[wid].ordenes.add(i.order_id);
  });
  // Propinas siguen por orders.waiter_id (quien cerró la mesa)
  payments.forEach(p => { const wid = orders.find(o => o.id === p.order_id)?.waiter_id; if (wid && byW[wid]) byW[wid].tips += p.tip_amount || 0; });

  const sorted = Object.entries(byW).map(([id, w]) => ({ id, ...w, ordenesCount: w.ordenes.size })).sort((a, b) => b.ventas - a.ventas);
  const max = Math.max(...sorted.map(w => w.ventas), 1);
  if (sorted.length === 0) return <Empty />;
  return (
    <View>
      <Text style={st.secTitle}>GARZONES — por productos enviados</Text>
      <Text style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>Cada producto se asigna a quien lo envió a cocina, no a quien abrió la mesa</Text>
      {sorted.map(w => (
        <View key={w.id} style={st.barRow}>
          <Text style={[st.barLabel, { width: 100 }]}>{w.name}</Text>
          <View style={st.barTrack}><View style={[st.barFill, { width: `${(w.ventas / max) * 100}%`, backgroundColor: '#8b5cf6' }]} /></View>
          <Text style={st.barValue}>{fmt(w.ventas)}</Text>
          <Text style={[st.barSub, { width: 60 }]}>{w.items} prod</Text>
          <Text style={[st.barSub, { width: 50 }]}>{w.ordenesCount} mesa{w.ordenesCount > 1 ? 's' : ''}</Text>
          {w.tips > 0 && <Text style={[st.barSub, { width: 70, color: COLORS.warning }]}>{fmt(w.tips)} tip</Text>}
        </View>
      ))}
    </View>
  );
}

// ── PAGOS ──
function PagosSection({ payments }: { payments: any[] }) {
  const byM: Record<string, { total: number; count: number; tips: number }> = {};
  payments.forEach(p => {
    const m = p.method || '?';
    if (!byM[m]) byM[m] = { total: 0, count: 0, tips: 0 };
    byM[m].total += p.amount || 0; byM[m].count++; byM[m].tips += p.tip_amount || 0;
  });
  const sorted = Object.entries(byM).sort((a, b) => b[1].total - a[1].total);
  const max = Math.max(...sorted.map(([, d]) => d.total), 1);
  const icons: Record<string, string> = { efectivo: '💵', debito: '💳', credito: '💳', transferencia: '📱' };
  if (sorted.length === 0) return <Empty />;
  return (
    <View>
      <Text style={st.secTitle}>MEDIOS DE PAGO</Text>
      {sorted.map(([m, d]) => (
        <View key={m} style={st.barRow}>
          <Text style={[st.barLabel, { width: 120 }]}>{icons[m] || '💰'} {m.charAt(0).toUpperCase() + m.slice(1)}</Text>
          <View style={st.barTrack}><View style={[st.barFill, { width: `${(d.total / max) * 100}%`, backgroundColor: '#f97316' }]} /></View>
          <Text style={st.barValue}>{fmt(d.total)}</Text>
          <Text style={st.barSub}>{d.count} pagos</Text>
        </View>
      ))}
    </View>
  );
}

// ── Helpers ──
function SC({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={st.sc}>
      <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: color || COLORS.text, marginTop: 2 }}>{value}</Text>
    </View>
  );
}
function Empty() { return <Text style={{ textAlign: 'center', color: COLORS.textMuted, padding: 40 }}>Sin datos para este período</Text>; }

// ── Styles ──
const st = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.background },
  sidebar: { width: 170, backgroundColor: COLORS.card, borderRightWidth: 1, borderRightColor: COLORS.border, paddingTop: 16 },
  sideTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, paddingHorizontal: 16, marginBottom: 12 },
  sideBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  sideBtnA: { borderLeftColor: COLORS.primary, backgroundColor: COLORS.primary + '10' },
  sideBtnT: { fontSize: 13, fontWeight: '500', color: COLORS.textMuted },
  sideBtnTA: { color: COLORS.text, fontWeight: '700' },
  exportBtn: { backgroundColor: COLORS.success, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  exportBtnT: { color: '#fff', fontSize: 12, fontWeight: '700' },
  content: { flex: 1 },
  periodBar: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexWrap: 'wrap', gap: 4 },
  pChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  pChipA: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pChipT: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary },
  pChipTA: { color: '#fff', fontWeight: '600' },
  navBtn: { width: 30, height: 30, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  navBtnT: { fontSize: 12, color: COLORS.textSecondary },
  dateLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },
  dateInput: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: COLORS.text, width: 110 },
  summaryRow: { flexDirection: 'row', backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sc: { flex: 1, padding: 14, borderRightWidth: 1, borderRightColor: COLORS.border },
  secTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  secSub: { fontSize: 12, color: COLORS.textMuted, marginBottom: 16 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  barLabel: { fontSize: 12, color: COLORS.textSecondary, width: 80 },
  barTrack: { flex: 1, height: 22, backgroundColor: COLORS.background, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barValue: { fontSize: 12, fontWeight: '700', color: COLORS.text, width: 80, textAlign: 'right' },
  barSub: { fontSize: 10, color: COLORS.textMuted, width: 40, textAlign: 'right' },
  th: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase' },
});
