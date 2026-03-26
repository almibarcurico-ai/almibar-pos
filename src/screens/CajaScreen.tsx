// src/screens/CajaScreen.tsx
// v4 - Fudo-style: Ventas table + Arqueos list

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { COLORS } from '../theme';

const SW = Dimensions.get('window').width;

export default function CajaScreen() {
  const [tab, setTab] = useState<'ventas' | 'arqueos'>('ventas');
  const TABS = [
    { key: 'ventas', label: 'Ventas' },
    { key: 'arqueos', label: 'Arqueos de Caja' },
  ] as const;

  return (
    <View style={s.c}>
      <View style={s.hdr}>
        <Text style={s.hdrT}>💰 Caja</Text>
      </View>
      {/* Tabs bar like Fudo */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tabItem, tab === t.key && s.tabItemA]} onPress={() => setTab(t.key as any)}>
            <Text style={[s.tabItemT, tab === t.key && s.tabItemTA]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === 'ventas' ? <VentasTab /> : <ArqueosTab />}
    </View>
  );
}

// =====================================================
// VENTAS TAB - Fudo style
// =====================================================
function VentasTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [period, setPeriod] = useState<'diario' | 'semanal' | 'mensual'>('diario');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterPago, setFilterPago] = useState('todos');
  const [filterGarzon, setFilterGarzon] = useState('todos');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail modal
  const [detailModal, setDetailModal] = useState(false);
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => { loadUsers(); }, []);
  useEffect(() => { load(); }, [period, date]);

  const loadUsers = async () => {
    const { data } = await supabase.from('users').select('id, name').order('name');
    if (data) setUsers(data);
  };

  const load = async () => {
    setLoading(true);
    let since: string, until: string;
    const d = new Date(date + 'T00:00:00');

    if (period === 'diario') {
      since = date;
      const next = new Date(d); next.setDate(next.getDate() + 1);
      until = next.toISOString().split('T')[0];
    } else if (period === 'semanal') {
      const start = new Date(d); start.setDate(start.getDate() - start.getDay());
      const end = new Date(start); end.setDate(end.getDate() + 7);
      since = start.toISOString().split('T')[0];
      until = end.toISOString().split('T')[0];
    } else {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      since = start.toISOString().split('T')[0];
      until = end.toISOString().split('T')[0];
    }

    const { data } = await supabase.from('orders').select('*').eq('status', 'cerrada').gte('closed_at', since).lt('closed_at', until).order('closed_at', { ascending: false });
    if (data) {
      setOrders(data);
      // Load payments for tip details
      const orderIds = data.map((o: any) => o.id);
      if (orderIds.length > 0) {
        const { data: pays } = await supabase.from('payments').select('*, order:order_id(waiter_id, table_number)').in('order_id', orderIds);
        if (pays) setPayments(pays);
      } else setPayments([]);
    }
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
    const { data } = await supabase.from('order_items').select('*, product:product_id(name)').eq('order_id', order.id).order('created_at');
    setDetailItems(data || []);
    const { data: w } = await supabase.from('users').select('name').eq('id', order.waiter_id).single();
    if (w) setDetailOrder((p: any) => ({ ...p, waiter_name: w.name }));
    setDetailModal(true);
  };

  const changeDate = (dir: number) => {
    const d = new Date(date + 'T12:00:00');
    if (period === 'diario') d.setDate(d.getDate() + dir);
    else if (period === 'semanal') d.setDate(d.getDate() + (dir * 7));
    else d.setMonth(d.getMonth() + dir);
    setDate(d.toISOString().split('T')[0]);
  };

  const dateLabel = () => {
    const d = new Date(date + 'T12:00:00');
    if (period === 'diario') return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    if (period === 'semanal') return `Semana del ${d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`;
    return d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Filter bar */}
      <View style={s.filterBar}>
        {/* Period selector */}
        <View style={s.filterRow}>
          {(['diario', 'semanal', 'mensual'] as const).map(p => (
            <TouchableOpacity key={p} style={[s.fChip, period === p && s.fChipA]} onPress={() => setPeriod(p)}>
              <Text style={[s.fChipT, period === p && s.fChipTA]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* Date nav */}
        <View style={s.dateNav}>
          <TouchableOpacity onPress={() => changeDate(-1)} style={s.dateBtn}><Text style={s.dateBtnT}>◀</Text></TouchableOpacity>
          <Text style={s.dateLabel}>{dateLabel()}</Text>
          <TouchableOpacity onPress={() => changeDate(1)} style={s.dateBtn}><Text style={s.dateBtnT}>▶</Text></TouchableOpacity>
        </View>
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

      {/* Summary bar like Fudo */}
      <View style={s.summaryRow}>
        <SumCard label="Ventas" value={String(totals.ventas)} />
        <SumCard label="Prom. por venta" value={fmt(promVenta)} />
        <SumCard label="Personas" value={String(totals.personas)} />
        <SumCard label="Prom. por persona" value={fmt(promPersona)} />
        <SumCard label="Total" value={fmt(totals.total)} highlight />
        {totals.propinas > 0 && <SumCard label="Propinas" value={fmt(totals.propinas)} />}
      </View>

      {/* Table header */}
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
              <Text style={[s.tblC, { width: 70, color: COLORS.success, fontWeight: '600' }]}>Cerrada</Text>
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
              {detailOrder?.closed_at ? new Date(detailOrder.closed_at).toLocaleString('es-CL') : ''}
              {detailOrder?.waiter_name ? ` • ${detailOrder.waiter_name}` : ''}
            </Text>
            <View style={s.div} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>CONSUMO</Text>
            {detailItems.map(it => (
              <View key={it.id} style={{ flexDirection: 'row', paddingVertical: 3 }}>
                <Text style={{ width: 28, fontSize: 13, fontWeight: '700', color: COLORS.textSecondary }}>{it.quantity}x</Text>
                <Text style={{ flex: 1, fontSize: 13, color: COLORS.text }}>{it.product?.name}</Text>
                {it.notes ? <Text style={{ fontSize: 10, color: COLORS.textMuted }}>📝 {it.notes}</Text> : null}
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text, marginLeft: 8 }}>{fmt(it.total_price)}</Text>
              </View>
            ))}
            <View style={s.div} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: COLORS.textSecondary }}>Subtotal</Text>
              <Text style={{ fontWeight: '600', color: COLORS.text }}>{fmt(detailOrder?.subtotal || 0)}</Text>
            </View>
            {(detailOrder?.tip_amount || 0) > 0 && <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: COLORS.textSecondary }}>Propina</Text>
              <Text style={{ fontWeight: '600', color: COLORS.warning }}>{fmt(detailOrder.tip_amount)}</Text>
            </View>}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 2, borderTopColor: COLORS.primary }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>TOTAL</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary }}>{fmt(detailOrder?.total || 0)}</Text>
            </View>
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 6 }}>Pago: {detailOrder?.payment_method}</Text>
            <TouchableOpacity style={[s.bOk, { marginTop: 16 }]} onPress={() => setDetailModal(false)}><Text style={s.bOkT}>Cerrar</Text></TouchableOpacity>
          </View>
        </ScrollView></View>
      </Modal>
    </ScrollView>
  );
}

// =====================================================
// ARQUEOS TAB - Fudo style
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
  const [closeModal, setCloseModal] = useState(false);
  const [movModal, setMovModal] = useState(false);
  const [movType, setMovType] = useState<'gasto' | 'ingreso'>('gasto');
  const [movAmount, setMovAmount] = useState('');
  const [movDesc, setMovDesc] = useState('');

  // Arqueo conteo
  const [cEfectivo, setCEfectivo] = useState('');
  const [cNotas, setCNotas] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: cajas } = await supabase.from('cash_registers').select('*').gte('opened_at', today).is('closed_at', null).order('opened_at', { ascending: false }).limit(1);
      const caja = cajas?.[0] || null;
      setCashRegister(caja);

      const { data: ords } = await supabase.from('orders').select('*').eq('status', 'cerrada').gte('closed_at', today);
      if (ords) setTodayOrders(ords);

      if (caja) {
        const { data: movs } = await supabase.from('cash_movements').select('*, users:created_by(name)').eq('cash_register_id', caja.id).order('created_at', { ascending: false });
        if (movs) setMovements(movs);
      } else setMovements([]);

      const { data: hist } = await supabase.from('cash_registers').select('*, opener:opened_by(name), closer:closed_by(name)').not('closed_at', 'is', null).order('closed_at', { ascending: false }).limit(30);
      if (hist) setHistorial(hist);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fmt = (p: number) => '$' + Math.round(p).toLocaleString('es-CL');

  const totals = {
    efectivo: todayOrders.filter(o => o.payment_method === 'efectivo').reduce((a, o) => a + o.total, 0),
    ventas: todayOrders.reduce((a, o) => a + (o.total || 0), 0),
    gastos: movements.filter(m => m.type === 'gasto').reduce((a, m) => a + m.amount, 0),
    ingresos: movements.filter(m => m.type === 'ingreso').reduce((a, m) => a + m.amount, 0),
  };
  const saldoActual = (cashRegister?.opening_amount || 0) + totals.efectivo + totals.ingresos - totals.gastos;

  const handleOpen = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('cash_registers').insert({ opened_by: user.id, opening_amount: parseInt(openingAmount) || 0 }).select().single();
    if (error) { Alert.alert('Error', error.message); return; }
    setCashRegister(data); setOpenModal(false); setOpeningAmount('');
    Alert.alert('✅ Arqueo iniciado'); await loadData();
  };

  const handleClose = async () => {
    if (!cashRegister || !user) return;
    await supabase.from('cash_registers').update({
      closed_at: new Date().toISOString(), closed_by: user.id,
      closing_amount: parseInt(cEfectivo) || 0,
      total_cash: totals.efectivo, total_sales: totals.ventas,
      total_orders: todayOrders.length, total_expenses: totals.gastos, total_cash_in: totals.ingresos,
      notes: cNotas || null,
    }).eq('id', cashRegister.id);
    setCashRegister(null); setCloseModal(false); setCEfectivo(''); setCNotas('');
    Alert.alert('✅ Arqueo cerrado'); await loadData();
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

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.textMuted }}>Cargando...</Text></View>;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Header with button */}
      <View style={s.arqueoHdr}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>Cajas</Text>
        {!cashRegister ? (
          <TouchableOpacity style={s.newArqueoBtn} onPress={() => setOpenModal(true)}>
            <Text style={s.newArqueoBtnT}>+ Nuevo arqueo de caja</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
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
            const diff = (h.closing_amount || 0) - ((h.opening_amount || 0) + (h.total_cash || 0) + (h.total_cash_in || 0) - (h.total_expenses || 0));
            return (
              <View key={h.id} style={[s.tblRow, i % 2 === 0 && { backgroundColor: COLORS.card }]}>
                <View style={{ width: 140 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.primary }}>
                    {new Date(h.opened_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>
                    {h.closed_at ? new Date(h.closed_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </Text>
                </View>
                <Text style={[s.tblC, { width: 100, textAlign: 'right', fontWeight: '600' }]}>{fmt(h.total_sales || 0)}</Text>
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
                <Text style={[s.tblC, { width: 70, fontSize: 11 }]}>Cerrado</Text>
              </View>
            );
          })}
          {historial.length === 0 && <View style={{ padding: 20 }}><Text style={{ color: COLORS.textMuted }}>Sin arqueos cerrados</Text></View>}
        </View>
      </ScrollView>

      {/* MODAL: Abrir Caja */}
      <Modal visible={openModal} transparent animationType="fade">
        <View style={s.ov}><View style={s.md}>
          <Text style={[s.mdT, { color: COLORS.primary }]}>NUEVO ARQUEO DE CAJA</Text>
          <Text style={s.lb}>Hora de apertura</Text>
          <Text style={[s.inp, { paddingVertical: 14 }]}>{new Date().toLocaleString('es-CL')}</Text>
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

      {/* MODAL: Cerrar Caja */}
      <Modal visible={closeModal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={[s.md, { maxWidth: 500 }]}>
            <Text style={[s.mdT, { color: COLORS.error }]}>CERRAR ARQUEO</Text>

            <View style={{ marginTop: 16, backgroundColor: COLORS.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>RESUMEN SISTEMA</Text>
              <ARQ label="Apertura" val={fmt(cashRegister?.opening_amount || 0)} />
              <ARQ label="Ventas efectivo" val={fmt(totals.efectivo)} />
              <ARQ label="Ingresos" val={fmt(totals.ingresos)} />
              <ARQ label="Egresos" val={`-${fmt(totals.gastos)}`} />
              <View style={{ borderTopWidth: 2, borderTopColor: COLORS.primary, marginTop: 6, paddingTop: 6 }}>
                <ARQ label="Esperado" val={fmt(saldoActual)} bold />
              </View>
            </View>

            <Text style={s.lb}>Efectivo contado *</Text>
            <TextInput style={[s.inp, { fontSize: 22, fontWeight: '700' }]} placeholder="Contar efectivo..." placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" value={cEfectivo} onChangeText={setCEfectivo} />
            {cEfectivo !== '' && (() => {
              const d = (parseInt(cEfectivo) || 0) - saldoActual;
              return <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: (d === 0 ? COLORS.success : d > 0 ? COLORS.warning : COLORS.error) + '15', borderRadius: 8, padding: 10, marginTop: 6, borderWidth: 1, borderColor: (d === 0 ? COLORS.success : d > 0 ? COLORS.warning : COLORS.error) + '30' }}>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Diferencia</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: d === 0 ? COLORS.success : d > 0 ? COLORS.warning : COLORS.error }}>{d === 0 ? '✅ $0' : (d > 0 ? '+' : '') + fmt(d)}</Text>
              </View>;
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
    </ScrollView>
  );
}

// =====================================================
// SHARED COMPONENTS
// =====================================================
function SumCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 100, padding: 12 }}>
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
  hdr: { paddingHorizontal: 16, paddingTop: 50, paddingBottom: 8, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  hdrT: { fontSize: 22, fontWeight: '800', color: COLORS.text },

  tabBar: { flexDirection: 'row', backgroundColor: COLORS.card, borderBottomWidth: 2, borderBottomColor: COLORS.border, paddingHorizontal: 16 },
  tabItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 3, borderBottomColor: 'transparent', marginBottom: -2 },
  tabItemA: { borderBottomColor: COLORS.primary },
  tabItemT: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  tabItemTA: { color: COLORS.text, fontWeight: '700' },

  filterBar: { backgroundColor: COLORS.card, padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8 },
  filterRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  fChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  fChipA: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  fChipT: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary },
  fChipTA: { color: '#fff', fontWeight: '600' },

  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  dateBtn: { width: 32, height: 32, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  dateBtnT: { fontSize: 14, color: COLORS.textSecondary },
  dateLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },

  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },

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
