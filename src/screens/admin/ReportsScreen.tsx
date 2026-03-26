// src/screens/admin/ReportsScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';
import { Chip, fmt, sh } from './shared';

export default function ReportsScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [period, setPeriod] = useState<'hoy' | 'semana' | 'mes'>('hoy');

  useEffect(() => { load(); }, [period]);

  const load = async () => {
    const now = new Date();
    let since: string;
    if (period === 'hoy') since = now.toISOString().split('T')[0];
    else if (period === 'semana') { const d = new Date(now); d.setDate(d.getDate() - 7); since = d.toISOString().split('T')[0]; }
    else { const d = new Date(now); d.setMonth(d.getMonth() - 1); since = d.toISOString().split('T')[0]; }

    const { data: o } = await supabase.from('orders').select('*').eq('status', 'cerrada').gte('closed_at', since);
    if (o) setOrders(o);
    const ids = (o || []).map((x: any) => x.id);
    if (ids.length > 0) {
      const { data: it } = await supabase.from('order_items').select('*, product:product_id(name, category_id)').in('order_id', ids);
      if (it) setItems(it);
    } else setItems([]);
  };

  const totalVentas = orders.reduce((s, o) => s + o.total, 0);
  const totalTips = orders.reduce((s, o) => s + (o.tip_amount || 0), 0);

  const prodMap: Record<string, { name: string; qty: number; total: number }> = {};
  items.forEach(i => {
    const name = i.product?.name || '?';
    if (!prodMap[name]) prodMap[name] = { name, qty: 0, total: 0 };
    prodMap[name].qty += i.quantity;
    prodMap[name].total += i.total_price;
  });
  const top = Object.values(prodMap).sort((a, b) => b.total - a.total).slice(0, 20);

  return (
    <View style={sh.c}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
        {(['hoy', 'semana', 'mes'] as const).map(p => <Chip key={p} label={p.charAt(0).toUpperCase() + p.slice(1)} active={period === p} onPress={() => setPeriod(p)} />)}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 32, fontWeight: '800', color: COLORS.primary }}>{fmt(totalVentas)}</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>
            {orders.length} órdenes • Ticket prom. {orders.length > 0 ? fmt(Math.round(totalVentas / orders.length)) : '$0'}
            {totalTips > 0 ? ` • Propinas: ${fmt(totalTips)}` : ''}
          </Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>Top Productos</Text>
        {top.map((p, i) => (
          <View key={p.name} style={sh.row}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textMuted, width: 24 }}>{i + 1}</Text>
            <View style={{ flex: 1 }}><Text style={sh.rowName}>{p.name}</Text><Text style={sh.rowSub}>{p.qty} vendidos</Text></View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary }}>{fmt(p.total)}</Text>
          </View>
        ))}
        {top.length === 0 && <Text style={{ textAlign: 'center', color: COLORS.textMuted, marginTop: 20 }}>Sin datos</Text>}
      </ScrollView>
    </View>
  );
}
