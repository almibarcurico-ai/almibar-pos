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

type Sub = 'menu'|'products'|'ingredients'|'suppliers'|'purchases'|'users'|'reports'|'clients'|'modifiers'|'printers';

interface Props { onOpenEditor: () => void; }

export default function AdminScreen({ onOpenEditor }: Props) {
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
      {sub === 'reports' && <ReportsScreen />}
      {sub === 'clients' && <ClientsScreen />}
      {sub === 'modifiers' && <ModifiersScreen />}
      {sub === 'printers' && <PrintersScreen />}
      {sub === 'suppliers' && <SuppliersScreen />}
      {sub === 'purchases' && <PurchasesScreen />}
    </View>
  );
}

function Menu({ onSelect, onOpenEditor }: { onSelect: (s: Sub) => void; onOpenEditor: () => void }) {
  const items: { key: Sub; icon: string; title: string; desc: string }[] = [
    { key: 'products', icon: '🍕', title: 'Productos', desc: 'Menú, recetas y food cost' },
    { key: 'ingredients', icon: '🥩', title: 'Ingredientes', desc: 'Stock, costos e historial' },
    { key: 'modifiers', icon: '🎛️', title: 'Modificadores', desc: 'Sabores y opciones' },
    { key: 'suppliers', icon: '🚚', title: 'Proveedores', desc: 'Contactos y datos' },
    { key: 'purchases', icon: '🧾', title: 'Compras', desc: 'Facturas y stock' },
    { key: 'printers', icon: '🖨️', title: 'Impresoras', desc: 'Cocina, Barra, Caja' },
    { key: 'clients', icon: '🤝', title: 'Socios', desc: 'Club de Amigos' },
    { key: 'users', icon: '👥', title: 'Usuarios', desc: 'Roles y accesos' },
    { key: 'reports', icon: '📊', title: 'Reportes', desc: 'Ventas y análisis' },
  ];
  return (
    <ScrollView contentContainerStyle={s.grid}>
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
    </ScrollView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background },
  hdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  hdrT: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  back: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  grid: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47%' as any, backgroundColor: COLORS.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  cardT: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  cardD: { fontSize: 11, color: COLORS.textSecondary },
});
