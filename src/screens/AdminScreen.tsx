// src/screens/AdminScreen.tsx
// v2 - Router with Phase B modules

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Switch, Linking } from 'react-native';
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
import FacturaScannerScreen from './admin/FacturaScannerScreen';
import FinancialScreen from './admin/FinancialScreen';

type Sub = 'menu'|'products'|'ingredients'|'suppliers'|'purchases'|'inventory'|'users'|'reports'|'clients'|'modifiers'|'printers'|'scanner'|'financial';

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
      {sub === 'scanner' && <FacturaScannerScreen />}
      {sub === 'financial' && <FinancialScreen />}
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
          const enviarWA = () => {
            if (!c.phone) { Alert.alert('Sin teléfono', 'Este socio no tiene teléfono registrado.'); return; }
            const tel = c.phone.replace(/[^0-9]/g, '');
            const telWA = tel.startsWith('56') ? tel : '56' + tel;
            const nombre = c.name.split(' ')[0];
            const msg = c.diasFaltan <= 0
              ? `¡Hola ${nombre}! 🎂🎉\n\n¡Feliz cumpleaños de parte de todo el equipo de *Almíbar Cocina y Bar*!\n\nQueremos invitarte a celebrar con nosotros. Tenemos beneficios especiales para ti:\n\n🍹 *2 a 5 personas:* 1 cóctel gratis\n🍹🍹 *6 a 10 personas:* 2 cócteles gratis\n🍹🥃 *11 a 15 personas:* 2 cócteles + ronda de tequila\n💰 *16+ personas:* 40% de descuento en toda la mesa\n\n📍 Francisco Moreno 418, Curicó\n\n👉 *Haz tu reserva aquí:*\nhttps://almibarcurico-ai.github.io/\n\n¡Te esperamos! 🥂`
              : `¡Hola ${nombre}! 🎉\n\nEn *Almíbar Cocina y Bar* estamos expectantes porque se viene una fecha especial y queremos ser parte de tu celebración!\n\nTe recordamos que como socio del club tienes beneficios exclusivos:\n\n🍹 *2 a 5 personas:* 1 cóctel gratis para ti\n🍹🍹 *6 a 10 personas:* 2 cócteles gratis\n🍹🥃 *11 a 15 personas:* 2 cócteles + ronda de tequila\n💰 *16+ personas:* 40% de descuento en toda la mesa\n\nReserva con tiempo para asegurar tu mesa 🙌\n\n📍 Francisco Moreno 418, Curicó\n\n👉 *Reserva aquí:*\nhttps://almibarcurico-ai.github.io/\n\n¡Te esperamos! 🥂`;
            const url = `https://wa.me/${telWA}?text=${encodeURIComponent(msg)}`;
            Linking.openURL(url);
          };
          return (
            <TouchableOpacity key={i} style={[sc.card, esHoy && sc.cardHoy]} onPress={enviarWA} activeOpacity={0.7}>
              <Text style={{ fontSize: esHoy ? 28 : 20 }}>{esHoy ? '🎉' : '🎂'}</Text>
              <Text style={sc.nombre} numberOfLines={1}>{c.name}</Text>
              <Text style={sc.fecha}>{c.dia}/{c.mes}</Text>
              <Text style={[sc.dias, esHoy && { color: '#16a34a' }]}>
                {esHoy ? '¡HOY!' : esAyer ? 'Fue ayer' : esMañana ? 'Mañana' : `En ${c.diasFaltan} días`}
              </Text>
              {c.phone && <Text style={sc.tel}>📱 {c.phone}</Text>}
              <Text style={sc.waBtn}>💬 WhatsApp</Text>
            </TouchableOpacity>
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
  waBtn: { fontSize: 10, fontWeight: '700', color: '#25D366', marginTop: 4, backgroundColor: '#25D36615', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
});

function ClientesEnLocal() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [promoActiva, setPromoActiva] = useState(false);
  const [enviados, setEnviados] = useState<Set<string>>(new Set());

  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, []);

  const load = async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, notes, client_id, table_id, opened_at, tables:table_id(number), clients:client_id(name, phone, member_number, total_visits)')
      .eq('status', 'abierta')
      .not('table_id', 'is', null);
    if (!data) { setClientes([]); return; }
    const list = data.map((o: any) => ({
      orderId: o.id,
      mesa: o.tables?.number || '?',
      nombre: o.clients?.name || (o.notes?.replace('Cliente: ', '').split('|')[0]?.trim()) || 'Sin nombre',
      phone: o.clients?.phone || null,
      member: o.clients?.member_number || null,
      visitas: o.clients?.total_visits || 0,
      hora: o.opened_at,
    })).sort((a: any, b: any) => a.mesa - b.mesa);
    setClientes(list);
  };

  const enviarPromo = (c: any) => {
    if (!c.phone) { Alert.alert('Sin teléfono', 'Este cliente no tiene teléfono registrado.'); return; }
    const tel = c.phone.replace(/[^0-9]/g, '');
    const telWA = tel.startsWith('56') ? tel : '56' + tel;
    const nombre = c.nombre.split(' ')[0];
    const msg = `¡Hola ${nombre}! 🔥\n\n*PROMO FLASH solo para ti en Almíbar* ⚡\n\n🥃 Shot de Tequila *$1.000*\n🍺 Schop Patagonia *$2.500*\n🍹 Mojito Cubano *$2.500*\n\nVálido por 5 minutos. Pide desde la app o muestra este mensaje a tu garzón.\n\n👉 https://almibarcurico-ai.github.io/\n\n¡Salud! 🥂`;
    Linking.openURL(`https://wa.me/${telWA}?text=${encodeURIComponent(msg)}`);
    setEnviados(prev => new Set([...prev, c.orderId]));
  };

  const enviarATodos = () => {
    const conTel = clientes.filter(c => c.phone && !enviados.has(c.orderId));
    if (conTel.length === 0) { Alert.alert('Sin destinatarios', 'No hay clientes con teléfono o ya se envió a todos.'); return; }
    Alert.alert(
      'Promo Flash a ' + conTel.length + ' mesas',
      'Se abrirá WhatsApp para cada cliente. ¿Continuar?',
      [{ text: 'Cancelar' }, { text: 'Enviar', onPress: () => { conTel.forEach((c, i) => setTimeout(() => enviarPromo(c), i * 1500)); } }]
    );
  };

  const togglePromo = async () => {
    const nueva = !promoActiva;
    setPromoActiva(nueva);

    if (nueva) {
      // Activar: insertar o actualizar banner promo flash
      const ahora = new Date().toISOString();
      const { data: existing } = await supabase.from('promo_banners').select('id').eq('title', 'PROMO FLASH').limit(1);
      if (existing && existing.length > 0) {
        await supabase.from('promo_banners').update({ active: true, subtitle: '🥃 Shot Tequila $1.000 · 🍺 Schop $2.500 · 🍹 Mojito $2.500', emoji: '🔥', sort_order: 0, created_at: ahora }).eq('id', existing[0].id);
      } else {
        await supabase.from('promo_banners').insert({ title: 'PROMO FLASH', subtitle: '🥃 Shot Tequila $1.000 · 🍺 Schop $2.500 · 🍹 Mojito $2.500', emoji: '🔥', image_url: '', sort_order: 0, active: true, created_at: ahora });
      }
      // Auto-desactivar en 10 minutos
      setTimeout(async () => {
        await supabase.from('promo_banners').update({ active: false }).eq('title', 'PROMO FLASH');
        setPromoActiva(false);
      }, 5 * 60 * 1000); // 5 minutos
      Alert.alert('⚡ Promo Flash activada', '3 productos en promo por 5 minutos.\nShot Tequila $1.000\nSchop Patagonia $2.500\nMojito Cubano $2.500');
    } else {
      // Desactivar: ocultar banner
      await supabase.from('promo_banners').update({ active: false }).eq('title', 'PROMO FLASH');
      Alert.alert('Promo desactivada', 'El banner ya no aparece en la app');
    }
  };

  if (clientes.length === 0) return null;

  const fH = (ts: string) => new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <View style={cl.wrap}>
      <View style={cl.header}>
        <View style={{ flex: 1 }}>
          <Text style={cl.title}>🪑 Clientes en el local ({clientes.length})</Text>
          <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Toca un cliente para enviar promo por WhatsApp</Text>
        </View>
        <TouchableOpacity style={[cl.promoBtn, promoActiva && cl.promoBtnActiva]} onPress={togglePromo}>
          <Text style={{ fontSize: 12, color: promoActiva ? '#fff' : '#f59e0b', fontWeight: '700' }}>⚡ {promoActiva ? 'Promo ON' : 'Activar Promo'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={cl.enviarTodos} onPress={enviarATodos}>
          <Text style={{ fontSize: 11, color: '#25D366', fontWeight: '700' }}>💬 Enviar a todos</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        {clientes.map((c, i) => {
          const yaEnviado = enviados.has(c.orderId);
          return (
            <TouchableOpacity key={i} style={[cl.card, yaEnviado && cl.cardEnviado]} onPress={() => enviarPromo(c)} activeOpacity={0.7}>
              <View style={cl.mesaBadge}><Text style={cl.mesaNum}>{c.mesa}</Text></View>
              <Text style={cl.nombre} numberOfLines={1}>{c.nombre}</Text>
              <Text style={cl.hora}>Desde {fH(c.hora)}</Text>
              {c.member && <Text style={cl.socio}>Socio #{c.member}</Text>}
              {c.phone ? (
                <Text style={cl.waBtn}>{yaEnviado ? '✅ Enviado' : '💬 Enviar promo'}</Text>
              ) : (
                <Text style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 4 }}>Sin teléfono</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const cl = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 8, marginBottom: 4, backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  title: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  promoBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5, borderColor: '#f59e0b', backgroundColor: '#f59e0b10' },
  promoBtnActiva: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  enviarTodos: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5, borderColor: '#25D366', backgroundColor: '#25D36610' },
  card: { backgroundColor: COLORS.background, borderRadius: 10, padding: 10, minWidth: 130, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  cardEnviado: { borderColor: '#25D366', backgroundColor: '#25D36608' },
  mesaBadge: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.primary + '18', alignItems: 'center', justifyContent: 'center' },
  mesaNum: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  nombre: { fontSize: 12, fontWeight: '700', color: COLORS.text, marginTop: 4, textAlign: 'center', maxWidth: 120 },
  hora: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  socio: { fontSize: 9, color: COLORS.primary, fontWeight: '600', marginTop: 1 },
  waBtn: { fontSize: 10, fontWeight: '700', color: '#25D366', marginTop: 4, backgroundColor: '#25D36615', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
});

function Menu({ onSelect, onOpenEditor }: { onSelect: (s: Sub) => void; onOpenEditor: () => void }) {
  const items: { key: Sub; icon: string; title: string; desc: string }[] = [
    { key: 'suppliers', icon: '🚚', title: 'Proveedores', desc: 'Contactos y datos' },
    { key: 'purchases', icon: '🧾', title: 'Compras', desc: 'Facturas y stock' },
    { key: 'scanner', icon: '📷', title: 'Escanear Factura', desc: 'OCR con IA' },
    { key: 'financial', icon: '📈', title: 'Análisis Financiero', desc: 'P&L mensual' },
    { key: 'printers', icon: '🖨️', title: 'Impresoras', desc: 'Cocina, Barra, Caja' },
    { key: 'clients', icon: '🤝', title: 'Socios', desc: 'Club de Amigos' },
    { key: 'users', icon: '👥', title: 'Usuarios', desc: 'Roles y accesos' },
  ];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <CumpleanosProximos />
      <ClientesEnLocal />
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
