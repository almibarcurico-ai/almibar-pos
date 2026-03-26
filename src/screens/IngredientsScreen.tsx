// src/screens/IngredientsScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { COLORS } from '../theme';

const CATS = ['Carnes','Pescados','Mariscos','Lácteos','Verduras','Frutas','Licores','Cervezas','Destilados','Insumos','Especias','Otros'];
const UNITS = ['gr','kg','ml','lt','unidad'];

export default function IngredientsScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [modal, setModal] = useState(false);
  const [ed, setEd] = useState<any>({});
  const [isNew, setIsNew] = useState(false);

  useEffect(() => { load(); }, []);
  const load = async () => { const { data } = await supabase.from('ingredients').select('*').eq('active', true).order('name'); if (data) setItems(data); };
  const fmt = (p: number) => '$' + Math.round(p).toLocaleString('es-CL');
  const filtered = items.filter(i => (!search || i.name.toLowerCase().includes(search.toLowerCase())) && (filterCat === 'all' || i.category === filterCat));
  const lowStock = items.filter(i => i.stock_current <= i.stock_min && i.stock_min > 0);

  const openNew = () => { setEd({ name: '', unit: 'gr', stock_current: 0, stock_min: 0, cost_per_unit: 0, category: 'Otros' }); setIsNew(true); setModal(true); };
  const openEdit = (i: any) => { setEd({ ...i }); setIsNew(false); setModal(true); };
  const save = async () => {
    if (!ed.name?.trim()) { Alert.alert('Error', 'Ingresa un nombre'); return; }
    const p = { name: ed.name, unit: ed.unit, stock_current: parseFloat(ed.stock_current) || 0, stock_min: parseFloat(ed.stock_min) || 0, cost_per_unit: parseFloat(ed.cost_per_unit) || 0, category: ed.category };
    if (isNew) await supabase.from('ingredients').insert(p); else await supabase.from('ingredients').update(p).eq('id', ed.id);
    setModal(false); await load();
  };
  const del = (id: string) => Alert.alert('Eliminar', '¿Seguro?', [{ text: 'No' }, { text: 'Sí', style: 'destructive', onPress: async () => { await supabase.from('ingredients').update({ active: false }).eq('id', id); await load(); } }]);

  return (
    <View style={s.c}>
      <View style={s.hdr}><TouchableOpacity onPress={onBack}><Text style={s.back}>← Admin</Text></TouchableOpacity><Text style={s.hdrT}>🥩 Ingredientes</Text><TouchableOpacity style={s.addBtn} onPress={openNew}><Text style={s.addBtnT}>+ Nuevo</Text></TouchableOpacity></View>
      {lowStock.length > 0 && <View style={s.alert}><Text style={s.alertT}>⚠️ {lowStock.length} con stock bajo: {lowStock.map(i => i.name).slice(0,3).join(', ')}</Text></View>}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}><TextInput style={s.si} placeholder="🔍 Buscar..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 40, marginBottom: 6 }} contentContainerStyle={{ paddingHorizontal: 12 }}>
        <Chip label="Todos" active={filterCat === 'all'} onPress={() => setFilterCat('all')} />
        {CATS.map(c => <Chip key={c} label={c} active={filterCat === c} onPress={() => setFilterCat(c)} />)}
      </ScrollView>
      <Text style={s.cnt}>{filtered.length} ingredientes</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {filtered.map(i => (
          <TouchableOpacity key={i.id} style={s.row} onPress={() => openEdit(i)}>
            <View style={{ flex: 1 }}><Text style={s.rn}>{i.name}</Text><Text style={s.rs}>{i.category} • {i.unit} • Costo: {fmt(i.cost_per_unit)}/{i.unit}</Text></View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[s.stk, i.stock_current <= i.stock_min && i.stock_min > 0 && { color: COLORS.error }]}>{Math.round(i.stock_current)} {i.unit}</Text>
              <TouchableOpacity onPress={() => del(i.id)}><Text>🗑</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Modal visible={modal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}><View style={s.md}>
          <Text style={s.mdT}>{isNew ? 'Nuevo Ingrediente' : 'Editar Ingrediente'}</Text>
          <Text style={s.lb}>Nombre</Text><TextInput style={s.inp} value={ed.name || ''} onChangeText={t => setEd((e: any) => ({ ...e, name: t }))} placeholder="Ej: Salmón fresco" placeholderTextColor={COLORS.textMuted} />
          <Text style={s.lb}>Categoría</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 40 }}>{CATS.map(c => <Chip key={c} label={c} active={ed.category === c} onPress={() => setEd((e: any) => ({ ...e, category: c }))} />)}</ScrollView>
          <Text style={s.lb}>Unidad base</Text><View style={{ flexDirection: 'row', gap: 6 }}>{UNITS.map(u => <Chip key={u} label={u} active={ed.unit === u} onPress={() => setEd((e: any) => ({ ...e, unit: u }))} />)}</View>
          <Text style={s.lb}>Stock actual</Text><TextInput style={s.inp} value={String(ed.stock_current ?? '')} onChangeText={t => setEd((e: any) => ({ ...e, stock_current: t }))} keyboardType="decimal-pad" />
          <Text style={s.lb}>Stock mínimo</Text><TextInput style={s.inp} value={String(ed.stock_min ?? '')} onChangeText={t => setEd((e: any) => ({ ...e, stock_min: t }))} keyboardType="decimal-pad" />
          <Text style={s.lb}>Costo por {ed.unit || 'unidad'}</Text><TextInput style={s.inp} value={String(ed.cost_per_unit ?? '')} onChangeText={t => setEd((e: any) => ({ ...e, cost_per_unit: t }))} keyboardType="decimal-pad" />
          <View style={s.mBs}><TouchableOpacity style={s.bC} onPress={() => setModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity><TouchableOpacity style={s.bOk} onPress={save}><Text style={s.bOkT}>Guardar</Text></TouchableOpacity></View>
        </View></ScrollView></View>
      </Modal>
    </View>
  );
}
function Chip({ label, active, onPress }: any) { return <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: active ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: active ? COLORS.primary : COLORS.border, marginRight: 6 }}><Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#fff' : COLORS.textSecondary }}>{label}</Text></TouchableOpacity>; }
const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background }, hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  back: { color: COLORS.primary, fontSize: 15, fontWeight: '600' }, hdrT: { fontSize: 18, fontWeight: '700', color: COLORS.text }, addBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.primary }, addBtnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
  alert: { backgroundColor: COLORS.error + '15', padding: 12, marginHorizontal: 16, marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.error + '30' }, alertT: { fontSize: 12, fontWeight: '600', color: COLORS.error },
  si: { backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.text }, cnt: { paddingHorizontal: 16, fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginVertical: 3, borderWidth: 1, borderColor: COLORS.border }, rn: { fontSize: 14, fontWeight: '600', color: COLORS.text }, rs: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 }, stk: { fontSize: 14, fontWeight: '700', color: COLORS.success },
  ov: { flex: 1, backgroundColor: COLORS.overlay }, md: { width: '92%' as any, maxWidth: 450, backgroundColor: COLORS.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border }, mdT: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  lb: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginTop: 14 }, inp: { backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text },
  mBs: { flexDirection: 'row', gap: 12, marginTop: 20 }, bC: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }, bCT: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 }, bOk: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' }, bOkT: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
