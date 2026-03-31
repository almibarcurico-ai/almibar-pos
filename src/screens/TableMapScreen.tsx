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

  // Alerta de pedidos nuevos desde app de clientes — Realtime en app_orders
  const [pendingAlerts, setPendingAlerts] = useState<{ id: string; table: number; customer: string; total: number; time: string }[]>([]);
  const alertPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Cargar pendientes existentes al iniciar
    const loadExisting = async () => {
      const { data } = await supabase.from('app_orders').select('*').eq('status', 'pendiente').order('created_at', { ascending: false });
      if (data && data.length > 0) {
        setPendingAlerts(data.map((o: any) => ({
          id: o.id,
          table: o.table_number,
          customer: o.customer_name || 'Cliente',
          total: o.total || 0,
          time: new Date(o.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        })));
      }
    };
    loadExisting();

    // Realtime: escuchar nuevos pedidos de clientes
    const ch = supabase.channel('alert-app-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_orders' }, (payload: any) => {
        const o = payload.new;
        if (o.status === 'pendiente') {
          setPendingAlerts(prev => [{
            id: o.id,
            table: o.table_number,
            customer: o.customer_name || 'Cliente',
            total: o.total || 0,
            time: new Date(o.created_at || Date.now()).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
          }, ...prev]);
          // Sonido fuerte
          playAlertSound();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_orders' }, (payload: any) => {
        const o = payload.new;
        if (o.status !== 'pendiente') {
          setPendingAlerts(prev => prev.filter(a => a.id !== o.id));
        }
      })
      .subscribe();

    // Polling de respaldo cada 5s por si Realtime falla
    const iv = setInterval(loadExisting, 5000);

    return () => { supabase.removeChannel(ch); clearInterval(iv); };
  }, []);

  const playAlertSound = () => {
    try {
      if (typeof window === 'undefined') return;
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Alarma fuerte: 5 beeps ascendentes repetidos 2 veces
      [0, 0.12, 0.24, 0.36, 0.48, 0.7, 0.82, 0.94, 1.06, 1.18].forEach((d, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 660 + (i % 5) * 110; o.type = 'square';
        g.gain.setValueAtTime(0.25, ctx.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.1);
        o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.1);
      });
    } catch {}
  };

  useEffect(() => {
    if (pendingAlerts.length === 0) return;
    playAlertSound();
    const soundIv = setInterval(playAlertSound, 5000); // repetir sonido cada 5s
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(alertPulse, { toValue: 1.08, duration: 400, useNativeDriver: true }),
        Animated.timing(alertPulse, { toValue: 0.92, duration: 400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => { loop.stop(); clearInterval(soundIv); };
  }, [pendingAlerts.length > 0]);

  const dismissAlert = async (id: string) => {
    setPendingAlerts(prev => prev.filter(a => a.id !== id));
  };

  const fmt = (p: number) => '$' + Math.round(p).toLocaleString('es-CL');

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
      setSelectedTable(table); setCustomerName(''); setCustomerCount('2'); setSelectedClient(null); setClientSuggestions([]); setOpenModal(true);
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
      const { data: od, error: oe } = await supabase.from('orders').insert({ table_id: selectedTable.id, type: 'mesa', status: 'abierta', waiter_id: user.id, notes: customerName ? `Cliente: ${customerName}` : null, client_id: selectedClient ? selectedClient.id : null }).select().single();
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
      '¿Cerrar y liberar esta mesa?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Liberar', style: 'destructive', onPress: async () => {
          try {
            if (table.current_order_id) {
              await supabase.from('orders').update({ status: 'cerrada', closed_at: new Date().toISOString() }).eq('id', table.current_order_id);
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
          {sectorTables.map(t => <TableCard key={t.id} table={t} onPress={handleTablePress} onLongPress={handleTableLongPress} />)}
          {sectorTables.length === 0 && <View style={s.emptyWrap}><Text style={s.emptyT}>No hay mesas en este sector</Text></View>}
        </View>
      </ScrollView>

      {/* Notificaciones pedidos app */}
      <AppOrdersPanel />

      {/* Alertas de pedidos de clientes — bloquea pantalla */}
      {pendingAlerts.length > 0 && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 998, justifyContent: 'center', alignItems: 'center' }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            {pendingAlerts.map((alert, idx) => (
              <Animated.View key={alert.id} style={{
                transform: [{ scale: idx === 0 ? alertPulse : 1 }],
                width: 400, backgroundColor: '#FF6B00', borderRadius: 24, padding: 28,
                alignItems: 'center', marginBottom: 16,
                shadowColor: '#FF6B00', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.6, shadowRadius: 20,
                borderWidth: 4, borderColor: '#FFD700',
              }}>
                <Text style={{ fontSize: 60 }}>📱</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFD700', letterSpacing: 3, marginTop: 8 }}>PEDIDO DESDE APP</Text>
                <Text style={{ fontSize: 48, fontWeight: '900', color: '#fff', marginTop: 4 }}>Mesa {alert.table}</Text>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, padding: 14, marginTop: 12, width: '100%' }}>
                  <Text style={{ fontSize: 18, color: '#fff', fontWeight: '700', textAlign: 'center' }}>👤 {alert.customer}</Text>
                  <Text style={{ fontSize: 24, color: '#FFD700', fontWeight: '900', textAlign: 'center', marginTop: 4 }}>{fmt(alert.total)}</Text>
                </View>
                <Text style={{ fontSize: 13, color: '#ffffffaa', marginTop: 8 }}>{alert.time}</Text>
                <TouchableOpacity onPress={() => dismissAlert(alert.id)} style={{ backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 40, paddingVertical: 16, marginTop: 16, width: '100%', alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#FF6B00' }}>VER PEDIDO</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Modal */}
      <Modal visible={openModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Abrir Mesa {selectedTable?.number}</Text>
            <Text style={s.label}>Nombre del cliente (opcional)</Text>
            <TextInput style={s.input} placeholder="Buscar socio o escribir nombre..." placeholderTextColor={COLORS.textMuted} value={customerName} onChangeText={searchClients} />
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  hTitle: { fontSize: 20, fontWeight: '800', color: COLORS.primary, letterSpacing: 2 },
  hUser: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.primaryDark },
  editBtnT: { color: COLORS.text, fontSize: 12, fontWeight: '600' },
  logoutBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  logoutT: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sectorBar: { maxHeight: 52 },
  sTab: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  sTabA: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sTabT: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  sTabTA: { color: COLORS.text },
  canvasScroll: { flex: 1, margin: 16 },
  canvas: { position: 'relative', backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  emptyT: { color: COLORS.textMuted, fontSize: 15 },
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' },
  modal: { width: SW * 0.85, maxWidth: 400, backgroundColor: COLORS.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border },
  modalTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 20 },
  label: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: COLORS.text },
  mBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  mCancel: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  mCancelT: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },
  mConfirm: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  mConfirmT: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
});
