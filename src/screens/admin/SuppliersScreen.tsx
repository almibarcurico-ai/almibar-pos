// src/screens/admin/SuppliersScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';
import { SearchRow, LB, sh } from './shared';

export default function SuppliersScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [ed, setEd] = useState<any>({});
  const [isNew, setIsNew] = useState(false);

  useEffect(() => { load(); }, []);
  const load = async () => { const { data } = await supabase.from('suppliers').select('*').eq('active', true).order('name'); if (data) setItems(data); };

  const filtered = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));
  const openNew = () => { setEd({ name: '', rut: '', contact_name: '', phone: '', email: '', bank_info: '' }); setIsNew(true); setModal(true); };
  const openEdit = (i: any) => { setEd({ ...i }); setIsNew(false); setModal(true); };

  const save = async () => {
    if (!ed.name?.trim()) { Alert.alert('Error', 'Nombre obligatorio'); return; }
    try {
      const p = { name: ed.name, rut: ed.rut || null, contact_name: ed.contact_name || null, phone: ed.phone || null, email: ed.email || null, bank_info: ed.bank_info || null };
      if (isNew) await supabase.from('suppliers').insert(p);
      else await supabase.from('suppliers').update(p).eq('id', ed.id);
      setModal(false); await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const del = (i: any) => Alert.alert('Eliminar', `¿Eliminar ${i.name}?`, [{ text: 'No' }, { text: 'Sí', style: 'destructive', onPress: async () => { await supabase.from('suppliers').update({ active: false }).eq('id', i.id); await load(); } }]);

  return (
    <View style={sh.c}>
      <SearchRow search={search} setSearch={setSearch} onAdd={openNew} />
      <Text style={sh.count}>{filtered.length} proveedores</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {filtered.map(i => (
          <TouchableOpacity key={i.id} style={sh.row} onPress={() => openEdit(i)}>
            <View style={{ flex: 1 }}>
              <Text style={sh.rowName}>{i.name}</Text>
              <Text style={sh.rowSub}>{i.rut || 'Sin RUT'} • {i.phone || 'Sin teléfono'}</Text>
            </View>
            <TouchableOpacity onPress={() => del(i)}><Text style={{ fontSize: 12 }}>🗑</Text></TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={modal} transparent animationType="fade">
        <View style={sh.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}><View style={sh.md}>
          <Text style={sh.mdT}>{isNew ? 'Nuevo Proveedor' : 'Editar Proveedor'}</Text>
          <LB text="Nombre *" /><TextInput style={sh.inp} value={ed.name || ''} onChangeText={t => setEd((e: any) => ({ ...e, name: t }))} placeholder="Ej: Distribuidora del Mar" placeholderTextColor={COLORS.textMuted} />
          <LB text="RUT" /><TextInput style={sh.inp} value={ed.rut || ''} onChangeText={t => setEd((e: any) => ({ ...e, rut: t }))} placeholder="12.345.678-9" placeholderTextColor={COLORS.textMuted} />
          <LB text="Contacto" /><TextInput style={sh.inp} value={ed.contact_name || ''} onChangeText={t => setEd((e: any) => ({ ...e, contact_name: t }))} placeholder="Nombre contacto" placeholderTextColor={COLORS.textMuted} />
          <LB text="Teléfono" /><TextInput style={sh.inp} value={ed.phone || ''} onChangeText={t => setEd((e: any) => ({ ...e, phone: t }))} placeholder="+56 9 1234 5678" keyboardType="phone-pad" placeholderTextColor={COLORS.textMuted} />
          <LB text="Email" /><TextInput style={sh.inp} value={ed.email || ''} onChangeText={t => setEd((e: any) => ({ ...e, email: t }))} placeholder="email@proveedor.cl" keyboardType="email-address" placeholderTextColor={COLORS.textMuted} />
          <LB text="Datos bancarios" /><TextInput style={[sh.inp, { minHeight: 60 }]} value={ed.bank_info || ''} onChangeText={t => setEd((e: any) => ({ ...e, bank_info: t }))} placeholder="Banco, tipo cuenta, número, RUT" multiline placeholderTextColor={COLORS.textMuted} />
          <View style={sh.mBs}>
            <TouchableOpacity style={sh.bC} onPress={() => setModal(false)}><Text style={sh.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={sh.bOk} onPress={save}><Text style={sh.bOkT}>Guardar</Text></TouchableOpacity>
          </View>
        </View></ScrollView></View>
      </Modal>
    </View>
  );
}
