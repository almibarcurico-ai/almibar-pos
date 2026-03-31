// src/screens/MobileTableScreen.tsx — Fudo-style mobile waiter view
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, StatusBar, Modal, TextInput, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { COLORS, TABLE_STATUS_COLORS } from '../theme';
import { TableWithOrder } from '../types';

interface Sector { id: string; name: string; }

const STATUS_BG: Record<string, string> = {
  libre: '#10B981',
  ocupada: '#EF4444',
  cuenta: '#F59E0B',
  reservada: '#6366F1',
};

const STATUS_LABEL: Record<string, string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  cuenta: 'Cuenta',
  reservada: 'Reservada',
};

interface Props {
  onOpenOrder: (table: TableWithOrder) => void;
  onLogout?: () => void;
}

export default function MobileTableScreen({ onOpenOrder, onLogout }: Props) {
  const { user, logout } = useAuth();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [tables, setTables] = useState<TableWithOrder[]>([]);
  const [activeSector, setActiveSector] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  // Open table modal
  const [openModal, setOpenModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableWithOrder | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerCount, setCustomerCount] = useState('2');
  const [clientSuggestions, setClientSuggestions] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);

  const loadData = useCallback(async () => {
    const [secRes, tabRes] = await Promise.all([
      supabase.from('sectors').select('id, name').eq('active', true).order('sort_order'),
      supabase.from('tables').select('*, order:current_order_id(id, order_number, waiter_id, opened_at, status, total, notes)').eq('active', true).order('number'),
    ]);
    if (secRes.data) setSectors(secRes.data);
    if (tabRes.data) setTables(tabRes.data as any);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const filtered = activeSector === 'all' ? tables : tables.filter(t => t.sector_id === activeSector);

  const stats = {
    total: tables.length,
    libre: tables.filter(t => t.status === 'libre').length,
    ocupada: tables.filter(t => t.status === 'ocupada').length,
    cuenta: tables.filter(t => t.status === 'cuenta').length,
  };

  const handleLogout = async () => { await logout(); };

  const handleTablePress = (table: TableWithOrder) => {
    if (table.status === 'libre') {
      setSelectedTable(table); setCustomerName(''); setCustomerCount('2');
      setSelectedClient(null); setClientSuggestions([]); setOpenModal(true);
    } else {
      onOpenOrder(table);
    }
  };

  const searchClients = async (text: string) => {
    setCustomerName(text); setSelectedClient(null);
    if (text.length < 2) { setClientSuggestions([]); return; }
    const { data } = await supabase.from('clients').select('id, name, phone, total_visits, member_number, notes')
      .or('name.ilike.%' + text + '%,phone.ilike.%' + text + '%,notes.ilike.%' + text + '%').limit(5);
    if (data) setClientSuggestions(data);
  };

  const pickClient = (client: any) => {
    setSelectedClient(client); setCustomerName(client.name); setClientSuggestions([]);
  };

  const handleOpenTable = async () => {
    if (!selectedTable || !user) return;
    try {
      const { data: od, error: oe } = await supabase.from('orders').insert({
        table_id: selectedTable.id, type: 'mesa', status: 'abierta', waiter_id: user.id,
        notes: customerName ? `Cliente: ${customerName}` : null,
        client_id: selectedClient ? selectedClient.id : null,
      }).select().single();
      if (oe) throw oe;
      await supabase.from('tables').update({ status: 'ocupada', current_order_id: od.id }).eq('id', selectedTable.id);
      setOpenModal(false);
      await loadData();
      onOpenOrder({ ...selectedTable, status: 'ocupada', current_order_id: od.id, order: { ...od, waiter_name: user.name, items_count: 0 } } as any);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  if (loading) return <View style={s.loading}><Text style={{ color: COLORS.textMuted }}>Cargando...</Text></View>;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.logo}>ALMÍBAR</Text>
          <Text style={s.role}>🍽️ {user?.name || 'Garzón'}</Text>
        </View>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Text style={s.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      <View style={s.statsBar}>
        <View style={s.stat}><View style={[s.statDot, { backgroundColor: '#10B981' }]} /><Text style={s.statText}>{stats.libre} libres</Text></View>
        <View style={s.stat}><View style={[s.statDot, { backgroundColor: '#EF4444' }]} /><Text style={s.statText}>{stats.ocupada} ocup.</Text></View>
        <View style={s.stat}><View style={[s.statDot, { backgroundColor: '#F59E0B' }]} /><Text style={s.statText}>{stats.cuenta} cuenta</Text></View>
      </View>

      {/* Sector tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={s.tabContent}>
        <TouchableOpacity style={[s.tab, activeSector === 'all' && s.tabActive]} onPress={() => setActiveSector('all')}>
          <Text style={[s.tabText, activeSector === 'all' && s.tabTextActive]}>Todas</Text>
        </TouchableOpacity>
        {sectors.map(sec => (
          <TouchableOpacity key={sec.id} style={[s.tab, activeSector === sec.id && s.tabActive]} onPress={() => setActiveSector(sec.id)}>
            <Text style={[s.tabText, activeSector === sec.id && s.tabTextActive]}>{sec.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Table map grid */}
      <ScrollView
        style={s.grid}
        contentContainerStyle={s.mapContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        <View style={s.mapGrid}>
          {filtered.map(table => {
            const bg = STATUS_BG[table.status] || '#666';
            const isOccupied = table.status === 'ocupada' || table.status === 'cuenta';
            const order = (table as any).order;

            return (
              <TouchableOpacity
                key={table.id}
                style={[s.mapCell, { backgroundColor: bg }]}
                activeOpacity={0.7}
                onPress={() => handleTablePress(table)}
              >
                <Text style={s.mapNum}>{table.number}</Text>
                {isOccupied && order?.total > 0 && (
                  <Text style={s.mapTotal}>${Math.round(order.total / 1000)}k</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {filtered.length === 0 && (
          <Text style={{ color: COLORS.textMuted, textAlign: 'center', padding: 40 }}>Sin mesas en este sector</Text>
        )}
      </ScrollView>
      {/* Open table modal */}
      <Modal visible={openModal} transparent animationType="fade">
        <View style={s.ov}>
          <View style={s.md}>
            <Text style={s.mdTitle}>Abrir Mesa {selectedTable?.number}</Text>
            <Text style={s.mdLabel}>Nombre del cliente</Text>
            <TextInput style={s.mdInput} placeholder="Buscar socio o escribir nombre..." placeholderTextColor={COLORS.textMuted} value={customerName} onChangeText={searchClients} autoFocus />
            {clientSuggestions.length > 0 && (
              <ScrollView style={s.mdSuggestions}>
                {clientSuggestions.map((c: any) => (
                  <TouchableOpacity key={c.id} style={s.mdSugItem} onPress={() => pickClient(c)}>
                    <Text style={s.mdSugName}>{c.name}</Text>
                    <Text style={s.mdSugSub}>{c.phone || ''} {c.member_number ? '· #' + c.member_number : ''}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {selectedClient && (
              <View style={s.mdSelected}>
                <Text style={s.mdSelectedText}>✅ {selectedClient.name} · #{selectedClient.member_number} · {selectedClient.total_visits} visitas</Text>
                <TouchableOpacity onPress={() => { setSelectedClient(null); setCustomerName(''); }}><Text style={{ color: COLORS.error }}>✕</Text></TouchableOpacity>
              </View>
            )}
            <Text style={s.mdLabel}>Personas</Text>
            <View style={s.mdCountRow}>
              {['1','2','3','4','5','6','8','10'].map(n => (
                <TouchableOpacity key={n} style={[s.mdCountBtn, customerCount === n && s.mdCountActive]} onPress={() => setCustomerCount(n)}>
                  <Text style={[s.mdCountText, customerCount === n && { color: '#fff' }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.mdBtns}>
              <TouchableOpacity style={s.mdCancel} onPress={() => setOpenModal(false)}><Text style={s.mdCancelT}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={s.mdOpen} onPress={handleOpenTable}><Text style={s.mdOpenT}>Abrir Mesa</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerLeft: { gap: 2 },
  logo: { fontSize: 18, fontWeight: '900', color: COLORS.primary, letterSpacing: 3 },
  role: { fontSize: 12, color: COLORS.textSecondary },
  logoutBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  logoutText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },

  // Stats
  statsBar: { flexDirection: 'row', justifyContent: 'center', gap: 20, paddingVertical: 10, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },

  // Sector tabs
  tabScroll: { maxHeight: 46, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabContent: { paddingHorizontal: 12, gap: 6, alignItems: 'center', paddingVertical: 6 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.background },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive: { color: '#fff' },

  // Grid
  grid: { flex: 1 },
  mapContent: { padding: 16, paddingBottom: 40 },
  mapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-start' },

  // Map cell (Fudo style squares)
  mapCell: { width: 62, height: 62, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mapNum: { fontSize: 20, fontWeight: '900', color: '#fff' },
  mapTotal: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.8)', marginTop: 1 },

  // Modal
  ov: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  md: { width: '100%', maxWidth: 380, backgroundColor: COLORS.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  mdTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 16 },
  mdLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 6, marginTop: 12 },
  mdInput: { backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text },
  mdSuggestions: { maxHeight: 150, backgroundColor: COLORS.background, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, marginTop: 4 },
  mdSugItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  mdSugName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  mdSugSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  mdSelected: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.primary + '15', borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: COLORS.primary + '40' },
  mdSelectedText: { fontSize: 12, fontWeight: '600', color: COLORS.primary, flex: 1 },
  mdCountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mdCountBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  mdCountActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  mdCountText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  mdBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  mdCancel: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  mdCancelT: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  mdOpen: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  mdOpenT: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
