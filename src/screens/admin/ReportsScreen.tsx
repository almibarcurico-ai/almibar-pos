// src/screens/admin/ReportsScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';
import { Chip, fmt, sh } from './shared';

type Period = 'hoy' | 'semana' | 'mes' | 'custom';

const toLocal = (d: Date) => d.toISOString().split('T')[0];
const today = () => toLocal(new Date());
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return toLocal(d); };
const monthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return toLocal(d); };

export default function ReportsScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [period, setPeriod] = useState<Period>('hoy');
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());

  useEffect(() => {
    if (period === 'hoy') { setDateFrom(today()); setDateTo(today()); }
    else if (period === 'semana') { setDateFrom(daysAgo(7)); setDateTo(today()); }
    else if (period === 'mes') { setDateFrom(monthsAgo(1)); setDateTo(today()); }
  }, [period]);

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  const load = async () => {
    const until = dateTo + 'T23:59:59';
    const { data: o } = await supabase.from('orders').select('*').eq('status', 'cerrada').gte('closed_at', dateFrom).lte('closed_at', until).order('closed_at', { ascending: false });
    if (o) setOrders(o);
    const ids = (o || []).map((x: any) => x.id);
    if (ids.length > 0) {
      const [itRes, payRes] = await Promise.all([
        supabase.from('order_items').select('*, product:product_id(name, category_id)').in('order_id', ids),
        supabase.from('payments').select('*').in('order_id', ids),
      ]);
      if (itRes.data) setItems(itRes.data);
      if (payRes.data) setPayments(payRes.data);
    } else { setItems([]); setPayments([]); }
  };

  const totalVentas = orders.reduce((s: number, o: any) => s + (o.total || 0), 0);
  const totalTips = payments.reduce((s: number, p: any) => s + (p.tip_amount || 0), 0);
  const totalDiscount = orders.reduce((s: number, o: any) => s + (o.discount_value || 0), 0);
  const avgTicket = orders.length > 0 ? Math.round(totalVentas / orders.length) : 0;

  // By payment method
  const byMethod: Record<string, number> = {};
  payments.filter((p: any) => p.amount > 0).forEach((p: any) => {
    byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
  });

  // Top products
  const prodMap: Record<string, { name: string; qty: number; total: number }> = {};
  items.forEach((i: any) => {
    const name = i.product?.name || '?';
    if (!prodMap[name]) prodMap[name] = { name, qty: 0, total: 0 };
    prodMap[name].qty += i.quantity;
    prodMap[name].total += i.total_price;
  });
  const top = Object.values(prodMap).sort((a, b) => b.total - a.total).slice(0, 20);

  // By day (for chart-like display)
  const byDay: Record<string, { ventas: number; ordenes: number }> = {};
  orders.forEach((o: any) => {
    const day = o.closed_at?.split('T')[0] || '?';
    if (!byDay[day]) byDay[day] = { ventas: 0, ordenes: 0 };
    byDay[day].ventas += o.total || 0;
    byDay[day].ordenes += 1;
  });
  const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
  const maxDayVentas = Math.max(...days.map(([, d]) => d.ventas), 1);

  // Export CSV
  const exportCSV = () => {
    const header = 'Fecha,Orden,Mesa,Método Pago,Subtotal,Descuento,Total,Propina\n';
    const rows = orders.map((o: any) =>
      `${o.closed_at?.split('T')[0]},${o.order_number || ''},${o.table_number || ''},${o.payment_method || ''},${o.subtotal || 0},${o.discount_value || 0},${o.total || 0},${o.tip_amount || 0}`
    ).join('\n');
    const csv = header + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const methodLabel = (m: string) => m === 'efectivo' ? '💵 Efectivo' : m === 'debito' ? '💳 Débito' : m === 'credito' ? '💳 Crédito' : '📱 Transferencia';

  return (
    <View style={sh.c}>
      {/* Period selector */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {(['hoy', 'semana', 'mes', 'custom'] as const).map(p => (
          <Chip key={p} label={p === 'custom' ? '📅 Rango' : p.charAt(0).toUpperCase() + p.slice(1)} active={period === p} onPress={() => setPeriod(p)} />
        ))}
        <TouchableOpacity onPress={exportCSV} style={{ marginLeft: 'auto', backgroundColor: COLORS.success, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>📥 Exportar CSV</Text>
        </TouchableOpacity>
      </View>

      {/* Custom date range */}
      {period === 'custom' && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10, gap: 8, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Desde:</Text>
          <TextInput
            style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: COLORS.text, width: 120 }}
            value={dateFrom} onChangeText={setDateFrom} placeholder="2026-01-01" placeholderTextColor={COLORS.textMuted}
          />
          <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Hasta:</Text>
          <TextInput
            style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: COLORS.text, width: 120 }}
            value={dateTo} onChangeText={setDateTo} placeholder="2026-12-31" placeholderTextColor={COLORS.textMuted}
          />
          <TouchableOpacity onPress={load} style={{ backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Buscar</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {/* Summary cards */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <View style={cardStyle}><Text style={cardNum}>{fmt(totalVentas)}</Text><Text style={cardLabel}>Ventas</Text></View>
          <View style={cardStyle}><Text style={cardNum}>{orders.length}</Text><Text style={cardLabel}>Órdenes</Text></View>
          <View style={cardStyle}><Text style={cardNum}>{fmt(avgTicket)}</Text><Text style={cardLabel}>Ticket prom.</Text></View>
          <View style={cardStyle}><Text style={[cardNum, { color: COLORS.warning }]}>{fmt(totalTips)}</Text><Text style={cardLabel}>Propinas</Text></View>
          {totalDiscount > 0 && <View style={cardStyle}><Text style={[cardNum, { color: COLORS.success }]}>{fmt(totalDiscount)}</Text><Text style={cardLabel}>Descuentos</Text></View>}
        </View>

        {/* By payment method */}
        <Text style={sectionTitle}>Por método de pago</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {Object.entries(byMethod).map(([m, total]) => (
            <View key={m} style={[cardStyle, { minWidth: 140 }]}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text }}>{fmt(total)}</Text>
              <Text style={cardLabel}>{methodLabel(m)}</Text>
            </View>
          ))}
          {Object.keys(byMethod).length === 0 && <Text style={{ color: COLORS.textMuted }}>Sin pagos</Text>}
        </View>

        {/* Daily breakdown */}
        {days.length > 1 && (
          <>
            <Text style={sectionTitle}>Ventas por día</Text>
            <View style={{ marginBottom: 16 }}>
              {days.map(([day, d]) => (
                <View key={day} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textSecondary, width: 80 }}>{day.slice(5)}</Text>
                  <View style={{ flex: 1, height: 20, backgroundColor: COLORS.background, borderRadius: 4, overflow: 'hidden' as const }}>
                    <View style={{ width: `${(d.ventas / maxDayVentas) * 100}%`, height: '100%', backgroundColor: COLORS.primary + '60', borderRadius: 4 }} />
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.text, width: 80, textAlign: 'right' }}>{fmt(d.ventas)}</Text>
                  <Text style={{ fontSize: 10, color: COLORS.textMuted, width: 30, textAlign: 'right' }}>{d.ordenes}ord</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Top Products */}
        <Text style={sectionTitle}>Top Productos</Text>
        {top.map((p, i) => (
          <View key={p.name} style={sh.row}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textMuted, width: 24 }}>{i + 1}</Text>
            <View style={{ flex: 1 }}><Text style={sh.rowName}>{p.name}</Text><Text style={sh.rowSub}>{p.qty} vendidos</Text></View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary }}>{fmt(p.total)}</Text>
          </View>
        ))}
        {top.length === 0 && <Text style={{ textAlign: 'center', color: COLORS.textMuted, marginTop: 20 }}>Sin datos para este período</Text>}
      </ScrollView>
    </View>
  );
}

const cardStyle = { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 14, alignItems: 'center' as const, borderWidth: 1, borderColor: COLORS.border };
const cardNum = { fontSize: 20, fontWeight: '800' as const, color: COLORS.primary };
const cardLabel = { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 };
const sectionTitle = { fontSize: 13, fontWeight: '700' as const, color: COLORS.textSecondary, textTransform: 'uppercase' as const, marginBottom: 8, letterSpacing: 1 };
