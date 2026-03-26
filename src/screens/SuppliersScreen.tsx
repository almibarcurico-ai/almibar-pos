// src/screens/SuppliersScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { COLORS } from '../theme';

export default function SuppliersScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [ed, setEd] = useState<any>({});
  const [isNew, setIsNew] = useState(false);

  useEffect(() => { load(); }, []);
  const load = async () => { const { data } = await supabase.from('suppliers').select('*').eq('active', true).order('name'); if (data) setItems(data); };

  const openNew = () => { setEd({ name: '', rut: '', contact_name: '', phone: '', email: '', bank_info: '' }); setIsNew(true); setModal(true); };
  const openEdit = (i: any) => { setEd({ ...i }); setIsNew(false); setModal(true); };
  const save = async () => {
    if (!ed.name?.trim()) { Alert.alert('Error', 'Ingresa nombre'); return; }
    const p = { name: ed.name, rut: ed.rut, contact_name: ed.contact_name, phone: ed.phone, email: ed.email, bank_info: ed.bank_info };
    if (isNew) await supabase.from('suppliers').insert(p); else await supabase.from('suppliers').update(p).eq('id', ed.id);
    setModal(false); await load();
  };
  const del = (id: string) => Alert.alert('Eliminar', '¿Seguro?', [{ text: 'No' }, { text: 'Sí', style: 'destructive', onPress: async () => { await supabase.from('suppliers').update({ active: false }).eq('id', id); await load(); } }]);

  return (
    <View style={s.c}>
      <View style={s.hdr}><TouchableOpacity onPress={onBack}><Text style={s.back}>← Admin</Text></TouchableOpacity><Text style={s.hdrT}>🚚 Proveedores</Text><TouchableOpacity style={s.addBtn} onPress={openNew}><Text style={s.addBtnT}>+ Nuevo</Text></TouchableOpacity></View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {items.map(i => (
          <TouchableOpacity key={i.id} style={s.row} onPress={() => openEdit(i)}>
            <View style={{ flex: 1 }}><Text style={s.rn}>{i.name}</Text><Text style={s.rs}>{i.rut || 'Sin RUT'} • {i.phone || 'Sin teléfono'}</Text>{i.contact_name ? <Text style={s.rs}>Contacto: {i.contact_name}</Text> : null}</View>
            <TouchableOpacity onPress={() => del(i.id)}><Text>🗑</Text></TouchableOpacity>
          </TouchableOpacity>
        ))}
        {items.length === 0 && <Text style={{ color: COLORS.textMuted, textAlign: 'center', marginTop: 40 }}>Sin proveedores. Agrega uno.</Text>}
      </ScrollView>
      <Modal visible={modal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}><View style={s.md}>
          <Text style={s.mdT}>{isNew ? 'Nuevo Proveedor' : 'Editar Proveedor'}</Text>
          {[['Nombre *', 'name', 'Ej: Distribuidora Sur'], ['RUT', 'rut', '76.123.456-7'], ['Contacto', 'contact_name', 'Nombre contacto'], ['Teléfono', 'phone', '+56 9 1234 5678'], ['Email', 'email', 'proveedor@email.com'], ['Datos bancarios', 'bank_info', 'Banco, cuenta, RUT']].map(([label, key, ph]) => (
            <View key={key as string}><Text style={s.lb}>{label as string}</Text><TextInput style={s.inp} value={ed[key as string] || ''} onChangeText={t => setEd((e: any) => ({ ...e, [key as string]: t }))} placeholder={ph as string} placeholderTextColor={COLORS.textMuted} /></View>
          ))}
          <View style={s.mBs}><TouchableOpacity style={s.bC} onPress={() => setModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity><TouchableOpacity style={s.bOk} onPress={save}><Text style={s.bOkT}>Guardar</Text></TouchableOpacity></View>
        </View></ScrollView></View>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background }, hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  back: { color: COLORS.primary, fontSize: 15, fontWeight: '600' }, hdrT: { fontSize: 18, fontWeight: '700', color: COLORS.text }, addBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.primary }, addBtnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginVertical: 3, borderWidth: 1, borderColor: COLORS.border }, rn: { fontSize: 14, fontWeight: '600', color: COLORS.text }, rs: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  ov: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' }, md: { width: '92%' as any, maxWidth: 450, backgroundColor: COLORS.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border }, mdT: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  lb: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginTop: 12 }, inp: { backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text },
  mBs: { flexDirection: 'row', gap: 12, marginTop: 20 }, bC: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }, bCT: { color: COLORS.textSecondary, fontWeight: '600' }, bOk: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' }, bOkT: { color: '#fff', fontWeight: '700' },
});
