// src/components/AppOrdersPanel.tsx
// Notificaciones de pedidos desde la app de clientes

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { COLORS } from '../theme';

interface AppOrder {
  id: string;
  table_number: number;
  table_id: string | null;
  customer_name: string;
  status: string;
  total: number;
  created_at: string;
  items?: AppOrderItem[];
}

interface AppOrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
}

export default function AppOrdersPanel() {
  const { user } = useAuth();
  const [pendingOrders, setPendingOrders] = useState<AppOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<AppOrder | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    loadPending();
    const cleanup = setupRealtime();
    return cleanup;
  }, []);

  const loadPending = async () => {
    const { data } = await supabase
      .from('app_orders')
      .select('*')
      .eq('status', 'pendiente')
      .order('created_at', { ascending: false });
    if (data) setPendingOrders(data);
  };

  const setupRealtime = () => {
    const ch = supabase
      .channel('app-orders-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_orders' }, (payload) => {
        // Nuevo pedido — recargar y alertar
        loadPending();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_orders' }, () => {
        loadPending();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  };

  const loadOrderItems = async (order: AppOrder) => {
    const { data } = await supabase
      .from('app_order_items')
      .select('*')
      .eq('app_order_id', order.id)
      .order('created_at');
    setSelectedOrder({ ...order, items: data || [] });
  };

  const fmt = (p: number) => '$' + p.toLocaleString('es-CL');

  // Confirmar pedido → agregar items a la orden de la mesa
  const confirmOrder = async (order: AppOrder) => {
    if (!user || !order.items) return;

    try {
      // Buscar mesa por número
      const { data: tableData } = await supabase
        .from('tables')
        .select('*, current_order_id')
        .eq('number', order.table_number)
        .eq('active', true)
        .single();

      if (!tableData) {
        Alert.alert('Error', `Mesa ${order.table_number} no encontrada`);
        return;
      }

      let orderId = tableData.current_order_id;

      // Si la mesa no tiene orden abierta, crear una
      if (!orderId || tableData.status === 'libre') {
        const { data: newOrder, error: orderErr } = await supabase
          .from('orders')
          .insert({
            table_id: tableData.id,
            type: 'mesa',
            status: 'abierta',
            waiter_id: user.id,
            notes: `App: ${order.customer_name || 'Cliente'}`,
          })
          .select()
          .single();

        if (orderErr) throw orderErr;
        orderId = newOrder.id;

        await supabase.from('tables').update({
          status: 'ocupada',
          current_order_id: orderId,
        }).eq('id', tableData.id);
      }

      // Agregar items a la orden
      const items = order.items.map(item => ({
        order_id: orderId,
        product_id: item.id, // usamos product_id del app_order_item
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        notes: item.notes ? `📱 App: ${item.notes}` : '📱 Pedido desde App',
        status: 'pendiente',
        printed: false,
        created_by: user.id,
      }));

      // Buscar product_ids reales
      const productNames = order.items.map(i => i.product_name);
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('name', productNames);

      const nameToId: Record<string, string> = {};
      if (products) products.forEach(p => { nameToId[p.name] = p.id; });

      const realItems = order.items.map(item => ({
        order_id: orderId,
        product_id: nameToId[item.product_name] || item.id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        notes: item.notes ? `📱 ${item.notes}` : '📱 App',
        status: 'pendiente',
        printed: false,
        created_by: user.id,
      }));

      const { error: insertErr } = await supabase.from('order_items').insert(realItems);
      if (insertErr) throw insertErr;

      // Marcar app_order como confirmado
      await supabase.from('app_orders').update({
        status: 'confirmado',
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
        table_id: tableData.id,
      }).eq('id', order.id);

      // Log
      await supabase.from('order_logs').insert({
        order_id: orderId,
        action: 'app_order_confirmed',
        details: {
          app_order_id: order.id,
          customer_name: order.customer_name,
          items_count: order.items.length,
        },
        user_id: user.id,
      });

      Alert.alert('✅ Confirmado', `${order.items.length} productos agregados a Mesa ${order.table_number}`);
      setSelectedOrder(null);
      setShowPanel(false);
      await loadPending();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  // Rechazar pedido
  const rejectOrder = async (order: AppOrder) => {
    Alert.alert('Rechazar Pedido', '¿Seguro? El cliente será notificado.', [
      { text: 'No' },
      { text: 'Rechazar', style: 'destructive', onPress: async () => {
        await supabase.from('app_orders').update({
          status: 'rechazado',
          rejected_reason: 'Rechazado por el local',
        }).eq('id', order.id);
        setSelectedOrder(null);
        await loadPending();
      }},
    ]);
  };

  if (pendingOrders.length === 0) return null;

  return (
    <>
      {/* Badge flotante */}
      <TouchableOpacity style={st.badge} onPress={() => setShowPanel(true)}>
        <Text style={st.badgeIcon}>📱</Text>
        <View style={st.badgeCount}>
          <Text style={st.badgeCountT}>{pendingOrders.length}</Text>
        </View>
        <Text style={st.badgeLabel}>Pedidos App</Text>
      </TouchableOpacity>

      {/* Panel de pedidos */}
      <Modal visible={showPanel} transparent animationType="slide">
        <View style={st.panel}>
          <View style={st.panelHeader}>
            <Text style={st.panelTitle}>📱 Pedidos desde App ({pendingOrders.length})</Text>
            <TouchableOpacity onPress={() => setShowPanel(false)}>
              <Text style={{ color: COLORS.error, fontSize: 15, fontWeight: '600' }}>✕ Cerrar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {pendingOrders.map(order => (
              <TouchableOpacity key={order.id} style={st.orderCard} onPress={() => loadOrderItems(order)}>
                <View style={st.orderCardHeader}>
                  <Text style={st.orderMesa}>Mesa {order.table_number}</Text>
                  <Text style={st.orderTime}>
                    {new Date(order.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                {order.customer_name && <Text style={st.orderClient}>👤 {order.customer_name}</Text>}
                <Text style={st.orderTotal}>{fmt(order.total)}</Text>
                <View style={st.pulseBar} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Detalle de orden */}
      <Modal visible={!!selectedOrder} transparent animationType="fade">
        <View style={st.ov}>
          <View style={st.md}>
            <Text style={st.mdT}>📱 Pedido App</Text>
            <Text style={st.mdSub}>Mesa {selectedOrder?.table_number} • {selectedOrder?.customer_name || 'Cliente'}</Text>
            <Text style={st.mdTime}>
              {selectedOrder && new Date(selectedOrder.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
            </Text>

            <View style={st.divider} />

            {selectedOrder?.items?.map((item, i) => (
              <View key={i} style={st.itemRow}>
                <Text style={st.itemQty}>{item.quantity}x</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.itemName}>{item.product_name}</Text>
                  {item.notes && <Text style={st.itemNotes}>📝 {item.notes}</Text>}
                </View>
                <Text style={st.itemPrice}>{fmt(item.total_price)}</Text>
              </View>
            ))}

            <View style={st.divider} />

            <View style={st.totalRow}>
              <Text style={st.totalLabel}>TOTAL</Text>
              <Text style={st.totalValue}>{fmt(selectedOrder?.total || 0)}</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity style={[st.btn, { backgroundColor: COLORS.error }]} onPress={() => selectedOrder && rejectOrder(selectedOrder)}>
                <Text style={st.btnT}>❌ Rechazar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.btn, { backgroundColor: COLORS.success, flex: 2 }]} onPress={() => selectedOrder && confirmOrder(selectedOrder)}>
                <Text style={st.btnT}>✅ Confirmar y Enviar a Mesa</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={{ marginTop: 12, alignItems: 'center' }} onPress={() => setSelectedOrder(null)}>
              <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  // Badge flotante
  badge: {
    position: 'absolute', top: 120, right: 16, backgroundColor: COLORS.success,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    elevation: 8, shadowColor: COLORS.success, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, zIndex: 100,
  },
  badgeIcon: { fontSize: 18 },
  badgeCount: {
    backgroundColor: COLORS.error, width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeCountT: { color: '#fff', fontSize: 12, fontWeight: '800' },
  badgeLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Panel
  panel: { flex: 1, backgroundColor: COLORS.background, marginTop: 80 },
  panelHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  panelTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },

  // Order card
  orderCard: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 10,
    borderWidth: 2, borderColor: COLORS.success + '50', overflow: 'hidden',
  },
  orderCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderMesa: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  orderTime: { fontSize: 12, color: COLORS.textSecondary },
  orderClient: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  orderTotal: { fontSize: 20, fontWeight: '800', color: COLORS.primary, marginTop: 8 },
  pulseBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
    backgroundColor: COLORS.success,
  },

  // Modal
  ov: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' },
  md: {
    width: '92%', maxWidth: 460, backgroundColor: COLORS.card,
    borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border,
  },
  mdT: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  mdSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 4 },
  mdTime: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 14 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  itemQty: { fontSize: 14, fontWeight: '800', color: COLORS.primary, minWidth: 28 },
  itemName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  itemNotes: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  itemPrice: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  totalValue: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  btn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
  },
  btnT: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
