// src/screens/AdminScreen.tsx
// v2 - Router with Phase B modules

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Switch } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { COLORS } from '../theme';
import IngredientsScreen from './admin/IngredientsScreen';
import ProductsScreen from './admin/ProductsScreen';
import UsersScreen from './admin/UsersScreen';
import ReportsScreen from './admin/ReportsScreen';
import ClientsScreen from './admin/ClientsScreen';
import ModifiersScreen from './admin/ModifiersScreen';
import PrintersScreen from './admin/PrintersScreen';
import SuppliersScreen from './admin/SuppliersScreen';
import PurchasesScreen from './admin/PurchasesScreen';
import InventoryCountScreen from './admin/InventoryCountScreen';

type Sub = 'menu'|'products'|'ingredients'|'suppliers'|'purchases'|'inventory'|'users'|'reports'|'clients'|'modifiers'|'printers';

interface Props { onOpenEditor: () => void; onOpenInventory?: (sub: string) => void; }

export default function AdminScreen({ onOpenEditor, onOpenInventory }: Props) {
  const [sub, setSub] = useState<Sub>('menu');
  return (
    <View style={s.c}>
      <View style={s.hdr}>
        <Text style={s.hdrT}>⚙️ Administración</Text>
        {sub !== 'menu' && <TouchableOpacity onPress={() => setSub('menu')}><Text style={s.back}>← Volver</Text></TouchableOpacity>}
      </View>
      {sub === 'menu' && <Menu onSelect={setSub} onOpenEditor={onOpenEditor} />}
      {sub === 'products' && <ProductsScreen />}
      {sub === 'ingredients' && <IngredientsScreen />}
      {sub === 'users' && <UsersScreen />}
      {sub === 'clients' && <ClientsScreen />}
      {sub === 'modifiers' && <ModifiersScreen />}
      {sub === 'printers' && <PrintersScreen />}
      {sub === 'suppliers' && <SuppliersScreen />}
      {sub === 'purchases' && <PurchasesScreen />}
      {sub === 'inventory' && <InventoryCountScreen />}
    </View>
  );
}

interface PresentClient {
  client_name: string;
  client_id: string | null;
  table_number: number;
  waiter_name: string;
  opened_at: string;
  total_visits: number | null;
  total_spent: number | null;
  notes: string | null;
  member_number: string | null;
}

function ClientesPresentes() {
  const [clients, setClients] = useState<PresentClient[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from('orders')
      .select('notes, client_id, opened_at, table_id, waiter_id, tables:table_id(number), users:waiter_id(name), clients:client_id(name, total_visits, total_spent, notes, member_number)')
      .eq('status', 'abierta')
      .not('table_id', 'is', null);

    if (!data) { setClients([]); setLoading(false); return; }

    const list: PresentClient[] = data.map((o: any) => {
      const clientName = o.clients?.name || (o.notes?.replace('Cliente: ', '').split('|')[0]?.trim()) || 'Sin nombre';
      return {
        client_name: clientName,
        client_id: o.client_id,
        table_number: o.tables?.number || 0,
        waiter_name: o.users?.name || '—',
        opened_at: o.opened_at,
        total_visits: o.clients?.total_visits || null,
        total_spent: o.clients?.total_spent || null,
        notes: o.clients?.notes || null,
        member_number: o.clients?.member_number || null,
      };
    });
    list.sort((a, b) => a.table_number - b.table_number);
    setClients(list);
    setLoading(false);
  };

  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, []);

  const fmt = (n: number) => '$' + n.toLocaleString('es-CL');
  const fHora = (ts: string) => new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });

  if (loading) return null;
  if (clients.length === 0) return (
    <View style={sp.wrap}>
      <Text style={sp.title}>👥 Clientes en el local</Text>
      <Text style={sp.empty}>Sin clientes en este momento</Text>
    </View>
  );

  return (
    <View style={sp.wrap}>
      <View style={sp.header}>
        <Text style={sp.title}>👥 Clientes en el local</Text>
        <View style={sp.badge}><Text style={sp.badgeT}>{clients.length}</Text></View>
      </View>
      {clients.map((c, i) => (
        <View key={i} style={sp.row}>
          <View style={sp.mesa}><Text style={sp.mesaT}>{c.table_number}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={sp.name}>{c.client_name}</Text>
            <Text style={sp.sub}>
              {c.member_number ? `Socio #${c.member_number} · ` : ''}
              Garzón: {c.waiter_name} · Desde {fHora(c.opened_at)}
            </Text>
            {c.total_visits != null && (
              <Text style={sp.stats}>{c.total_visits} visitas · {fmt(c.total_spent || 0)} total</Text>
            )}
            {c.notes ? <Text style={sp.notes}>📝 {c.notes}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const sp = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 12, backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  badge: { backgroundColor: COLORS.primary, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badgeT: { color: '#fff', fontSize: 12, fontWeight: '800' },
  empty: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  mesa: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.primary + '18', alignItems: 'center', justifyContent: 'center' },
  mesaT: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  name: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  sub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  stats: { fontSize: 11, color: COLORS.primary, fontWeight: '600', marginTop: 1 },
  notes: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
});

function CumpleanosProximos() {
  const [cumples, setCumples] = useState<any[]>([]);

  useEffect(() => {
    loadCumples();
    const i = setInterval(loadCumples, 60000);
    return () => clearInterval(i);
  }, []);

  const loadCumples = async () => {
    const { data } = await supabase
      .from('clients')
      .select('name, birthday, phone, member_number, total_visits')
      .eq('active', true)
      .not('birthday', 'is', null);
    if (!data) return;

    const hoy = new Date();
    const hoyMD = (hoy.getMonth() + 1) * 100 + hoy.getDate();

    const conProx = data.map((c: any) => {
      const [y, m, d] = c.birthday.split('-').map(Number);
      const cumpleMD = m * 100 + d;
      let diasFaltan = cumpleMD - hoyMD;
      if (diasFaltan < -7) diasFaltan += 365;
      return { ...c, diasFaltan, mes: m, dia: d };
    }).filter((c: any) => c.diasFaltan >= -1 && c.diasFaltan <= 30)
      .sort((a: any, b: any) => a.diasFaltan - b.diasFaltan);

    setCumples(conProx.slice(0, 15));
  };

  if (cumples.length === 0) return null;

  return (
    <View style={sc.wrap}>
      <View style={sc.header}>
        <Text style={sc.title}>🎂 Cumpleaños próximos</Text>
        <View style={sc.badge}><Text style={sc.badgeT}>{cumples.length}</Text></View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        {cumples.map((c, i) => {
          const esHoy = c.diasFaltan === 0;
          const esMañana = c.diasFaltan === 1;
          const esAyer = c.diasFaltan === -1;
          return (
            <View key={i} style={[sc.card, esHoy && sc.cardHoy]}>
              <Text style={{ fontSize: esHoy ? 28 : 20 }}>{esHoy ? '🎉' : '🎂'}</Text>
              <Text style={sc.nombre} numberOfLines={1}>{c.name}</Text>
              <Text style={sc.fecha}>{c.dia}/{c.mes}</Text>
              <Text style={[sc.dias, esHoy && { color: '#16a34a' }]}>
                {esHoy ? '¡HOY!' : esAyer ? 'Fue ayer' : esMañana ? 'Mañana' : `En ${c.diasFaltan} días`}
              </Text>
              {c.phone && <Text style={sc.tel}>{c.phone}</Text>}
              {c.total_visits > 0 && <Text style={sc.visitas}>{c.total_visits} visitas</Text>}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const sc = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  badge: { backgroundColor: '#f59e0b', width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badgeT: { color: '#fff', fontSize: 12, fontWeight: '800' },
  card: { backgroundColor: COLORS.background, borderRadius: 10, padding: 10, minWidth: 120, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  cardHoy: { borderColor: '#16a34a', backgroundColor: '#f0fdf4', borderWidth: 2 },
  nombre: { fontSize: 12, fontWeight: '700', color: COLORS.text, marginTop: 4, textAlign: 'center', maxWidth: 110 },
  fecha: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  dias: { fontSize: 11, fontWeight: '700', color: '#f59e0b', marginTop: 2 },
  tel: { fontSize: 9, color: COLORS.textMuted, marginTop: 2 },
  visitas: { fontSize: 9, color: COLORS.primary, fontWeight: '600', marginTop: 1 },
});

function Menu({ onSelect, onOpenEditor }: { onSelect: (s: Sub) => void; onOpenEditor: () => void }) {
  const items: { key: Sub; icon: string; title: string; desc: string }[] = [
    { key: 'products', icon: '🍕', title: 'Productos', desc: 'Menú, recetas y food cost' },
    { key: 'ingredients', icon: '🥩', title: 'Ingredientes', desc: 'Stock, costos e historial' },
    { key: 'modifiers', icon: '🎛️', title: 'Modificadores', desc: 'Sabores y opciones' },
    { key: 'inventory', icon: '📦', title: 'Inventario', desc: 'Conteo y merma' },
    { key: 'suppliers', icon: '🚚', title: 'Proveedores', desc: 'Contactos y datos' },
    { key: 'purchases', icon: '🧾', title: 'Compras', desc: 'Facturas y stock' },
    { key: 'printers', icon: '🖨️', title: 'Impresoras', desc: 'Cocina, Barra, Caja' },
    { key: 'clients', icon: '🤝', title: 'Socios', desc: 'Club de Amigos' },
    { key: 'users', icon: '👥', title: 'Usuarios', desc: 'Roles y accesos' },
  ];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <CumpleanosProximos />
      <View style={s.grid}>
        {items.map(i => (
          <TouchableOpacity key={i.key} style={s.card} onPress={() => onSelect(i.key)}>
            <Text style={{ fontSize: 28 }}>{i.icon}</Text>
            <Text style={s.cardT}>{i.title}</Text>
            <Text style={s.cardD}>{i.desc}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.card} onPress={onOpenEditor}>
          <Text style={{ fontSize: 28 }}>🗺</Text>
          <Text style={s.cardT}>Editor Mesas</Text>
          <Text style={s.cardD}>Posicionar mesas</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background },
  hdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  hdrT: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  back: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  grid: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47%' as any, backgroundColor: COLORS.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  cardT: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  cardD: { fontSize: 11, color: COLORS.textSecondary },
});
