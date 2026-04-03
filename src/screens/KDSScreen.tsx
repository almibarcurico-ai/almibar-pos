// src/screens/KDSScreen.tsx — Kitchen/Bar Display System
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { COLORS } from '../theme';

interface Props {
  user: { id: string; name: string; role: string };
}

interface KDSOrder {
  orderId: string;
  orderNumber: number;
  tableNumber: number;
  waiterName: string;
  openedAt: string;
  items: KDSItem[];
}

interface KDSItem {
  id: string;
  productName: string;
  quantity: number;
  notes: string | null;
  status: string;
  printed: boolean;
  createdAt: string;
  categoryId: string;
  modifiers: string[];
}

const STATUS_COLORS: Record<string, string> = {
  pendiente: '#F59E0B',
  preparando: '#3B82F6',
  listo: '#10B981',
};

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'PENDIENTE',
  preparando: 'PREPARANDO',
  listo: 'LISTO',
};

const NEXT_STATUS: Record<string, string> = {
  pendiente: 'preparando',
  preparando: 'listo',
};

const COCINA_PRINTER_ID = '0a1b1623-835c-454f-a3cc-f21072e681a5';

export default function KDSScreen({ user }: Props) {
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [stationFilter, setStationFilter] = useState<'all' | 'cocina' | 'barra'>(
    user.role === 'cocina' ? 'cocina' : user.role === 'barra' ? 'barra' : 'all'
  );
  const [cochinaCategoryIds, setCocinaCategoryIds] = useState<Set<string>>(new Set());
  const [showListo, setShowListo] = useState(false);

  const loadCategoryMappings = useCallback(async () => {
    const { data: cp } = await supabase.from('category_printer').select('category_id, printer_id');
    if (cp) {
      const cocinaIds = new Set<string>();
      cp.forEach((m: any) => {
        if (m.printer_id === COCINA_PRINTER_ID) cocinaIds.add(m.category_id);
      });
      setCocinaCategoryIds(cocinaIds);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    const statuses = showListo ? ['pendiente', 'preparando', 'listo'] : ['pendiente', 'preparando'];
    const { data: items } = await supabase
      .from('order_items')
      .select('*, product:product_id(name, category_id), order:order_id(id, order_number, table_id, waiter_id), item_modifiers:order_item_modifiers(option_name)')
      .in('status', statuses)
      .eq('printed', true)
      .order('created_at');

    if (!items || items.length === 0) { setOrders([]); return; }

    // Get table numbers and waiter names
    const tableIds = [...new Set(items.map((i: any) => i.order?.table_id).filter(Boolean))];
    const waiterIds = [...new Set(items.map((i: any) => i.order?.waiter_id).filter(Boolean))];

    const [{ data: tables }, { data: waiters }] = await Promise.all([
      tableIds.length > 0 ? supabase.from('tables').select('id, number').in('id', tableIds) : { data: [] },
      waiterIds.length > 0 ? supabase.from('users').select('id, name').in('id', waiterIds) : { data: [] },
    ]);

    const tableMap: Record<string, number> = {};
    (tables || []).forEach((t: any) => { tableMap[t.id] = t.number; });
    const waiterMap: Record<string, string> = {};
    (waiters || []).forEach((w: any) => { waiterMap[w.id] = w.name; });

    // Filter by station
    const filtered = items.filter((i: any) => {
      if (!i.product || !i.order) return false;
      if (stationFilter === 'all') return true;
      const isCocina = cochinaCategoryIds.has(i.product.category_id);
      return stationFilter === 'cocina' ? isCocina : !isCocina;
    });

    // Group by order
    const orderMap = new Map<string, KDSOrder>();
    filtered.forEach((i: any) => {
      const oid = i.order.id;
      if (!orderMap.has(oid)) {
        orderMap.set(oid, {
          orderId: oid,
          orderNumber: i.order.order_number,
          tableNumber: tableMap[i.order.table_id] || 0,
          waiterName: waiterMap[i.order.waiter_id] || '',
          openedAt: i.created_at,
          items: [],
        });
      }
      orderMap.get(oid)!.items.push({
        id: i.id,
        productName: i.product.name,
        quantity: i.quantity,
        notes: i.notes,
        status: i.status,
        printed: i.printed,
        createdAt: i.created_at,
        categoryId: i.product.category_id,
        modifiers: (i.item_modifiers || []).map((m: any) => m.option_name),
      });
    });

    // Sort by oldest first
    const sorted = Array.from(orderMap.values()).sort((a, b) =>
      new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime()
    );
    setOrders(sorted);
  }, [stationFilter, cochinaCategoryIds, showListo]);

  useEffect(() => { loadCategoryMappings(); }, []);
  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Realtime subscription
  useEffect(() => {
    const ch = supabase
      .channel('kds-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadOrders]);

  // Auto-refresh every 10s
  useEffect(() => {
    const iv = setInterval(loadOrders, 10000);
    return () => clearInterval(iv);
  }, [loadOrders]);

  const updateStatus = async (itemId: string, newStatus: string) => {
    await supabase.from('order_items').update({ status: newStatus }).eq('id', itemId);
    // Optimistic update
    setOrders(prev => prev.map(o => ({
      ...o,
      items: o.items.map(i => i.id === itemId ? { ...i, status: newStatus } : i),
    })).filter(o => o.items.some(i => showListo || i.status !== 'listo')));
  };

  const markAllReady = async (orderId: string) => {
    const order = orders.find(o => o.orderId === orderId);
    if (!order) return;
    const pendingIds = order.items.filter(i => i.status !== 'listo').map(i => i.id);
    if (pendingIds.length === 0) return;
    await supabase.from('order_items').update({ status: 'listo' }).in('id', pendingIds);
    loadOrders();
  };

  const elapsed = (ts: string) => {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (diff < 1) return 'ahora';
    return diff + ' min';
  };

  const totalPending = orders.reduce((a, o) => a + o.items.filter(i => i.status === 'pendiente').length, 0);
  const totalPreparando = orders.reduce((a, o) => a + o.items.filter(i => i.status === 'preparando').length, 0);

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>
            {stationFilter === 'cocina' ? '🔥 COCINA' : stationFilter === 'barra' ? '🍹 BARRA' : '🔥 KDS'}
          </Text>
          <Text style={st.subtitle}>
            {totalPending} pendientes · {totalPreparando} preparando · {orders.length} ordenes
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {user.role === 'admin' && (
            <>
              <TouchableOpacity onPress={() => setStationFilter('all')} style={[st.filterBtn, stationFilter === 'all' && st.filterBtnActive]}>
                <Text style={[st.filterBtnT, stationFilter === 'all' && st.filterBtnTA]}>Todo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStationFilter('cocina')} style={[st.filterBtn, stationFilter === 'cocina' && st.filterBtnActive]}>
                <Text style={[st.filterBtnT, stationFilter === 'cocina' && st.filterBtnTA]}>Cocina</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStationFilter('barra')} style={[st.filterBtn, stationFilter === 'barra' && st.filterBtnActive]}>
                <Text style={[st.filterBtnT, stationFilter === 'barra' && st.filterBtnTA]}>Barra</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={() => setShowListo(!showListo)} style={[st.filterBtn, showListo && st.filterBtnActive]}>
            <Text style={[st.filterBtnT, showListo && st.filterBtnTA]}>Listos</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Orders grid */}
      <ScrollView contentContainerStyle={st.grid}>
        {orders.length === 0 && (
          <View style={st.empty}>
            <Text style={{ fontSize: 48 }}>👨‍🍳</Text>
            <Text style={st.emptyText}>Sin pedidos pendientes</Text>
          </View>
        )}
        {orders.map(order => {
          const allListo = order.items.every(i => i.status === 'listo');
          const oldestItem = order.items.reduce((a, b) => new Date(a.createdAt) < new Date(b.createdAt) ? a : b);
          const mins = Math.floor((Date.now() - new Date(oldestItem.createdAt).getTime()) / 60000);
          const urgent = mins > 15;
          const warning = mins > 8;

          return (
            <View key={order.orderId} style={[st.card, allListo && st.cardListo, urgent && st.cardUrgent]}>
              {/* Card header */}
              <View style={[st.cardHeader, urgent ? { backgroundColor: '#EF4444' } : warning ? { backgroundColor: '#F59E0B' } : allListo ? { backgroundColor: '#10B981' } : {}]}>
                <View style={{ flex: 1 }}>
                  <Text style={st.cardMesa}>MESA {order.tableNumber}</Text>
                  <Text style={st.cardInfo}>#{order.orderNumber} · {order.waiterName} · {elapsed(oldestItem.createdAt)}</Text>
                </View>
                {!allListo && (
                  <TouchableOpacity onPress={() => markAllReady(order.orderId)} style={st.allReadyBtn}>
                    <Text style={st.allReadyBtnT}>TODO LISTO</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Items */}
              {order.items.map(item => {
                const nextStatus = NEXT_STATUS[item.status];
                const color = STATUS_COLORS[item.status] || '#666';

                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => nextStatus && updateStatus(item.id, nextStatus)}
                    style={[st.item, { borderLeftColor: color, borderLeftWidth: 4 }]}
                    activeOpacity={nextStatus ? 0.6 : 1}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={st.itemName}>{item.quantity}x {item.productName}</Text>
                      {item.modifiers.length > 0 && (
                        <Text style={st.itemMods}>{item.modifiers.join(', ')}</Text>
                      )}
                      {item.notes && !item.notes.startsWith('(pedido app)') && (
                        <Text style={st.itemNotes}>📝 {item.notes}</Text>
                      )}
                    </View>
                    <View style={[st.statusBadge, { backgroundColor: color + '20' }]}>
                      <Text style={[st.statusText, { color }]}>{STATUS_LABELS[item.status] || item.status}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#2A2A2A', borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  title: { fontSize: 20, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
  subtitle: { fontSize: 12, color: '#999', marginTop: 2 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#3A3A3A', borderWidth: 1, borderColor: '#4A4A4A' },
  filterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterBtnT: { fontSize: 12, fontWeight: '600', color: '#999' },
  filterBtnTA: { color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12 },
  empty: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyText: { fontSize: 16, color: '#666', marginTop: 12 },
  card: { width: 320, backgroundColor: '#2A2A2A', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#3A3A3A' },
  cardListo: { borderColor: '#10B981', opacity: 0.7 },
  cardUrgent: { borderColor: '#EF4444', borderWidth: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#3A3A3A' },
  cardMesa: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  cardInfo: { fontSize: 11, color: '#AAAAAA', marginTop: 1 },
  allReadyBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#10B981' },
  allReadyBtnT: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
  itemName: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  itemMods: { fontSize: 12, color: '#F59E0B', marginTop: 2 },
  itemNotes: { fontSize: 12, color: '#EF4444', marginTop: 2, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginLeft: 8 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
});
