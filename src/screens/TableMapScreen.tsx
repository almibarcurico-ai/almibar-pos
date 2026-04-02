// src/screens/TableMapScreen.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, TextInput, Modal, Dimensions, Animated } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Sector, TableWithOrder } from '../types';
import { COLORS } from '../theme';
import TableCard from '../components/TableCard';
import AppOrdersPanel from '../components/AppOrdersPanel';

const { width: SW, height: SH } = Dimensions.get('window');
const CANVAS_H = SH - 320;

interface Props {
  onOpenOrder: (table: TableWithOrder) => void;
  onOpenEditor: () => void;
}

export default function TableMapScreen({ onOpenOrder, onOpenEditor }: Props) {
  const { user, logout } = useAuth();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [tables, setTables] = useState<TableWithOrder[]>([]);
  const [activeSector, setActiveSector] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [openModal, setOpenModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableWithOrder | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerCount, setCustomerCount] = useState('2');
  const [clientSuggestions, setClientSuggestions] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [printServerOk, setPrintServerOk] = useState(true);

  // Registro rápido de socio
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState('');
  const [regRut, setRegRut] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regSaving, setRegSaving] = useState(false);

  // Health check del print server cada 15 segundos
  useEffect(() => {
    const check = () => {
      fetch('http://localhost:3333/status', { signal: AbortSignal.timeout(3000) })
        .then(r => r.json()).then(() => setPrintServerOk(true))
        .catch(() => setPrintServerOk(false));
    };
    check();
    const iv = setInterval(check, 15000);
    return () => clearInterval(iv);
  }, []);

  // Mesas con pedidos pendientes (app cliente o items sin enviar a cocina)
  const [appOrderTables, setAppOrderTables] = useState<number[]>([]);

  useEffect(() => {
    const loadPending = async () => {
      // Solo revisar app_orders con status pendiente
      const { data: appOrders } = await supabase.from('app_orders').select('table_number').eq('status', 'pendiente');
      const tableNums = (appOrders || []).map((o: any) => o.table_number);
      setAppOrderTables([...new Set(tableNums)]);
    };
    loadPending();
    const iv = setInterval(loadPending, 10000);
    return () => clearInterval(iv);
  }, []);

  // El print server se encarga de auto-procesar items de la app y notificaciones.
  // Este efecto solo mantiene la UI actualizada cuando hay cambios.

  const searchClients = async (text: string) => {
    setCustomerName(text);
    setSelectedClient(null);
    if (text.length < 2) { setClientSuggestions([]); return; }
    const { data } = await supabase.from('clients').select('id, name, phone, total_visits, total_spent, member_number, notes').or('name.ilike.%' + text + '%,phone.ilike.%' + text + '%,notes.ilike.%' + text + '%').limit(5);
    if (data) setClientSuggestions(data);
  };

  const pickClient = (client: any) => {
    setSelectedClient(client);
    setCustomerName(client.name);
    setClientSuggestions([]);
    setShowRegister(false);
  };

  const openRegisterForm = () => {
    setShowRegister(true);
    setRegName(customerName);
    setRegRut('');
    setRegPhone('');
    setClientSuggestions([]);
  };

  const formatRut = (value: string) => {
    let clean = value.replace(/[^0-9kK]/g, '');
    if (clean.length > 9) clean = clean.slice(0, 9);
    if (clean.length <= 1) return clean;
    const dv = clean.slice(-1);
    const body = clean.slice(0, -1);
    const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return formatted + '-' + dv;
  };

  const registerClient = async () => {
    if (!regName.trim()) { Alert.alert('', 'Ingresa el nombre'); return; }
    if (!regRut.trim()) { Alert.alert('', 'Ingresa el RUT'); return; }
    if (!regPhone.trim()) { Alert.alert('', 'Ingresa el celular'); return; }
    setRegSaving(true);
    try {
      // Verificar si ya existe por RUT o teléfono
      const { data: existing } = await supabase.from('clients')
        .select('id, name, member_number')
        .or('notes.ilike.%' + regRut.trim() + '%,phone.eq.' + regPhone.trim())
        .limit(1);
      if (existing && existing.length > 0) {
        Alert.alert('Socio ya existe', existing[0].name + ' (Socio #' + existing[0].member_number + ') ya está registrado con ese RUT o celular.');
        setRegSaving(false);
        return;
      }
      const { data, error } = await supabase.from('clients').insert({
        name: regName.trim(),
        phone: regPhone.trim(),
        notes: 'RUT: ' + regRut.trim(),
        tags: ['pos'],
      }).select('*').single();
      if (error) throw error;
      pickClient(data);
      setShowRegister(false);
      Alert.alert('✅ Socio registrado', regName.trim() + ' es ahora Socio #' + data.member_number);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setRegSaving(false);
  };

  useEffect(() => { loadData(); const c = setupRT(); return c; }, []);

  const loadData = async () => {
    const { data: sd } = await supabase.from('sectors').select('*').eq('active', true).order('sort_order');
    if (sd && sd.length > 0) { setSectors(sd); if (!activeSector) setActiveSector(sd[0].id); }
    await loadTables();
    setLoading(false);
  };

  const loadTables = async () => {
    const { data: td } = await supabase.from('tables').select('*').eq('active', true).order('number');
    if (!td) return;
    const openIds = td.filter((t: any) => t.current_order_id).map((t: any) => t.current_order_id);
    let om: Record<string, any> = {};
    if (openIds.length > 0) {
      const { data: od } = await supabase.from('orders').select('*').in('id', openIds);
      if (od) {
        const wids = [...new Set(od.map((o: any) => o.waiter_id))];
        const { data: ws } = await supabase.from('users').select('id, name').in('id', wids);
        const wm: Record<string, string> = {};
        if (ws) ws.forEach((w: any) => { wm[w.id] = w.name; });
        od.forEach((o: any) => {
          let displayName = wm[o.waiter_id] || '';
          // Si es pedido desde app, mostrar nombre del cliente
          if (o.waiter_id === 'a0000000-0000-0000-0000-000000000099' && o.notes) {
            const match = o.notes.match(/Cliente:\s*([^|(]+)/);
            if (match) displayName = match[1].replace(/\(pedido.*\)/g,'').trim();
          }
          om[o.id] = { ...o, waiter_name: displayName };
        });
      }
    }
    setTables(td.map((t: any) => ({ ...t, order: t.current_order_id ? om[t.current_order_id] : undefined })));
  };

  const setupRT = () => {
    const ch = supabase.channel('map-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => loadTables())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadTables())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  };

  const onRefresh = useCallback(async () => { setRefreshing(true); await loadTables(); setRefreshing(false); }, []);

  const sectorTables = tables.filter(t => t.sector_id === activeSector);
  const stats = {
    total: tables.length,
    libre: tables.filter(t => t.status === 'libre').length,
    ocupada: tables.filter(t => t.status === 'ocupada').length,
    cuenta: tables.filter(t => t.status === 'cuenta').length,
  };

  const handleTablePress = (table: TableWithOrder) => {
    if (table.status === 'libre') {
      setSelectedTable(table); setCustomerName(''); setCustomerCount('2'); setSelectedClient(null); setClientSuggestions([]); setShowRegister(false); setOpenModal(true);
    } else {
      onOpenOrder(table);
    }
  };

  const handleTableLongPress = (table: TableWithOrder) => {
    if (table.status !== 'libre') {
      handleFreeTable(table);
    }
  };

  const handleOpenTable = async () => {
    if (!selectedTable || !user) return;
    if (!customerName.trim()) { Alert.alert('', 'Ingresa el nombre del cliente'); return; }
    try {
      const { data: od, error: oe } = await supabase.from('orders').insert({ table_id: selectedTable.id, type: 'mesa', status: 'abierta', waiter_id: user.id, notes: customerName ? `Cliente: ${customerName}` : null, client_id: selectedClient ? selectedClient.id : null, personas: parseInt(customerCount) || 1, tipo_venta: 'mesa' }).select().single();
      if (oe) throw oe;
      await supabase.from('tables').update({ status: 'ocupada', current_order_id: od.id }).eq('id', selectedTable.id);
      await supabase.from('order_logs').insert({ order_id: od.id, action: 'table_opened', details: { table_number: selectedTable.number, customer_name: customerName, waiter: user.name }, user_id: user.id });
      setOpenModal(false);
      await loadTables();
      onOpenOrder({ ...selectedTable, status: 'ocupada', current_order_id: od.id, order: { ...od, waiter_name: user.name, items_count: 0 } });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleFreeTable = async (table: TableWithOrder) => {
    Alert.alert(
      'Liberar Mesa ' + table.number,
      '¿Cerrar y liberar esta mesa? Si hay consumo sin pagar, se marcará como anulada.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Liberar', style: 'destructive', onPress: async () => {
          try {
            if (table.current_order_id) {
              // Verificar si tiene items
              const { data: items } = await supabase.from('order_items').select('id').eq('order_id', table.current_order_id).limit(1);
              // Verificar si tiene pagos
              const { data: pays } = await supabase.from('payments').select('id').eq('order_id', table.current_order_id).limit(1);
              if (items && items.length > 0 && (!pays || pays.length === 0)) {
                // Tiene consumo sin pago → anular
                await supabase.from('orders').update({ status: 'anulada', closed_at: new Date().toISOString() }).eq('id', table.current_order_id);
              } else {
                // Sin consumo o ya pagado → cerrar normal
                await supabase.from('orders').update({ status: 'cerrada', closed_at: new Date().toISOString() }).eq('id', table.current_order_id);
              }
            }
            await supabase.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', table.id);
            await loadTables();
          } catch (e: any) { Alert.alert('Error', e.message); }
        }},
      ]
    );
  };

  if (loading) return <View style={[s.c, s.center]}><Text style={{ color: COLORS.textSecondary }}>Cargando...</Text></View>;

  return (
    <View style={s.c}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.hTitle}>ALMÍBAR POS</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.hUser}>{user?.name} • {user?.role.toUpperCase()}</Text>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: printServerOk ? '#4CAF50' : '#F44336' }} />
            {!printServerOk && <Text style={{ fontSize: 10, color: '#F44336', fontWeight: '700' }}>SIN IMPRESORA</Text>}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {user?.role === 'admin' && (
            <TouchableOpacity onPress={onOpenEditor} style={s.editBtn}><Text style={s.editBtnT}>✏️ Editar</Text></TouchableOpacity>
          )}
          <TouchableOpacity onPress={logout} style={s.logoutBtn}><Text style={s.logoutT}>Salir</Text></TouchableOpacity>
        </View>
      </View>

      {/* Stats */}
      <View style={s.stats}>
        <SB label="Total" count={stats.total} color={COLORS.textSecondary} />
        <SB label="Libres" count={stats.libre} color={COLORS.tableLibre} />
        <SB label="Ocupadas" count={stats.ocupada} color={COLORS.tableOcupada} />
        <SB label="Cuenta" count={stats.cuenta} color={COLORS.tableCuenta} />
      </View>

      {/* Sectors */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.sectorBar} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        {sectors.map(sec => (
          <TouchableOpacity key={sec.id} style={[s.sTab, activeSector === sec.id && s.sTabA]} onPress={() => setActiveSector(sec.id)}>
            <Text style={[s.sTabT, activeSector === sec.id && s.sTabTA]}>{sec.name} ({tables.filter(t => t.sector_id === sec.id).length})</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Canvas — grid automático */}
      <ScrollView style={s.canvasScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
        <View style={[s.canvas, { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 8 }]}>
          {sectorTables.map(t => <TableCard key={t.id} table={t} onPress={handleTablePress} onLongPress={handleTableLongPress} hasAppOrder={appOrderTables.includes(t.number)} />)}
          {sectorTables.length === 0 && <View style={s.emptyWrap}><Text style={s.emptyT}>No hay mesas en este sector</Text></View>}
        </View>
      </ScrollView>

      {/* Notificaciones pedidos app */}
      <AppOrdersPanel />

      {/* Indicador de pedidos app pendientes */}
      {appOrderTables.length > 0 && (
        <View style={{ position: 'absolute', top: 100, right: 16, backgroundColor: '#FF6B00', borderRadius: 12, padding: 12, zIndex: 100, borderWidth: 2, borderColor: '#FFD700' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>📱 {appOrderTables.length} pedido{appOrderTables.length > 1 ? 's' : ''} pendiente{appOrderTables.length > 1 ? 's' : ''}</Text>
          <Text style={{ color: '#FFD700', fontWeight: '700', fontSize: 12 }}>Mesa{appOrderTables.length > 1 ? 's' : ''}: {appOrderTables.join(', ')}</Text>
          <Text style={{ color: '#ffffffaa', fontSize: 10, marginTop: 2 }}>Toca la mesa para confirmar</Text>
        </View>
      )}

      {/* Modal */}
      <Modal visible={openModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Abrir Mesa {selectedTable?.number}</Text>

            {!showRegister ? (
              <>
                {/* ── Buscar socio ── */}
                <Text style={s.label}>Buscar socio</Text>
                <TextInput style={s.input} placeholder="Nombre, teléfono o RUT..." placeholderTextColor={COLORS.textMuted} value={customerName} onChangeText={searchClients} />
                {clientSuggestions.length > 0 && (
                  <View style={{ backgroundColor: COLORS.card, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, maxHeight: 150 }}>
                    <ScrollView nestedScrollEnabled>
                      {clientSuggestions.map((c: any) => (
                        <TouchableOpacity key={c.id} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} onPress={() => pickClient(c)}>
                          <View>
                            <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '600' }}>{c.name}</Text>
                            <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>{c.phone || ''} · Socio #{c.member_number}</Text>
                          </View>
                          <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '600' }}>{c.total_visits} visitas</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
                {selectedClient && (
                  <View style={{ backgroundColor: COLORS.primary + '15', borderRadius: 8, padding: 8, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '600' }}>✅ Socio: {selectedClient.name} (#{selectedClient.member_number})</Text>
                    <TouchableOpacity onPress={() => { setSelectedClient(null); setCustomerName(''); }}><Text style={{ color: COLORS.error, fontSize: 12 }}>✕</Text></TouchableOpacity>
                  </View>
                )}
                {/* ── Botón "No está inscrito" ── */}
                <TouchableOpacity style={{ borderWidth: 1, borderColor: COLORS.warning, borderRadius: 8, padding: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.warning + '10' }} onPress={openRegisterForm}>
                  <Text style={{ fontSize: 14 }}>👤</Text>
                  <Text style={{ color: COLORS.warning, fontSize: 13, fontWeight: '700' }}>No está inscrito — Registrar socio</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* ── Formulario de registro ── */}
                <View style={{ backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.primary + '40', borderRadius: 10, padding: 12, marginBottom: 8, gap: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary }}>📋 Registrar nuevo socio</Text>
                  <View>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 3 }}>Nombre *</Text>
                    <TextInput style={s.input} value={regName} onChangeText={setRegName} placeholder="Nombre completo" placeholderTextColor={COLORS.textMuted} autoFocus />
                  </View>
                  <View>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 3 }}>RUT *</Text>
                    <TextInput style={s.input} value={regRut} onChangeText={(t) => setRegRut(formatRut(t))} placeholder="12.345.678-9" placeholderTextColor={COLORS.textMuted} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 3 }}>Celular *</Text>
                    <TextInput style={s.input} value={regPhone} onChangeText={setRegPhone} placeholder="+56 9 1234 5678" placeholderTextColor={COLORS.textMuted} keyboardType="phone-pad" />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <TouchableOpacity style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }} onPress={() => setShowRegister(false)}>
                      <Text style={{ color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' }}>Volver a buscar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center', opacity: regSaving ? 0.5 : 1 }} onPress={registerClient} disabled={regSaving}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{regSaving ? 'Guardando...' : 'Registrar socio'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}

            <Text style={s.label}>Cantidad de personas</Text>
            <TextInput style={s.input} placeholder="2" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" value={customerCount} onChangeText={setCustomerCount} />
            <View style={s.mBtns}>
              <TouchableOpacity style={s.mCancel} onPress={() => setOpenModal(false)}><Text style={s.mCancelT}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={s.mConfirm} onPress={handleOpenTable}><Text style={s.mConfirmT}>Abrir Mesa</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SB({ label, count, color }: { label: string; count: number; color: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /><Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{count}</Text><Text style={{ fontSize: 11, color: COLORS.textSecondary }}>{label}</Text></View>;
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  // Fudo: sub-nav bar below main tabs
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  hTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, letterSpacing: 0 },
  hUser: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  editBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  editBtnT: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600' },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border },
  logoutT: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  // Fudo: stats bar
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  // Fudo: sector tabs (Terraza, Patio, SALON, DELIVERY)
  sectorBar: { maxHeight: 46 },
  sTab: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 0, backgroundColor: 'transparent', borderWidth: 0, borderBottomWidth: 2, borderBottomColor: 'transparent', marginRight: 0 },
  sTabA: { backgroundColor: 'transparent', borderBottomColor: COLORS.primary },
  sTabT: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  sTabTA: { color: COLORS.text, fontWeight: '700' },
  // Fudo: table canvas
  canvasScroll: { flex: 1, margin: 0, padding: 16 },
  canvas: { position: 'relative', backgroundColor: 'transparent', borderRadius: 0, borderWidth: 0, borderColor: 'transparent', overflow: 'visible' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  emptyT: { color: COLORS.textMuted, fontSize: 15 },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  modal: { width: SW * 0.85, maxWidth: 420, backgroundColor: COLORS.card, borderRadius: 12, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 16 },
  label: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4, marginTop: 8, fontWeight: '500' },
  input: { backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text },
  mBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  mCancel: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  mCancelT: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
  mConfirm: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center' },
  mConfirmT: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
