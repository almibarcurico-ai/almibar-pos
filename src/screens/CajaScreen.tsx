// src/screens/CajaScreen.tsx
// v4 - Fudo-style: Ventas table + Arqueos list

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { COLORS } from '../theme';

const SW = Dimensions.get('window').width;

export default function CajaScreen() {
  const [tab, setTab] = useState<'ventas' | 'movimientos' | 'arqueos' | 'anulaciones' | 'propinas'>('ventas');
  const TABS = [
    { key: 'ventas', label: 'Ventas' },
    { key: 'movimientos', label: 'Ingresos / Egresos' },
    { key: 'arqueos', label: 'Arqueos' },
    { key: 'anulaciones', label: 'Anulaciones' },
    { key: 'propinas', label: 'Propinas' },
  ] as const;

  return (
    <View style={s.c}>
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tabItem, tab === t.key && s.tabItemA]} onPress={() => setTab(t.key as any)}>
            <Text style={[s.tabItemT, tab === t.key && s.tabItemTA]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === 'ventas' && <VentasTab />}
      {tab === 'movimientos' && <MovimientosTab />}
      {tab === 'arqueos' && <ArqueosTab />}
      {tab === 'anulaciones' && <AnulacionesTab />}
      {tab === 'propinas' && <PropinasTab />}
    </View>
  );
}

// =====================================================
// VENTAS TAB - Fudo style
// =====================================================
function VentasTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [period, setPeriod] = useState<'turno' | 'diario' | 'semanal' | 'mensual' | 'anual' | 'rango'>('turno');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [rangoDesde, setRangoDesde] = useState(new Date().toLocaleDateString('en-CA'));
  const [rangoHasta, setRangoHasta] = useState(new Date().toLocaleDateString('en-CA'));
  const [filterPago, setFilterPago] = useState('todos');
  const [filterGarzon, setFilterGarzon] = useState('todos');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTables, setOpenTables] = useState<any[]>([]);
  const [currentArqueo, setCurrentArqueo] = useState<any>(null);

  // Detail modal
  const [detailModal, setDetailModal] = useState(false);
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => { loadUsers(); }, []);
  useEffect(() => { load(); }, [period, date, rangoDesde, rangoHasta]);

  const loadUsers = async () => {
    const { data } = await supabase.from('users').select('id, name').order('name');
    if (data) setUsers(data);
  };

  const load = async () => {
    setLoading(true);

    // Cargar mesas abiertas siempre
    const { data: openT } = await supabase.from('tables').select('*, current_order:orders(*, waiter:created_by(name), order_items(total_price))').eq('active', true).in('status', ['ocupada', 'cuenta']).order('number');
    setOpenTables(openT || []);

    // Cargar arqueo actual
    const { data: cajas } = await supabase.from('cash_registers').select('*').is('closed_at', null).order('opened_at', { ascending: false }).limit(1);
    setCurrentArqueo(cajas?.[0] || null);

    let since: string, until: string;

    // Convertir fecha local (Chile) a ISO con offset correcto
    // Esto asegura que "2026-04-01" sea medianoche Chile, no medianoche UTC
    const toChileISO = (dateStr: string) => {
      // Crear fecha en hora local del navegador (que está en Chile)
      const local = new Date(dateStr + 'T00:00:00');
      // Obtener offset en minutos y convertir a formato ±HH:MM
      const offsetMin = local.getTimezoneOffset();
      const sign = offsetMin <= 0 ? '+' : '-';
      const absOff = Math.abs(offsetMin);
      const hh = String(Math.floor(absOff / 60)).padStart(2, '0');
      const mm = String(absOff % 60).padStart(2, '0');
      return dateStr + 'T00:00:00' + sign + hh + ':' + mm;
    };

    const addDays = (dateStr: string, days: number) => {
      const d = new Date(dateStr + 'T12:00:00'); // noon to avoid DST edge
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    const d = new Date(date + 'T12:00:00');

    if (period === 'turno') {
      // Desde la apertura del arqueo actual hasta ahora
      if (cajas?.[0]) {
        since = cajas[0].opened_at;
      } else {
        since = toChileISO(new Date().toLocaleDateString('en-CA'));
      }
      until = toChileISO(addDays(new Date().toLocaleDateString('en-CA'), 1));
    } else if (period === 'diario') {
      since = toChileISO(date);
      until = toChileISO(addDays(date, 1));
    } else if (period === 'semanal') {
      const start = new Date(d); start.setDate(start.getDate() - start.getDay());
      const startStr = start.toISOString().split('T')[0];
      since = toChileISO(startStr);
      until = toChileISO(addDays(startStr, 7));
    } else if (period === 'mensual') {
      const startStr = date.substring(0, 7) + '-01';
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const endStr = end.toISOString().split('T')[0];
      since = toChileISO(startStr);
      until = toChileISO(endStr);
    } else if (period === 'anual') {
      since = toChileISO(d.getFullYear() + '-01-01');
      until = toChileISO((d.getFullYear() + 1) + '-01-01');
    } else if (period === 'rango') {
      since = toChileISO(rangoDesde);
      until = toChileISO(addDays(rangoHasta, 1));
    }

    // Mesa orders cerradas + Delivery orders en paralelo
    const [{ data: mesaData }, { data: delivData }] = await Promise.all([
      supabase.from('orders').select('*, table:table_id(number)').eq('status', 'cerrada').gte('closed_at', since!).lt('closed_at', until!).order('closed_at', { ascending: false }),
      supabase.from('delivery_orders').select('*').eq('status', 'entregado').gte('closed_at', since!).lt('closed_at', until!).order('closed_at', { ascending: false }),
    ]);

    const mesaOrders = (mesaData || []).map((o: any) => ({ ...o, _type: 'mesa', table_number: o.table?.number || null }));
    const delivOrders = (delivData || []).map((o: any) => ({
      ...o,
      _type: 'delivery',
      table_number: '🛵',
      waiter_id: o.accepted_by || '',
      tip_amount: o.tip_total || 0,
      payment_method: 'efectivo',
    }));

    // En modo turno, incluir órdenes abiertas
    let openOrders: any[] = [];
    if (period === 'turno') {
      const { data: openData } = await supabase.from('orders').select('*, order_items(total_price)').eq('status', 'abierta').gte('opened_at', since!).order('opened_at', { ascending: false });
      // Obtener números de mesa para órdenes abiertas
      const openTableIds = (openData || []).map((o: any) => o.table_id).filter(Boolean);
      let tableMap: Record<string, number> = {};
      if (openTableIds.length > 0) {
        const { data: tbs } = await supabase.from('tables').select('id, number').in('id', openTableIds);
        for (const t of (tbs || [])) tableMap[t.id] = t.number;
      }
      openOrders = (openData || []).map((o: any) => ({
        ...o, _type: 'mesa', _open: true, table_number: tableMap[o.table_id] || null,
        total: (o.order_items || []).reduce((a: number, i: any) => a + (i.total_price || 0), 0),
        waiter_id: o.waiter_id,
      }));
    }

    const allOrders = [...openOrders, ...mesaOrders, ...delivOrders].sort((a, b) => new Date(b.closed_at || b.opened_at || 0).getTime() - new Date(a.closed_at || a.opened_at || 0).getTime());
    setOrders(allOrders);

    // Load payments for mesa orders
    const mesaIds = mesaOrders.map((o: any) => o.id);
    if (mesaIds.length > 0) {
      const { data: pays } = await supabase.from('payments').select('*, order:order_id(waiter_id, table_number)').in('order_id', mesaIds);
      if (pays) setPayments(pays);
    } else setPayments([]);
    setLoading(false);
  };

  const fmt = (p: number) => '$' + Math.round(p).toLocaleString('es-CL');
  const waiterName = (id: string) => users.find(u => u.id === id)?.name || '-';

  // Apply filters
  const filtered = orders.filter(o => {
    if (filterPago !== 'todos' && o.payment_method !== filterPago) return false;
    if (filterGarzon !== 'todos' && o.waiter_id !== filterGarzon) return false;
    return true;
  });

  const totals = {
    ventas: filtered.length,
    total: filtered.reduce((a, o) => a + (o.total || 0), 0),
    personas: filtered.reduce((a, o) => a + (o.covers || 1), 0),
    propinas: filtered.reduce((a, o) => a + (o.tip_amount || 0), 0),
  };
  const promVenta = totals.ventas > 0 ? Math.round(totals.total / totals.ventas) : 0;
  const promPersona = totals.personas > 0 ? Math.round(totals.total / totals.personas) : 0;

  const viewDetail = async (order: any) => {
    setDetailOrder(order);
    const [{ data }, { data: w }] = await Promise.all([
      supabase.from('order_items').select('*, product:product_id(name)').eq('order_id', order.id).order('created_at'),
      supabase.from('users').select('name').eq('id', order.waiter_id).single(),
    ]);
    setDetailItems(data || []);
    if (w) setDetailOrder((p: any) => ({ ...p, waiter_name: w.name }));
    setDetailModal(true);
  };

  const changeDate = (dir: number) => {
    if (period === 'rango' || period === 'turno') return;
    const d = new Date(date + 'T12:00:00');
    if (period === 'diario') d.setDate(d.getDate() + dir);
    else if (period === 'semanal') d.setDate(d.getDate() + (dir * 7));
    else if (period === 'mensual') d.setMonth(d.getMonth() + dir);
    else if (period === 'anual') d.setFullYear(d.getFullYear() + dir);
    setDate(d.toLocaleDateString('en-CA'));
  };

  const dateLabel = () => {
    const d = new Date(date + 'T12:00:00');
    if (period === 'turno') return currentArqueo ? 'Desde ' + new Date(currentArqueo.opened_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Sin arqueo abierto';
    if (period === 'diario') return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    if (period === 'semanal') return `Semana del ${d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`;
    if (period === 'anual') return String(d.getFullYear());
    if (period === 'rango') return `${rangoDesde} → ${rangoHasta}`;
    return d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }} nestedScrollEnabled>
      {/* Filter bar - fixed at top */}
      <View style={s.filterBar}>
        {/* Period selector */}
        <View style={s.filterRow}>
          {(['turno', 'diario', 'semanal', 'mensual', 'anual', 'rango'] as const).map(p => (
            <TouchableOpacity key={p} style={[s.fChip, period === p && s.fChipA]} onPress={() => setPeriod(p)}>
              <Text style={[s.fChipT, period === p && s.fChipTA]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* Date nav */}
        {period === 'turno' ? (
          <View style={[s.dateNav]}>
            <Text style={s.dateLabel}>{dateLabel()}</Text>
          </View>
        ) : period === 'rango' ? (
          <View style={[s.dateNav, { gap: 8 }]}>
            <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Desde:</Text>
            <TextInput style={[s.fChip, { paddingHorizontal: 10, fontSize: 13, color: COLORS.text, minWidth: 120, textAlign: 'center' }]} value={rangoDesde} onChangeText={setRangoDesde} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.textMuted} />
            <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Hasta:</Text>
            <TextInput style={[s.fChip, { paddingHorizontal: 10, fontSize: 13, color: COLORS.text, minWidth: 120, textAlign: 'center' }]} value={rangoHasta} onChangeText={setRangoHasta} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.textMuted} />
          </View>
        ) : (
          <View style={s.dateNav}>
            <TouchableOpacity onPress={() => changeDate(-1)} style={s.dateBtn}><Text style={s.dateBtnT}>◀</Text></TouchableOpacity>
            <Text style={s.dateLabel}>{dateLabel()}</Text>
            <TouchableOpacity onPress={() => changeDate(1)} style={s.dateBtn}><Text style={s.dateBtnT}>▶</Text></TouchableOpacity>
          </View>
        )}
        {/* Filters */}
        <View style={s.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {/* Medio de pago */}
            {['todos', 'efectivo', 'debito', 'credito', 'transferencia'].map(m => (
              <TouchableOpacity key={m} style={[s.fChip, filterPago === m && s.fChipA]} onPress={() => setFilterPago(m)}>
                <Text style={[s.fChipT, filterPago === m && s.fChipTA]}>{m === 'todos' ? 'Todos' : m.charAt(0).toUpperCase() + m.slice(1)}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ width: 10 }} />
            {/* Garzón */}
            <TouchableOpacity style={[s.fChip, filterGarzon === 'todos' && s.fChipA]} onPress={() => setFilterGarzon('todos')}>
              <Text style={[s.fChipT, filterGarzon === 'todos' && s.fChipTA]}>Todos</Text>
            </TouchableOpacity>
            {users.filter(u => u.name).map(u => (
              <TouchableOpacity key={u.id} style={[s.fChip, filterGarzon === u.id && s.fChipA]} onPress={() => setFilterGarzon(u.id)}>
                <Text style={[s.fChipT, filterGarzon === u.id && s.fChipTA]}>{u.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Mesas abiertas */}
      {openTables.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 6 }}>Mesas Abiertas ({openTables.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {openTables.map((t: any) => {
                const order = t.current_order;
                const total = order?.order_items?.reduce((a: number, i: any) => a + (i.total_price || 0), 0) || 0;
                const isCuenta = t.status === 'cuenta';
                return (
                  <View key={t.id} style={{ backgroundColor: isCuenta ? COLORS.warning + '20' : COLORS.primary + '15', borderWidth: 1, borderColor: isCuenta ? COLORS.warning : COLORS.primary + '40', borderRadius: 10, padding: 10, minWidth: 100, alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: isCuenta ? COLORS.warning : COLORS.primary }}>#{t.number}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text }}>{fmt(total)}</Text>
                    <Text style={{ fontSize: 9, color: COLORS.textMuted }}>{order?.waiter?.name || '-'}</Text>
                    {isCuenta && <Text style={{ fontSize: 9, fontWeight: '700', color: COLORS.warning, marginTop: 2 }}>CUENTA</Text>}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Summary bar like Fudo */}
      <View style={s.summaryRow}>
        <SumCard label="Ventas" value={String(totals.ventas)} />
        <SumCard label="Prom. por venta" value={fmt(promVenta)} />
        <SumCard label="Personas" value={String(totals.personas)} />
        <SumCard label="Prom. por persona" value={fmt(promPersona)} />
        <SumCard label="Total" value={fmt(totals.total)} highlight />
        {totals.propinas > 0 && <SumCard label="Propinas" value={fmt(totals.propinas)} />}
      </View>

      {/* Table */}
      <View style={s.tblHdr}>
        <Text style={[s.tblH, { width: 130 }]}>Hora Inicio</Text>
        <Text style={[s.tblH, { width: 130 }]}>Hora cierre</Text>
        <Text style={[s.tblH, { width: 70 }]}>Estado</Text>
        <Text style={[s.tblH, { width: 50 }]}>Mesa</Text>
        <Text style={[s.tblH, { width: 80 }]}>Cam / Rep</Text>
        <Text style={[s.tblH, { width: 60 }]}>Pago</Text>
        <Text style={[s.tblH, { width: 70, textAlign: 'right' }]}>Propina</Text>
        <Text style={[s.tblH, { width: 80, textAlign: 'right' }]}>Total</Text>
      </View>

      {/* Table rows */}
      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View>
          {filtered.map((o, i) => (
            <TouchableOpacity key={o.id} style={[s.tblRow, i % 2 === 0 && { backgroundColor: COLORS.card }]} onPress={() => viewDetail(o)}>
              <Text style={[s.tblC, { width: 130 }]}>{o.created_at ? new Date(o.created_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</Text>
              <Text style={[s.tblC, { width: 130 }]}>{o.closed_at ? new Date(o.closed_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</Text>
              <Text style={[s.tblC, { width: 70, color: o._open ? COLORS.warning : COLORS.success, fontWeight: '600' }]}>{o._open ? 'Abierta' : 'Cerrada'}</Text>
              <Text style={[s.tblC, { width: 50 }]}>{o.table_number || o.order_number || '-'}</Text>
              <Text style={[s.tblC, { width: 80 }]}>{waiterName(o.waiter_id)}</Text>
              <Text style={[s.tblC, { width: 60, fontSize: 10 }]}>{o.payment_method || '-'}</Text>
              <Text style={[s.tblC, { width: 70, textAlign: 'right', color: (o.tip_amount || 0) > 0 ? COLORS.warning : COLORS.textMuted }]}>{(o.tip_amount || 0) > 0 ? fmt(o.tip_amount) : '-'}</Text>
              <Text style={[s.tblC, { width: 80, textAlign: 'right', fontWeight: '700', color: COLORS.primary }]}>{fmt(o.total)}</Text>
            </TouchableOpacity>
          ))}
          {filtered.length === 0 && <View style={{ padding: 20 }}><Text style={{ color: COLORS.textMuted, textAlign: 'center' }}>Sin ventas en este período</Text></View>}
        </View>
      </ScrollView>

      <Text style={{ fontSize: 12, color: COLORS.textMuted, paddingHorizontal: 16, marginTop: 8 }}>{filtered.length} registros</Text>

      {/* PROPINAS SECTION */}
      {(() => {
        const tipsFromPayments = payments.filter(p => (p.tip_amount || 0) > 0);
        const totalTips = tipsFromPayments.reduce((a: number, p: any) => a + (p.tip_amount || 0), 0);
        
        if (totalTips === 0) return null;

        // By method
        const byMethod: Record<string, number> = {};
        tipsFromPayments.forEach((p: any) => { byMethod[p.method] = (byMethod[p.method] || 0) + (p.tip_amount || 0); });
        
        // By waiter
        const byWaiter: Record<string, number> = {};
        tipsFromPayments.forEach((p: any) => {
          const wid = p.order?.waiter_id || 'desconocido';
          byWaiter[wid] = (byWaiter[wid] || 0) + (p.tip_amount || 0);
        });

        return (
          <View style={{ margin: 16, backgroundColor: COLORS.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>🤝 PROPINAS</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.warning }}>{fmt(totalTips)}</Text>
            </View>

            {/* By payment method */}
            <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>POR MEDIO DE PAGO</Text>
            {Object.entries(byMethod).map(([method, amount]) => (
              <View key={method} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                <Text style={{ fontSize: 13, color: COLORS.text, textTransform: 'capitalize' }}>{method === 'efectivo' ? '💵' : method === 'transferencia' ? '📱' : '💳'} {method}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.warning }}>{fmt(amount as number)}</Text>
              </View>
            ))}

            {/* By waiter */}
            <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginTop: 12, marginBottom: 6 }}>POR GARZÓN</Text>
            {Object.entries(byWaiter).map(([wid, amount]) => (
              <View key={wid} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                <Text style={{ fontSize: 13, color: COLORS.text }}>👤 {waiterName(wid)}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.warning }}>{fmt(amount as number)}</Text>
              </View>
            ))}

            {/* Individual tips list */}
            <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginTop: 12, marginBottom: 6 }}>DETALLE</Text>
            {tipsFromPayments.map((p: any, i: number) => {
              const ord = filtered.find((o: any) => o.id === p.order_id);
              return (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted, width: 50 }}>{ord?.closed_at ? new Date(ord.closed_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '-'}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.text, flex: 1 }}>Mesa {ord?.table_number || '-'} • {waiterName(p.order?.waiter_id || '')}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted, width: 60, textTransform: 'capitalize' }}>{p.method}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.warning, width: 70, textAlign: 'right' }}>{fmt(p.tip_amount)}</Text>
                </View>
              );
            })}
          </View>
        );
      })()}

      {/* Detail Modal */}
      <Modal visible={detailModal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={[s.md, { maxWidth: 500 }]}>
            <Text style={s.mdT}>Orden #{detailOrder?.order_number}</Text>
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' }}>
              Mesa {detailOrder?.table_number || '—'} • {detailOrder?.closed_at ? new Date(detailOrder.closed_at).toLocaleString('es-CL') : ''}
              {detailOrder?.waiter_name ? ` • ${detailOrder.waiter_name}` : ''}
            </Text>
            <View style={s.div} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>CONSUMO</Text>
            {detailItems.map(it => (
              <View key={it.id} style={{ flexDirection: 'row', paddingVertical: 3 }}>
                <Text style={{ width: 28, fontSize: 13, fontWeight: '700', color: COLORS.textSecondary }}>{it.quantity}x</Text>
                <Text style={{ flex: 1, fontSize: 13, color: COLORS.text }}>{it.product?.name}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text, marginLeft: 8 }}>{fmt(it.total_price)}</Text>
              </View>
            ))}
            <View style={s.div} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: COLORS.textSecondary }}>Subtotal</Text>
              <Text style={{ fontWeight: '600', color: COLORS.text }}>{fmt(detailOrder?.subtotal || 0)}</Text>
            </View>
            {(detailOrder?.discount_value || 0) > 0 && <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: COLORS.success }}>Descuento</Text>
              <Text style={{ fontWeight: '600', color: COLORS.success }}>-{fmt(detailOrder.discount_value)}</Text>
            </View>}
            {(detailOrder?.tip_amount || 0) > 0 && <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: COLORS.textSecondary }}>Propina</Text>
              <Text style={{ fontWeight: '600', color: COLORS.warning }}>{fmt(detailOrder.tip_amount)}</Text>
            </View>}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 2, borderTopColor: COLORS.primary }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>TOTAL</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary }}>{fmt(detailOrder?.total || 0)}</Text>
            </View>

            {/* EDITAR */}
            <View style={{ marginTop: 16, backgroundColor: COLORS.background, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>EDITAR VENTA</Text>
              <Text style={s.lb}>Método de pago</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {['efectivo', 'debito', 'credito', 'transferencia', 'mixto'].map(m => (
                  <TouchableOpacity key={m} onPress={() => setDetailOrder((p: any) => ({ ...p, payment_method: m }))}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: detailOrder?.payment_method === m ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: detailOrder?.payment_method === m ? COLORS.primary : COLORS.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: detailOrder?.payment_method === m ? '#fff' : COLORS.text }}>{m.charAt(0).toUpperCase() + m.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.lb}>Propina</Text>
                  <TextInput style={s.inp} value={String(detailOrder?.tip_amount || 0)} onChangeText={t => setDetailOrder((p: any) => ({ ...p, tip_amount: parseInt(t) || 0 }))} keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.lb}>Descuento</Text>
                  <TextInput style={s.inp} value={String(detailOrder?.discount_value || 0)} onChangeText={t => {
                    const dv = parseInt(t) || 0;
                    const sub = detailOrder?.subtotal || 0;
                    setDetailOrder((p: any) => ({ ...p, discount_value: dv, total: Math.max(0, sub - dv) }));
                  }} keyboardType="number-pad" />
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={s.bC} onPress={() => setDetailModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={s.bOk} onPress={async () => {
                if (!detailOrder) return;
                const total = Math.max(0, (detailOrder.subtotal || 0) - (detailOrder.discount_value || 0));
                await supabase.from('orders').update({
                  payment_method: detailOrder.payment_method,
                  tip_amount: detailOrder.tip_amount || 0,
                  discount_value: detailOrder.discount_value || 0,
                  total,
                }).eq('id', detailOrder.id);
                Alert.alert('Guardado', 'Venta actualizada');
                setDetailModal(false);
                load();
              }}><Text style={s.bOkT}>Guardar cambios</Text></TouchableOpacity>
            </View>
          </View>
        </ScrollView></View>
      </Modal>
    </ScrollView>
  );
}

// =====================================================
// ARQUEOS TAB - Fudo style
// =====================================================
// =====================================================
// MOVIMIENTOS TAB - Ingresos y Egresos
// =====================================================
function MovimientosTab() {
  const { user } = useAuth();
  const [movements, setMovements] = useState<any[]>([]);
  const [cashRegister, setCashRegister] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [movType, setMovType] = useState<'gasto' | 'ingreso'>('gasto');
  const [movAmount, setMovAmount] = useState('');
  const [movDesc, setMovDesc] = useState('');

  const fmt = (p: number) => '$' + Math.round(p).toLocaleString('es-CL');

  const loadData = async () => {
    const todayLocal = new Date();
    const todayStr = todayLocal.toLocaleDateString('en-CA');
    const offsetMin = todayLocal.getTimezoneOffset();
    const sign = offsetMin <= 0 ? '+' : '-';
    const absOff = Math.abs(offsetMin);
    const tz = sign + String(Math.floor(absOff / 60)).padStart(2, '0') + ':' + String(absOff % 60).padStart(2, '0');
    const todayISO = todayStr + 'T00:00:00' + tz;

    // Buscar arqueo abierto sin importar fecha de apertura
    const { data: cajas } = await supabase.from('cash_registers').select('*').is('closed_at', null).order('opened_at', { ascending: false }).limit(1);
    const caja = cajas?.[0] || null;
    setCashRegister(caja);
    if (caja) {
      const { data: movs } = await supabase.from('cash_movements').select('*, users:created_by(name)').eq('cash_register_id', caja.id).order('created_at', { ascending: false });
      if (movs) setMovements(movs);
    } else {
      const { data: movs } = await supabase.from('cash_movements').select('*, users:created_by(name)').gte('created_at', todayISO).order('created_at', { ascending: false });
      if (movs) setMovements(movs);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleAdd = async () => {
    if (!user) return;
    const amt = parseInt(movAmount);
    if (!amt || amt <= 0 || !movDesc.trim()) { Alert.alert('Error', 'Monto y descripción requeridos'); return; }
    if (!cashRegister) { Alert.alert('Error', 'Debes abrir un arqueo de caja primero'); return; }
    await supabase.from('cash_movements').insert({ cash_register_id: cashRegister.id, type: movType, amount: amt, description: movDesc.trim(), created_by: user.id });
    setModal(false); setMovAmount(''); setMovDesc('');
    await loadData();
  };

  const delMov = (id: string) => {
    const ok = typeof window !== 'undefined' ? window.confirm('¿Eliminar este movimiento?') : true;
    if (ok) { supabase.from('cash_movements').delete().eq('id', id).then(() => loadData()); }
  };

  const totalIngresos = movements.filter(m => m.type === 'ingreso').reduce((a, m) => a + m.amount, 0);
  const totalEgresos = movements.filter(m => m.type === 'gasto').reduce((a, m) => a + m.amount, 0);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.textMuted }}>Cargando...</Text></View>;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
      {/* Header */}
      <View style={s.arqueoHdr}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>Movimientos de Caja</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[s.fChip, { backgroundColor: COLORS.error, borderColor: COLORS.error }]} onPress={() => { setMovType('gasto'); setMovAmount(''); setMovDesc(''); setModal(true); }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>📤 Egreso</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.fChip, { backgroundColor: COLORS.success, borderColor: COLORS.success }]} onPress={() => { setMovType('ingreso'); setMovAmount(''); setMovDesc(''); setModal(true); }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>📥 Ingreso</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!cashRegister && (
        <View style={{ margin: 16, padding: 14, backgroundColor: COLORS.warning + '20', borderRadius: 10, borderWidth: 1, borderColor: COLORS.warning + '40' }}>
          <Text style={{ fontSize: 13, color: COLORS.warning, fontWeight: '600' }}>⚠️ No hay arqueo abierto. Abre uno en la pestaña Arqueos para registrar movimientos.</Text>
        </View>
      )}

      {/* Summary */}
      <View style={s.summaryRow}>
        <SumCard label="📥 Ingresos" value={fmt(totalIngresos)} />
        <SumCard label="📤 Egresos" value={fmt(totalEgresos)} />
        <SumCard label="Balance" value={fmt(totalIngresos - totalEgresos)} highlight />
      </View>

      {/* Movement list */}
      <View style={{ paddingHorizontal: 16, gap: 6 }}>
        {movements.map(m => (
          <View key={m.id} style={s.movRow}>
            <Text style={{ fontSize: 18, marginRight: 8 }}>{m.type === 'gasto' ? '📤' : '📥'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{m.description}</Text>
              <Text style={{ fontSize: 11, color: COLORS.textMuted }}>
                {new Date(m.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                {m.users?.name ? ` • ${m.users.name}` : ''}
              </Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: m.type === 'gasto' ? COLORS.error : COLORS.success }}>
              {m.type === 'gasto' ? '-' : '+'}{fmt(m.amount)}
            </Text>
            <TouchableOpacity onPress={() => delMov(m.id)} style={{ padding: 6, marginLeft: 6 }}><Text>🗑</Text></TouchableOpacity>
          </View>
        ))}
        {movements.length === 0 && <Text style={{ color: COLORS.textMuted, textAlign: 'center', padding: 30 }}>Sin movimientos registrados</Text>}
      </View>

      {/* Add movement modal */}
      <Modal visible={modal} transparent animationType="fade">
        <View style={s.ov}><View style={s.md}>
          <Text style={s.mdT}>{movType === 'gasto' ? '📤 Registrar Egreso' : '📥 Registrar Ingreso'}</Text>
          <Text style={s.lb}>Monto</Text>
          <TextInput style={[s.inp, { fontSize: 24, textAlign: 'center', fontWeight: '800' }]} placeholder="0" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" value={movAmount} onChangeText={setMovAmount} autoFocus />
          {movType === 'gasto' && (
            <>
              <Text style={s.lb}>Motivo rápido</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {['Insumos', 'Gas', 'Limpieza', 'Propina staff', 'Uber/Taxi', 'Emergencia', 'Proveedor', 'Delivery'].map(m => (
                  <TouchableOpacity key={m} onPress={() => setMovDesc(m)} style={[s.fChip, movDesc === m && s.fChipA]}>
                    <Text style={[s.fChipT, movDesc === m && s.fChipTA]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          {movType === 'ingreso' && (
            <>
              <Text style={s.lb}>Motivo rápido</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {['Reembolso', 'Cambio', 'Fondo extra', 'Otro'].map(m => (
                  <TouchableOpacity key={m} onPress={() => setMovDesc(m)} style={[s.fChip, movDesc === m && s.fChipA]}>
                    <Text style={[s.fChipT, movDesc === m && s.fChipTA]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          <Text style={s.lb}>Descripción</Text>
          <TextInput style={s.inp} placeholder="Detalle..." placeholderTextColor={COLORS.textMuted} value={movDesc} onChangeText={setMovDesc} />
          <View style={s.mBs}>
            <TouchableOpacity style={s.bC} onPress={() => setModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={[s.bOk, { backgroundColor: movType === 'gasto' ? COLORS.error : COLORS.success }]} onPress={handleAdd}><Text style={s.bOkT}>Registrar</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </ScrollView>
  );
}

// =====================================================
// ARQUEOS TAB
// =====================================================
function ArqueosTab() {
  const { user } = useAuth();
  const [cashRegister, setCashRegister] = useState<any>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [todayOrders, setTodayOrders] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [openModal, setOpenModal] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [openFecha, setOpenFecha] = useState(new Date().toLocaleDateString('en-CA'));
  const [openHora, setOpenHora] = useState(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }));
  const [closeModal, setCloseModal] = useState(false);
  const [movModal, setMovModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editArqueo, setEditArqueo] = useState<any>(null);
  const [editFecha, setEditFecha] = useState('');
  const [editHora, setEditHora] = useState('');
  const [editMonto, setEditMonto] = useState('');
  const [editCloseFecha, setEditCloseFecha] = useState('');
  const [editCloseHora, setEditCloseHora] = useState('');
  const [editCloseMonto, setEditCloseMonto] = useState('');
  const [editNotas, setEditNotas] = useState('');
  const [detailArqueo, setDetailArqueo] = useState<any>(null);
  const [detailOrders, setDetailOrders] = useState<any[]>([]);
  const [detailMovs, setDetailMovs] = useState<any[]>([]);
  const [detailPayments, setDetailPayments] = useState<any[]>([]);
  const [movType, setMovType] = useState<'gasto' | 'ingreso'>('gasto');
  const [movAmount, setMovAmount] = useState('');
  const [movDesc, setMovDesc] = useState('');

  // Arqueo conteo por método
  const [cEfectivo, setCEfectivo] = useState('');
  const [cDebito, setCDebito] = useState('');
  const [cCredito, setCCredito] = useState('');
  const [cTransferencia, setCTransferencia] = useState('');
  const [cNotas, setCNotas] = useState('');
  const [shiftPayments, setShiftPayments] = useState<any[]>([]);
  const [shiftDelivPayments, setShiftDelivPayments] = useState<any[]>([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const todayLocal = new Date();
      const todayStr = todayLocal.toLocaleDateString('en-CA');
      const offsetMin = todayLocal.getTimezoneOffset();
      const sign = offsetMin <= 0 ? '+' : '-';
      const absOff = Math.abs(offsetMin);
      const tz = sign + String(Math.floor(absOff / 60)).padStart(2, '0') + ':' + String(absOff % 60).padStart(2, '0');
      const todayISO = todayStr + 'T00:00:00' + tz;

      const { data: cajas } = await supabase.from('cash_registers').select('*').is('closed_at', null).order('opened_at', { ascending: false }).limit(1);
      const caja = cajas?.[0] || null;
      setCashRegister(caja);

      // Usar apertura del arqueo como inicio del turno (no "hoy")
      const shiftSince = caja ? caja.opened_at : todayISO;

      const { data: ords } = await supabase.from('orders').select('*, table:table_id(number)').eq('status', 'cerrada').gte('closed_at', shiftSince);
      if (ords) setTodayOrders(ords.map((o: any) => ({ ...o, table_number: o.table?.number || null })));

      if (caja) {
        const { data: movs } = await supabase.from('cash_movements').select('*, users:created_by(name)').eq('cash_register_id', caja.id).order('created_at', { ascending: false });
        if (movs) setMovements(movs);
      } else setMovements([]);

      const { data: hist } = await supabase.from('cash_registers').select('*, opener:opened_by(name), closer:closed_by(name)').not('closed_at', 'is', null).order('closed_at', { ascending: false }).limit(30);

      // Load payments from closed orders of the shift
      const orderIds = (ords || []).map((o: any) => o.id);
      if (orderIds.length > 0) {
        const { data: sp } = await supabase.from('payments').select('*').in('order_id', orderIds);
        if (sp) setShiftPayments(sp);
      } else { setShiftPayments([]); }
      // Delivery payments from shift
      const { data: dp } = await supabase.from('delivery_payments').select('*').gte('created_at', shiftSince);
      if (dp) setShiftDelivPayments(dp); else setShiftDelivPayments([]);
      if (hist) setHistorial(hist);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fmt = (p: number) => '$' + Math.round(p).toLocaleString('es-CL');

  // Normalize payments: payments table uses tip_amount (number), delivery_payments uses is_tip (boolean)
  const normalizedPayments = shiftPayments.map((p: any) => ({ ...p, _isTip: (p.tip_amount || 0) > 0 && p.amount === 0 }));
  const normalizedDelivPayments = shiftDelivPayments.map((p: any) => ({ ...p, _isTip: !!p.is_tip }));
  const allPayments = [...normalizedPayments, ...normalizedDelivPayments];

  const sumByMethod = (method: string, isTip: boolean) =>
    allPayments.filter(p => p.method === method && p._isTip === isTip).reduce((a, p) => a + (isTip && p.tip_amount ? p.tip_amount : p.amount), 0);

  const payByMethod = {
    efectivo: sumByMethod('efectivo', false),
    debito: sumByMethod('debito', false),
    credito: sumByMethod('credito', false),
    transferencia: sumByMethod('transferencia', false),
  };
  const tipsByMethod = {
    efectivo: sumByMethod('efectivo', true),
    debito: sumByMethod('debito', true),
    credito: sumByMethod('credito', true),
    transferencia: sumByMethod('transferencia', true),
  };
  const totals = {
    efectivo: payByMethod.efectivo + tipsByMethod.efectivo,
    debito: payByMethod.debito + tipsByMethod.debito,
    credito: payByMethod.credito + tipsByMethod.credito,
    transferencia: payByMethod.transferencia + tipsByMethod.transferencia,
    ventas: todayOrders.reduce((a, o) => a + (o.total || 0), 0),
    propinas: Object.values(tipsByMethod).reduce((a, v) => a + v, 0),
    gastos: movements.filter(m => m.type === 'gasto').reduce((a, m) => a + m.amount, 0),
    ingresos: movements.filter(m => m.type === 'ingreso').reduce((a, m) => a + m.amount, 0),
  };
  const totalIngresos = totals.efectivo + totals.debito + totals.credito + totals.transferencia;
  const saldoActual = (cashRegister?.opening_amount || 0) + totals.efectivo + totals.ingresos - totals.gastos;

  const handleOpen = async () => {
    if (!user) return;

    // Validar que no haya un arqueo abierto
    if (cashRegister) { Alert.alert('Error', 'Ya hay un arqueo abierto. Ciérralo antes de abrir uno nuevo.'); return; }

    // Validar que la fecha/hora no sea anterior al último cierre
    const openDateTime = new Date(openFecha + 'T' + openHora + ':00');
    if (historial.length > 0) {
      const lastClose = new Date(historial[0].closed_at);
      if (openDateTime <= lastClose) {
        Alert.alert('Error', 'La fecha/hora de apertura debe ser posterior al último cierre (' + lastClose.toLocaleString('es-CL') + ')');
        return;
      }
    }

    const { data, error } = await supabase.from('cash_registers').insert({ opened_by: user.id, opening_amount: parseInt(openingAmount) || 0, opened_at: openDateTime.toISOString() }).select().single();
    if (error) { Alert.alert('Error', error.message); return; }
    setCashRegister(data); setOpenModal(false); setOpeningAmount(''); setOpenFecha(new Date().toISOString().split('T')[0]); setOpenHora(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }));
    Alert.alert('✅ Arqueo iniciado'); await loadData();
  };

  const handleClose = async () => {
    if (!cashRegister || !user) return;
    const userTotal = (parseInt(cEfectivo)||0) + (parseInt(cDebito)||0) + (parseInt(cCredito)||0) + (parseInt(cTransferencia)||0);
    await supabase.from('cash_registers').update({
      closed_at: new Date().toISOString(), closed_by: user.id,
      closing_amount: userTotal,
      total_cash: totals.efectivo,
      total_debit: totals.debito,
      total_credit: totals.credito,
      total_transfer: totals.transferencia,
      total_sales: totals.ventas,
      total_tips: totals.propinas,
      total_orders: todayOrders.length, total_expenses: totals.gastos, total_cash_in: totals.ingresos,
      notes: cNotas || null,
    }).eq('id', cashRegister.id);
    setCashRegister(null); setCloseModal(false);
    setCEfectivo(''); setCDebito(''); setCCredito(''); setCTransferencia(''); setCNotas('');
    Alert.alert('✅ Arqueo cerrado'); await loadData();
  };

  const openArqueoDetail = async (arqueo: any) => {
    setDetailArqueo(arqueo);
    // Buscar órdenes cerradas en el rango del arqueo
    const { data: ords } = await supabase.from('orders')
      .select('*, table:table_id(number), waiter:created_by(name), order_items(*, product:products(name))')
      .eq('status', 'cerrada')
      .gte('closed_at', arqueo.opened_at)
      .lte('closed_at', arqueo.closed_at)
      .order('closed_at', { ascending: true });
    setDetailOrders(ords || []);
    // Pagos de esas órdenes
    const orderIds = (ords || []).map((o: any) => o.id);
    if (orderIds.length > 0) {
      const { data: pays } = await supabase.from('payments').select('*').in('order_id', orderIds);
      setDetailPayments(pays || []);
    } else setDetailPayments([]);
    // Movimientos del arqueo
    const { data: movs } = await supabase.from('cash_movements').select('*, users:created_by(name)').eq('cash_register_id', arqueo.id).order('created_at');
    setDetailMovs(movs || []);
  };

  const handleMov = async () => {
    if (!cashRegister || !user) return;
    const amt = parseInt(movAmount);
    if (!amt || amt <= 0 || !movDesc.trim()) { Alert.alert('Error', 'Monto y descripción requeridos'); return; }
    await supabase.from('cash_movements').insert({ cash_register_id: cashRegister.id, type: movType, amount: amt, description: movDesc.trim(), created_by: user.id });
    setMovModal(false); setMovAmount(''); setMovDesc('');
    await loadData();
  };

  const delMov = (id: string) => Alert.alert('Eliminar', '¿Seguro?', [{ text: 'No' }, { text: 'Sí', style: 'destructive', onPress: async () => { await supabase.from('cash_movements').delete().eq('id', id); await loadData(); } }]);

  const openEditArqueo = (arqueo: any) => {
    setEditArqueo(arqueo);
    const oa = new Date(arqueo.opened_at);
    setEditFecha(oa.toLocaleDateString('en-CA'));
    setEditHora(oa.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }));
    setEditMonto(String(arqueo.opening_amount || 0));
    if (arqueo.closed_at) {
      const ca = new Date(arqueo.closed_at);
      setEditCloseFecha(ca.toLocaleDateString('en-CA'));
      setEditCloseHora(ca.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }));
      setEditCloseMonto(String(arqueo.closing_amount || 0));
    } else {
      setEditCloseFecha(''); setEditCloseHora(''); setEditCloseMonto('');
    }
    setEditNotas(arqueo.notes || '');
    setEditModal(true);
  };

  const saveEditArqueo = async () => {
    if (!editArqueo) return;
    const openDT = new Date(editFecha + 'T' + editHora + ':00');
    const update: any = {
      opened_at: openDT.toISOString(),
      opening_amount: parseInt(editMonto) || 0,
      notes: editNotas.trim() || null,
    };
    if (editArqueo.closed_at && editCloseFecha && editCloseHora) {
      const closeDT = new Date(editCloseFecha + 'T' + editCloseHora + ':00');
      update.closed_at = closeDT.toISOString();
      update.closing_amount = parseInt(editCloseMonto) || 0;
    }
    const { error } = await supabase.from('cash_registers').update(update).eq('id', editArqueo.id);
    if (error) { Alert.alert('Error', error.message); return; }
    setEditModal(false); setEditArqueo(null);
    Alert.alert('✅ Arqueo actualizado');
    await loadData();
  };

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.textMuted }}>Cargando...</Text></View>;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
      {/* Header with button */}
      <View style={s.arqueoHdr}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>Cajas</Text>
        {!cashRegister ? (
          <TouchableOpacity style={s.newArqueoBtn} onPress={() => setOpenModal(true)}>
            <Text style={s.newArqueoBtnT}>+ Nuevo arqueo de caja</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[s.fChip, { backgroundColor: COLORS.info + '15', borderColor: COLORS.info + '40' }]} onPress={() => openEditArqueo(cashRegister)}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.info }}>✏️ Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.fChip, s.fChipA]} onPress={() => { setMovType('gasto'); setMovAmount(''); setMovDesc(''); setMovModal(true); }}>
              <Text style={s.fChipTA}>📤 Egreso</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.fChip, { backgroundColor: COLORS.success, borderColor: COLORS.success }]} onPress={() => { setMovType('ingreso'); setMovAmount(''); setMovDesc(''); setMovModal(true); }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>📥 Ingreso</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.fChip, { backgroundColor: COLORS.error, borderColor: COLORS.error }]} onPress={() => { setCEfectivo(''); setCNotas(''); setCloseModal(true); }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>Cerrar Caja</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Summary cards like Fudo */}
      <View style={s.summaryRow}>
        <SumCard label="Arqueo de Caja" value={cashRegister ? 'Abierto' : 'Cerrado'} sub={cashRegister ? `Desde ${new Date(cashRegister.opened_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : 'Abre uno para dar seguimiento'} />
        <SumCard label="Saldo actual" value={fmt(saldoActual)} />
        <SumCard label="Total de ventas" value={fmt(totals.ventas)} />
        <SumCard label="Ingresos" value={fmt(totals.ingresos)} />
        <SumCard label="Egresos" value={fmt(totals.gastos)} />
      </View>

      {/* Movements list if caja open */}
      {cashRegister && movements.length > 0 && (<>
        <Text style={[s.secT, { paddingHorizontal: 16 }]}>Movimientos del turno</Text>
        {movements.map(m => (
          <View key={m.id} style={s.movRow}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>{m.type === 'gasto' ? '📤' : '📥'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{m.description}</Text>
              <Text style={{ fontSize: 11, color: COLORS.textMuted }}>
                {new Date(m.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                {m.users?.name ? ` • ${m.users.name}` : ''}
              </Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: m.type === 'gasto' ? COLORS.error : COLORS.success }}>
              {m.type === 'gasto' ? '-' : '+'}{fmt(m.amount)}
            </Text>
            <TouchableOpacity onPress={() => delMov(m.id)} style={{ padding: 6, marginLeft: 6 }}><Text>🗑</Text></TouchableOpacity>
          </View>
        ))}
      </>)}

      {/* Historial table like Fudo */}
      <Text style={[s.secT, { paddingHorizontal: 16 }]}>Historial de Arqueos</Text>

      {/* Table header */}
      <View style={s.tblHdr}>
        <Text style={[s.tblH, { width: 140 }]}>Apertura / Cierre</Text>
        <Text style={[s.tblH, { width: 100, textAlign: 'right' }]}>$ Sistema</Text>
        <Text style={[s.tblH, { width: 100, textAlign: 'right' }]}>$ Usuario</Text>
        <Text style={[s.tblH, { width: 90, textAlign: 'right' }]}>Diferencia</Text>
        <Text style={[s.tblH, { width: 70 }]}>Estado</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View>
          {historial.map((h, i) => {
            const sysTotal = (h.opening_amount || 0) + (h.total_cash || 0) + (h.total_debit || 0) + (h.total_credit || 0) + (h.total_transfer || 0) + (h.total_cash_in || 0) - (h.total_expenses || 0);
            const diff = (h.closing_amount || 0) - sysTotal;
            return (
              <TouchableOpacity key={h.id} style={[s.tblRow, i % 2 === 0 && { backgroundColor: COLORS.card }]} onPress={() => openArqueoDetail(h)}>
                <View style={{ width: 140 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.primary }}>
                    {new Date(h.opened_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>
                    {h.closed_at ? new Date(h.closed_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </Text>
                </View>
                <Text style={[s.tblC, { width: 100, textAlign: 'right', fontWeight: '600' }]}>{fmt(sysTotal)}</Text>
                <Text style={[s.tblC, { width: 100, textAlign: 'right' }]}>{fmt(h.closing_amount || 0)}</Text>
                <View style={{ width: 90, alignItems: 'flex-end', justifyContent: 'center' }}>
                  {diff === 0 ? (
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text }}>$0</Text>
                  ) : (
                    <View style={{ backgroundColor: diff > 0 ? COLORS.success + '20' : COLORS.error + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: diff > 0 ? COLORS.success + '40' : COLORS.error + '40' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: diff > 0 ? COLORS.success : COLORS.error }}>{diff > 0 ? '+' : ''}{fmt(diff)}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={() => openEditArqueo(h)} style={{ width: 35, alignItems: 'center' }}><Text style={{ fontSize: 14 }}>✏️</Text></TouchableOpacity>
                <Text style={[s.tblC, { width: 35, fontSize: 11 }]}>→</Text>
              </TouchableOpacity>
            );
          })}
          {historial.length === 0 && <View style={{ padding: 20 }}><Text style={{ color: COLORS.textMuted }}>Sin arqueos cerrados</Text></View>}
        </View>
      </ScrollView>

      {/* MODAL: Abrir Caja */}
      <Modal visible={openModal} transparent animationType="fade">
        <View style={s.ov}><View style={s.md}>
          <Text style={[s.mdT, { color: COLORS.primary }]}>NUEVO ARQUEO DE CAJA</Text>
          <Text style={s.lb}>Fecha (AAAA-MM-DD)</Text>
          <TextInput style={s.inp} value={openFecha} onChangeText={setOpenFecha} placeholder="2026-03-28" placeholderTextColor={COLORS.textMuted} />
          <Text style={s.lb}>Hora (HH:MM)</Text>
          <TextInput style={s.inp} value={openHora} onChangeText={setOpenHora} placeholder="17:00" placeholderTextColor={COLORS.textMuted} />
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, marginBottom: 4 }}>
            <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: COLORS.primary + '15', borderWidth: 1, borderColor: COLORS.primary + '40' }} onPress={() => { setOpenFecha(new Date().toISOString().split('T')[0]); setOpenHora(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })); }}><Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.primary }}>Ahora</Text></TouchableOpacity>
            <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }} onPress={() => { setOpenFecha(new Date().toISOString().split('T')[0]); setOpenHora('17:00'); }}><Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Hoy 17:00</Text></TouchableOpacity>
            <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }} onPress={() => { const d = new Date(); d.setDate(d.getDate() - 1); setOpenFecha(d.toISOString().split('T')[0]); setOpenHora('17:00'); }}><Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Ayer 17:00</Text></TouchableOpacity>
          </View>
          <Text style={s.lb}>Monto Inicial *</Text>
          <TextInput style={s.inp} placeholder="$0" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" value={openingAmount} onChangeText={setOpeningAmount} autoFocus />
          <View style={s.mBs}>
            <TouchableOpacity style={s.bC} onPress={() => setOpenModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={[s.bOk, { backgroundColor: COLORS.primary }]} onPress={handleOpen}><Text style={s.bOkT}>Iniciar Arqueo</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* MODAL: Movimiento */}
      <Modal visible={movModal} transparent animationType="fade">
        <View style={s.ov}><View style={s.md}>
          <Text style={s.mdT}>{movType === 'gasto' ? '📤 Egreso' : '📥 Ingreso'}</Text>
          <Text style={s.lb}>Monto</Text>
          <TextInput style={[s.inp, { fontSize: 24, textAlign: 'center', fontWeight: '800' }]} placeholder="0" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" value={movAmount} onChangeText={setMovAmount} autoFocus />
          {movType === 'gasto' && (<>
            <Text style={s.lb}>Motivo</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {['Insumos', 'Gas', 'Limpieza', 'Propina staff', 'Uber/Taxi', 'Emergencia'].map(m => (
                <TouchableOpacity key={m} onPress={() => setMovDesc(m)} style={[s.fChip, movDesc === m && s.fChipA]}>
                  <Text style={[s.fChipT, movDesc === m && s.fChipTA]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>)}
          <Text style={s.lb}>Descripción</Text>
          <TextInput style={s.inp} placeholder="Detalle..." placeholderTextColor={COLORS.textMuted} value={movDesc} onChangeText={setMovDesc} />
          <View style={s.mBs}>
            <TouchableOpacity style={s.bC} onPress={() => setMovModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={[s.bOk, { backgroundColor: movType === 'gasto' ? COLORS.error : COLORS.success }]} onPress={handleMov}><Text style={s.bOkT}>Registrar</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* MODAL: Cerrar Caja - Fudo style */}
      <Modal visible={closeModal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={[s.md, { maxWidth: 560 }]}>
            <Text style={[s.mdT, { color: COLORS.primary }]}>ARQUEO DE CAJA</Text>
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 }}>
              Apertura: {cashRegister ? new Date(cashRegister.opened_at).toLocaleString('es-CL') : '-'}
            </Text>

            {/* TIMELINE - órdenes del turno */}
            <View style={{ backgroundColor: COLORS.background, borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border, maxHeight: 180 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1, marginBottom: 8 }}>VENTAS DEL TURNO ({todayOrders.length})</Text>
              <ScrollView style={{ maxHeight: 140 }}>
                {todayOrders.map((o: any, i: number) => (
                  <View key={o.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: i < todayOrders.length-1 ? 1 : 0, borderBottomColor: COLORS.border }}>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, width: 50 }}>
                      {new Date(o.closed_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={{ fontSize: 11, color: COLORS.text, flex: 1 }}>
                      {o._type === 'delivery' ? '🛵 Delivery' : '🪑 Mesa ' + (o.table_number || '?')} #{o.order_number || '-'}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.primary }}>{fmt(o.total || 0)}</Text>
                  </View>
                ))}
                {todayOrders.length === 0 && <Text style={{ fontSize: 11, color: COLORS.textMuted, textAlign: 'center' }}>Sin ventas en este turno</Text>}
              </ScrollView>
            </View>

            {/* SEGÚN SISTEMA */}
            <View style={{ backgroundColor: COLORS.cardHover, borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff', marginBottom: 10, backgroundColor: COLORS.textMuted, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, overflow: 'hidden' }}>SEGÚN SISTEMA</Text>

              <ARQ label="MONTO INICIAL (efectivo)" val={fmt(cashRegister?.opening_amount || 0)} bold />

              <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 6, paddingTop: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 4 }}>VENTAS POR MÉTODO</Text>
                <ARQ label="    Efectivo" val={fmt(payByMethod.efectivo)} />
                <ARQ label="    Tarj. Débito" val={fmt(payByMethod.debito)} />
                <ARQ label="    Tarj. Crédito" val={fmt(payByMethod.credito)} />
                <ARQ label="    Transferencia" val={fmt(payByMethod.transferencia)} />
                <ARQ label="TOTAL VENTAS" val={fmt(payByMethod.efectivo + payByMethod.debito + payByMethod.credito + payByMethod.transferencia)} bold />
              </View>

              {totals.propinas > 0 && (
                <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 6, paddingTop: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 4 }}>PROPINAS POR MÉTODO</Text>
                  {tipsByMethod.efectivo > 0 && <ARQ label="    Efectivo" val={fmt(tipsByMethod.efectivo)} />}
                  {tipsByMethod.debito > 0 && <ARQ label="    Tarj. Débito" val={fmt(tipsByMethod.debito)} />}
                  {tipsByMethod.credito > 0 && <ARQ label="    Tarj. Crédito" val={fmt(tipsByMethod.credito)} />}
                  {tipsByMethod.transferencia > 0 && <ARQ label="    Transferencia" val={fmt(tipsByMethod.transferencia)} />}
                  <ARQ label="TOTAL PROPINAS" val={fmt(totals.propinas)} bold />
                </View>
              )}

              {(totals.ingresos > 0 || totals.gastos > 0) && (
                <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 6, paddingTop: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 4 }}>MOVIMIENTOS</Text>
                  {totals.ingresos > 0 && <ARQ label="    📥 Ingresos" val={'+' + fmt(totals.ingresos)} />}
                  {totals.gastos > 0 && <ARQ label="    📤 Egresos" val={'-' + fmt(totals.gastos)} />}
                </View>
              )}

              <View style={{ borderTopWidth: 2, borderTopColor: COLORS.primary, marginTop: 8, paddingTop: 8 }}>
                <ARQ label="EFECTIVO EN CAJA" val={fmt(saldoActual)} bold />
                <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                  Inicial ({fmt(cashRegister?.opening_amount || 0)}) + Efectivo ({fmt(totals.efectivo)}) + Propinas efvo. ({fmt(tipsByMethod.efectivo)}) + Ingresos ({fmt(totals.ingresos)}) - Egresos ({fmt(totals.gastos)})
                </Text>
              </View>
              <View style={{ marginTop: 6 }}>
                <ARQ label="TARJETAS + TRANSF." val={fmt(totals.debito + totals.credito + totals.transferencia)} bold />
              </View>
              <View style={{ borderTopWidth: 2, borderTopColor: COLORS.warning, marginTop: 8, paddingTop: 8 }}>
                <ARQ label="TOTAL GENERAL" val={fmt(totalIngresos + totals.ingresos - totals.gastos)} bold />
              </View>
            </View>

            {/* SEGÚN USUARIO */}
            <View style={{ backgroundColor: COLORS.cardHover, borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff', marginBottom: 10, backgroundColor: COLORS.textMuted, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, overflow: 'hidden' }}>SEGÚN USUARIO</Text>
              
              <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4 }}>Efectivo contado</Text>
              <TextInput style={[s.inp, { fontSize: 18, fontWeight: '700', marginBottom: 8 }]} placeholder="$0" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" value={cEfectivo} onChangeText={setCEfectivo} />
              
              <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4 }}>Tarj. Débito</Text>
              <TextInput style={[s.inp, { fontSize: 18, fontWeight: '700', marginBottom: 8 }]} placeholder="$0" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" value={cDebito} onChangeText={setCDebito} />
              
              <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4 }}>Tarj. Crédito</Text>
              <TextInput style={[s.inp, { fontSize: 18, fontWeight: '700', marginBottom: 8 }]} placeholder="$0" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" value={cCredito} onChangeText={setCCredito} />
              
              <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4 }}>Transferencia</Text>
              <TextInput style={[s.inp, { fontSize: 18, fontWeight: '700', marginBottom: 8 }]} placeholder="$0" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" value={cTransferencia} onChangeText={setCTransferencia} />

              <View style={{ borderTopWidth: 2, borderTopColor: COLORS.primary, marginTop: 4, paddingTop: 8 }}>
                <ARQ label="Total usuario" val={fmt((parseInt(cEfectivo)||0) + (parseInt(cDebito)||0) + (parseInt(cCredito)||0) + (parseInt(cTransferencia)||0))} bold />
              </View>
            </View>

            {/* DIFERENCIA */}
            {(() => {
              const sysTotal = totalIngresos + totals.ingresos - totals.gastos;
              const userTotal = (parseInt(cEfectivo)||0) + (parseInt(cDebito)||0) + (parseInt(cCredito)||0) + (parseInt(cTransferencia)||0);
              const diff = userTotal - sysTotal;
              const hasInput = cEfectivo || cDebito || cCredito || cTransferencia;
              if (!hasInput) return null;
              return (
                <View style={{ backgroundColor: (diff === 0 ? COLORS.success : diff > 0 ? '#8BC34A' : COLORS.error) + '20', borderRadius: 10, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: (diff === 0 ? COLORS.success : diff > 0 ? '#8BC34A' : COLORS.error) + '40' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: diff === 0 ? COLORS.success : COLORS.error }}>Diferencia</Text>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: diff === 0 ? COLORS.success : diff > 0 ? '#8BC34A' : COLORS.error }}>
                      {diff === 0 ? '✅ $0' : (diff > 0 ? '+' : '') + fmt(diff)}
                    </Text>
                  </View>
                  {diff !== 0 && (
                    <View style={{ marginTop: 8 }}>
                      {(() => {
                        const dEf = (parseInt(cEfectivo)||0) - (totals.efectivo + (cashRegister?.opening_amount||0) + totals.ingresos - totals.gastos);
                        const dDe = (parseInt(cDebito)||0) - totals.debito;
                        const dCr = (parseInt(cCredito)||0) - totals.credito;
                        const dTr = (parseInt(cTransferencia)||0) - totals.transferencia;
                        return <>
                          {dEf !== 0 && <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Efectivo: {dEf > 0 ? '+' : ''}{fmt(dEf)}</Text>}
                          {dDe !== 0 && <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Débito: {dDe > 0 ? '+' : ''}{fmt(dDe)}</Text>}
                          {dCr !== 0 && <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Crédito: {dCr > 0 ? '+' : ''}{fmt(dCr)}</Text>}
                          {dTr !== 0 && <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Transferencia: {dTr > 0 ? '+' : ''}{fmt(dTr)}</Text>}
                        </>;
                      })()}
                    </View>
                  )}
                </View>
              );
            })()}

            <Text style={s.lb}>Notas</Text>
            <TextInput style={[s.inp, { minHeight: 50 }]} placeholder="Observaciones..." placeholderTextColor={COLORS.textMuted} multiline value={cNotas} onChangeText={setCNotas} />

            <View style={[s.mBs, { marginTop: 20 }]}>
              <TouchableOpacity style={s.bC} onPress={() => setCloseModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[s.bOk, { backgroundColor: COLORS.error }]} onPress={handleClose}><Text style={s.bOkT}>Cerrar Caja</Text></TouchableOpacity>
            </View>
          </View>
        </ScrollView></View>
      </Modal>

      {/* MODAL: Editar Arqueo */}
      <Modal visible={editModal} transparent animationType="fade">
        <View style={s.ov}><View style={s.md}>
          <Text style={[s.mdT, { color: COLORS.info }]}>✏️ EDITAR ARQUEO</Text>
          <Text style={s.lb}>Fecha apertura</Text>
          <TextInput style={s.inp} value={editFecha} onChangeText={setEditFecha} placeholder="2026-04-01" placeholderTextColor={COLORS.textMuted} />
          <Text style={s.lb}>Hora apertura</Text>
          <TextInput style={s.inp} value={editHora} onChangeText={setEditHora} placeholder="17:00" placeholderTextColor={COLORS.textMuted} />
          <Text style={s.lb}>Monto inicial</Text>
          <TextInput style={s.inp} value={editMonto} onChangeText={setEditMonto} placeholder="0" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" />
          {editArqueo?.closed_at && (<>
            <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, marginVertical: 10, paddingTop: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>DATOS DE CIERRE</Text>
            </View>
            <Text style={s.lb}>Fecha cierre</Text>
            <TextInput style={s.inp} value={editCloseFecha} onChangeText={setEditCloseFecha} placeholder="2026-04-01" placeholderTextColor={COLORS.textMuted} />
            <Text style={s.lb}>Hora cierre</Text>
            <TextInput style={s.inp} value={editCloseHora} onChangeText={setEditCloseHora} placeholder="23:00" placeholderTextColor={COLORS.textMuted} />
            <Text style={s.lb}>Monto cierre (usuario)</Text>
            <TextInput style={s.inp} value={editCloseMonto} onChangeText={setEditCloseMonto} placeholder="0" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" />
          </>)}
          <Text style={s.lb}>Notas</Text>
          <TextInput style={[s.inp, { minHeight: 50 }]} value={editNotas} onChangeText={setEditNotas} placeholder="Notas opcionales..." placeholderTextColor={COLORS.textMuted} multiline />
          <View style={s.mBs}>
            <TouchableOpacity style={s.bC} onPress={() => { setEditModal(false); setEditArqueo(null); }}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={[s.bOk, { backgroundColor: COLORS.info }]} onPress={saveEditArqueo}><Text style={s.bOkT}>Guardar cambios</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* MODAL: Detalle Arqueo Cerrado */}
      <Modal visible={!!detailArqueo} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}><View style={[s.md, { maxWidth: 700, width: '95%', maxHeight: '90%' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={s.mdT}>Detalle Arqueo</Text>
            <TouchableOpacity onPress={() => setDetailArqueo(null)}><Text style={{ fontSize: 20, color: COLORS.textMuted }}>✕</Text></TouchableOpacity>
          </View>

          {detailArqueo && (<>
            <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
              <View style={{ backgroundColor: COLORS.background, borderRadius: 8, padding: 10, flex: 1, minWidth: 140 }}>
                <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Apertura</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{new Date(detailArqueo.opened_at).toLocaleString('es-CL')}</Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>{detailArqueo.opener?.name || '-'} • Fondo: {fmt(detailArqueo.opening_amount || 0)}</Text>
              </View>
              <View style={{ backgroundColor: COLORS.background, borderRadius: 8, padding: 10, flex: 1, minWidth: 140 }}>
                <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Cierre</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{new Date(detailArqueo.closed_at).toLocaleString('es-CL')}</Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>{detailArqueo.closer?.name || '-'} • Conteo: {fmt(detailArqueo.closing_amount || 0)}</Text>
              </View>
              <View style={{ backgroundColor: COLORS.background, borderRadius: 8, padding: 10, flex: 1, minWidth: 140 }}>
                <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Resumen</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary }}>{fmt(detailArqueo.total_sales || 0)} ventas • {detailArqueo.total_orders || 0} ordenes</Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Propinas: {fmt(detailArqueo.total_tips || 0)}</Text>
              </View>
            </View>

            <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 6 }}>Ventas por Mesa ({detailOrders.length})</Text>
            <View style={{ backgroundColor: COLORS.background, borderRadius: 8, maxHeight: 300 }}>
              <ScrollView>
                {detailOrders.map((o: any, i: number) => {
                  const orderPays = detailPayments.filter((p: any) => p.order_id === o.id);
                  const payMethod = orderPays.length > 0 ? orderPays.map((p: any) => p.method).join(', ') : o.payment_method || '-';
                  const tipTotal = orderPays.reduce((a: number, p: any) => a + (p.tip_amount || 0), 0);
                  return (
                    <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: i % 2 === 0 ? 'transparent' : COLORS.card }}>
                      <View style={{ width: 50 }}><Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.primary }}>#{o.table?.number || '?'}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: COLORS.text }} numberOfLines={2}>{(o.order_items || []).map((it: any) => it.quantity + 'x ' + (it.product?.name || '?')).join(', ')}</Text>
                        <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{o.waiter?.name || '-'} • {new Date(o.closed_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} • {payMethod}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', minWidth: 80 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>{fmt(o.total || 0)}</Text>
                        {tipTotal > 0 && <Text style={{ fontSize: 10, color: COLORS.success }}>+{fmt(tipTotal)} propina</Text>}
                      </View>
                    </View>
                  );
                })}
                {detailOrders.length === 0 && <Text style={{ padding: 16, color: COLORS.textMuted }}>Sin ventas en este arqueo</Text>}
              </ScrollView>
            </View>

            {detailMovs.length > 0 && (<>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 12, marginBottom: 6 }}>Movimientos ({detailMovs.length})</Text>
              <View style={{ backgroundColor: COLORS.background, borderRadius: 8 }}>
                {detailMovs.map((m: any) => (
                  <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                    <Text style={{ fontSize: 14, marginRight: 8 }}>{m.type === 'gasto' ? '🔴' : '🟢'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: COLORS.text }}>{m.description}</Text>
                      <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{m.users?.name || '-'} • {new Date(m.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: m.type === 'gasto' ? COLORS.error : COLORS.success }}>{m.type === 'gasto' ? '-' : '+'}{fmt(m.amount)}</Text>
                  </View>
                ))}
              </View>
            </>)}

            {detailArqueo.notes && (
              <View style={{ backgroundColor: COLORS.warning + '15', borderRadius: 8, padding: 10, marginTop: 12 }}>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Notas: {detailArqueo.notes}</Text>
              </View>
            )}
          </>)}
        </View></ScrollView></View>
      </Modal>
    </ScrollView>
  );
}

// =====================================================
// ANULACIONES TAB
// =====================================================
function AnulacionesTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [period, setPeriod] = useState<'diario' | 'semanal' | 'mensual'>('diario');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => { loadUsers(); }, []);
  useEffect(() => { load(); }, [period, date]);

  const loadUsers = async () => { const { data } = await supabase.from('users').select('id,name').order('name'); if (data) setUsers(data); };
  const waiterName = (id: string) => users.find((u: any) => u.id === id)?.name || '-';
  const fmt = (p: number) => '$' + Math.round(p).toLocaleString('es-CL');

  const toChileISO = (ds: string) => { const l = new Date(ds + 'T00:00:00'); const om = l.getTimezoneOffset(); const sg = om <= 0 ? '+' : '-'; const ao = Math.abs(om); return ds + 'T00:00:00' + sg + String(Math.floor(ao/60)).padStart(2,'0') + ':' + String(ao%60).padStart(2,'0'); };
  const addDays = (ds: string, n: number) => { const x = new Date(ds + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };

  const load = async () => {
    let since: string, until: string;
    const d = new Date(date + 'T12:00:00');
    if (period === 'diario') { since = toChileISO(date); until = toChileISO(addDays(date, 1)); }
    else if (period === 'semanal') { const st = new Date(d); st.setDate(st.getDate() - st.getDay()); const ss = st.toLocaleDateString('en-CA'); since = toChileISO(ss); until = toChileISO(addDays(ss, 7)); }
    else { const ss = date.substring(0,7) + '-01'; const en = new Date(d.getFullYear(), d.getMonth() + 1, 1); since = toChileISO(ss); until = toChileISO(en.toLocaleDateString('en-CA')); }

    const { data } = await supabase.from('order_logs').select('*').eq('action', 'item_anulado').gte('created_at', since).lt('created_at', until).order('created_at', { ascending: false });
    setLogs(data || []);
  };

  const changeDate = (dir: number) => {
    const d = new Date(date + 'T12:00:00');
    if (period === 'diario') d.setDate(d.getDate() + dir);
    else if (period === 'semanal') d.setDate(d.getDate() + (dir * 7));
    else d.setMonth(d.getMonth() + dir);
    setDate(d.toLocaleDateString('en-CA'));
  };

  const totalAnulado = logs.reduce((a, l) => a + (l.details?.total_price || 0), 0);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={s.filterBar}>
        <View style={s.filterRow}>
          {(['diario', 'semanal', 'mensual'] as const).map(p => (
            <TouchableOpacity key={p} style={[s.fChip, period === p && s.fChipA]} onPress={() => setPeriod(p)}>
              <Text style={[s.fChipT, period === p && s.fChipTA]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.dateNav}>
          <TouchableOpacity onPress={() => changeDate(-1)} style={s.dateBtn}><Text style={s.dateBtnT}>◀</Text></TouchableOpacity>
          <Text style={s.dateLabel}>{new Date(date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
          <TouchableOpacity onPress={() => changeDate(1)} style={s.dateBtn}><Text style={s.dateBtnT}>▶</Text></TouchableOpacity>
        </View>
      </View>

      <View style={s.summaryRow}>
        <SumCard label="Anulaciones" value={String(logs.length)} />
        <SumCard label="Total anulado" value={fmt(totalAnulado)} highlight />
      </View>

      {logs.map((l, i) => (
        <View key={l.id || i} style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: i % 2 === 0 ? COLORS.card : 'transparent', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.error + '15', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14 }}>🗑</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{l.details?.quantity || 1}x {l.details?.product_name || '?'}</Text>
            <Text style={{ fontSize: 11, color: COLORS.textMuted }}>
              {l.created_at ? new Date(l.created_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'} · {waiterName(l.user_id)}
            </Text>
            {l.details?.motivo && <Text style={{ fontSize: 11, color: COLORS.error, marginTop: 2 }}>Motivo: {l.details.motivo}</Text>}
          </View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.error }}>{fmt(l.details?.total_price || 0)}</Text>
        </View>
      ))}
      {logs.length === 0 && <View style={{ padding: 30 }}><Text style={{ color: COLORS.textMuted, textAlign: 'center' }}>Sin anulaciones en este período</Text></View>}
    </ScrollView>
  );
}

// =====================================================
// PROPINAS TAB
// =====================================================
function PropinasTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [period, setPeriod] = useState<'diario' | 'semanal' | 'mensual'>('diario');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => { loadUsers(); }, []);
  useEffect(() => { load(); }, [period, date]);

  const loadUsers = async () => { const { data } = await supabase.from('users').select('id,name').order('name'); if (data) setUsers(data); };
  const waiterName = (id: string) => users.find((u: any) => u.id === id)?.name || '-';
  const fmt = (p: number) => '$' + Math.round(p).toLocaleString('es-CL');

  const toChileISO = (ds: string) => { const l = new Date(ds + 'T00:00:00'); const om = l.getTimezoneOffset(); const sg = om <= 0 ? '+' : '-'; const ao = Math.abs(om); return ds + 'T00:00:00' + sg + String(Math.floor(ao/60)).padStart(2,'0') + ':' + String(ao%60).padStart(2,'0'); };
  const addDays = (ds: string, n: number) => { const x = new Date(ds + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };

  const load = async () => {
    let since: string, until: string;
    const d = new Date(date + 'T12:00:00');
    if (period === 'diario') { since = toChileISO(date); until = toChileISO(addDays(date, 1)); }
    else if (period === 'semanal') { const st = new Date(d); st.setDate(st.getDate() - st.getDay()); const ss = st.toLocaleDateString('en-CA'); since = toChileISO(ss); until = toChileISO(addDays(ss, 7)); }
    else { const ss = date.substring(0,7) + '-01'; const en = new Date(d.getFullYear(), d.getMonth() + 1, 1); since = toChileISO(ss); until = toChileISO(en.toLocaleDateString('en-CA')); }

    const { data: mesaData } = await supabase.from('orders').select('id,table_id,waiter_id,tip_amount,closed_at,table:table_id(number)').eq('status', 'cerrada').gte('closed_at', since).lt('closed_at', until).gt('tip_amount', 0).order('closed_at', { ascending: false });
    setOrders(mesaData || []);

    const ids = (mesaData || []).map((o: any) => o.id);
    if (ids.length > 0) {
      const { data: pays } = await supabase.from('payments').select('*').in('order_id', ids).gt('tip_amount', 0);
      setPayments(pays || []);
    } else setPayments([]);
  };

  const changeDate = (dir: number) => {
    const d = new Date(date + 'T12:00:00');
    if (period === 'diario') d.setDate(d.getDate() + dir);
    else if (period === 'semanal') d.setDate(d.getDate() + (dir * 7));
    else d.setMonth(d.getMonth() + dir);
    setDate(d.toLocaleDateString('en-CA'));
  };

  const totalPropinas = orders.reduce((a: number, o: any) => a + (o.tip_amount || 0), 0);

  // By waiter
  const byWaiter: Record<string, number> = {};
  orders.forEach((o: any) => { byWaiter[o.waiter_id] = (byWaiter[o.waiter_id] || 0) + (o.tip_amount || 0); });

  // By method
  const byMethod: Record<string, number> = {};
  payments.forEach((p: any) => { byMethod[p.method] = (byMethod[p.method] || 0) + (p.tip_amount || 0); });

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={s.filterBar}>
        <View style={s.filterRow}>
          {(['diario', 'semanal', 'mensual'] as const).map(p => (
            <TouchableOpacity key={p} style={[s.fChip, period === p && s.fChipA]} onPress={() => setPeriod(p)}>
              <Text style={[s.fChipT, period === p && s.fChipTA]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.dateNav}>
          <TouchableOpacity onPress={() => changeDate(-1)} style={s.dateBtn}><Text style={s.dateBtnT}>◀</Text></TouchableOpacity>
          <Text style={s.dateLabel}>{new Date(date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
          <TouchableOpacity onPress={() => changeDate(1)} style={s.dateBtn}><Text style={s.dateBtnT}>▶</Text></TouchableOpacity>
        </View>
      </View>

      <View style={s.summaryRow}>
        <SumCard label="Propinas" value={String(orders.length)} />
        <SumCard label="Total propinas" value={fmt(totalPropinas)} highlight />
      </View>

      {/* By waiter */}
      {Object.keys(byWaiter).length > 0 && (
        <View style={{ margin: 16, backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>POR GARZÓN</Text>
          {Object.entries(byWaiter).sort((a, b) => b[1] - a[1]).map(([wid, amount]) => (
            <View key={wid} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <Text style={{ fontSize: 13, color: COLORS.text }}>👤 {waiterName(wid)}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.warning }}>{fmt(amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* By method */}
      {Object.keys(byMethod).length > 0 && (
        <View style={{ marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>POR MEDIO DE PAGO</Text>
          {Object.entries(byMethod).map(([method, amount]) => (
            <View key={method} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <Text style={{ fontSize: 13, color: COLORS.text, textTransform: 'capitalize' }}>{method === 'efectivo' ? '💵' : method === 'transferencia' ? '📱' : '💳'} {method}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.warning }}>{fmt(amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Detail list */}
      <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, margin: 16, marginBottom: 8 }}>DETALLE</Text>
      {orders.map((o: any, i: number) => (
        <View key={o.id} style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: i % 2 === 0 ? COLORS.card : 'transparent', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.warning + '15', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14 }}>🤝</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>Mesa {o.table?.number || '-'}</Text>
            <Text style={{ fontSize: 11, color: COLORS.textMuted }}>
              {o.closed_at ? new Date(o.closed_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'} · {waiterName(o.waiter_id)}
            </Text>
          </View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.warning }}>{fmt(o.tip_amount)}</Text>
        </View>
      ))}
      {orders.length === 0 && <View style={{ padding: 30 }}><Text style={{ color: COLORS.textMuted, textAlign: 'center' }}>Sin propinas en este período</Text></View>}
    </ScrollView>
  );
}

// =====================================================
// SHARED COMPONENTS
// =====================================================
function SumCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <View style={{ minWidth: 100, padding: 8 }}>
      <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: highlight ? 20 : 16, fontWeight: '800', color: highlight ? COLORS.primary : COLORS.text, marginTop: 2 }}>{value}</Text>
      {sub && <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{sub}</Text>}
    </View>
  );
}

function ARQ({ label, val, bold }: { label: string; val: string; bold?: boolean }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
    <Text style={{ fontSize: 13, color: bold ? COLORS.text : COLORS.textSecondary, fontWeight: bold ? '700' : '400' }}>{label}</Text>
    <Text style={{ fontSize: 13, fontWeight: bold ? '800' : '600', color: bold ? COLORS.primary : COLORS.text }}>{val}</Text>
  </View>;
}

// =====================================================
// STYLES
// =====================================================
const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background },
  hdr: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  hdrT: { fontSize: 22, fontWeight: '800', color: COLORS.text },

  tabBar: { flexDirection: 'row', backgroundColor: COLORS.card, borderBottomWidth: 2, borderBottomColor: COLORS.border, paddingHorizontal: 16, flexGrow: 0, flexShrink: 0 },
  tabItem: { paddingVertical: 8, paddingHorizontal: 14, borderBottomWidth: 3, borderBottomColor: 'transparent', marginBottom: -2 },
  tabItemA: { borderBottomColor: COLORS.primary },
  tabItemT: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  tabItemTA: { color: COLORS.text, fontWeight: '700' },

  filterBar: { backgroundColor: COLORS.card, padding: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 6, flexShrink: 0 },
  filterRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  fChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  fChipA: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  fChipT: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary },
  fChipTA: { color: '#fff', fontWeight: '600' },

  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  dateBtn: { width: 32, height: 32, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  dateBtnT: { fontSize: 14, color: COLORS.textSecondary },
  dateLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },

  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexShrink: 0 },

  tblHdr: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tblH: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase' },
  tblRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' },
  tblC: { fontSize: 12, color: COLORS.text },

  secT: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginTop: 20, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  arqueoHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  newArqueoBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  newArqueoBtnT: { fontSize: 13, fontWeight: '600', color: COLORS.text },

  movRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginHorizontal: 16, marginVertical: 3, borderWidth: 1, borderColor: COLORS.border },

  ov: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' },
  md: { width: '92%' as any, maxWidth: 450, backgroundColor: COLORS.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border },
  mdT: { fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  lb: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginTop: 14 },
  inp: { backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: COLORS.text },
  div: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  mBs: { flexDirection: 'row', gap: 12, marginTop: 20 },
  bC: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  bCT: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },
  bOk: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  bOkT: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
