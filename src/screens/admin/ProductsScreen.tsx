// src/screens/admin/ProductsScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';
import { SearchRow, Chip, LB, fmt, sh } from './shared';

export default function ProductsScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [ed, setEd] = useState<any>({});
  const [isNew, setIsNew] = useState(false);

  useEffect(() => { load(); }, []);
  const load = async () => {
    const { data: p } = await supabase.from('products').select('*').eq('active', true).order('sort_order');
    const { data: c } = await supabase.from('categories').select('*').eq('active', true).order('sort_order');
    if (p) setProducts(p); if (c) setCategories(c);
  };

  const catName = (id: string) => categories.find(c => c.id === id)?.name || '';
  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => { setEd({ name: '', price: 0, category_id: categories[0]?.id || '' }); setIsNew(true); setModal(true); };
  const openEdit = (p: any) => { setEd({ ...p }); setIsNew(false); setModal(true); };

  const save = async () => {
    try {
      if (isNew) await supabase.from('products').insert({ name: ed.name, price: ed.price, category_id: ed.category_id, sort_order: 0 });
      else await supabase.from('products').update({ name: ed.name, price: ed.price, category_id: ed.category_id }).eq('id', ed.id);
      setModal(false); await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  return (
    <View style={sh.c}>
      <SearchRow search={search} setSearch={setSearch} onAdd={openNew} />
      <Text style={sh.count}>{filtered.length} productos</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {filtered.map(p => (
          <TouchableOpacity key={p.id} style={sh.row} onPress={() => openEdit(p)}>
            <View style={{ flex: 1 }}><Text style={sh.rowName}>{p.name}</Text><Text style={sh.rowSub}>{catName(p.category_id)}</Text></View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary }}>{fmt(p.price)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Modal visible={modal} transparent animationType="fade">
        <View style={sh.ov}><View style={sh.md}>
          <Text style={sh.mdT}>{isNew ? 'Nuevo Producto' : 'Editar Producto'}</Text>
          <LB text="Nombre" /><TextInput style={sh.inp} value={ed.name || ''} onChangeText={t => setEd((e: any) => ({ ...e, name: t }))} placeholder="Nombre" placeholderTextColor={COLORS.textMuted} />
          <LB text="Precio" /><TextInput style={sh.inp} value={String(ed.price || '')} onChangeText={t => setEd((e: any) => ({ ...e, price: parseInt(t) || 0 }))} keyboardType="number-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} />
          <LB text="Categoría" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 36 }}>
            {categories.map(c => <Chip key={c.id} label={c.name} active={ed.category_id === c.id} onPress={() => setEd((e: any) => ({ ...e, category_id: c.id }))} />)}
          </ScrollView>
          <View style={sh.mBs}>
            <TouchableOpacity style={sh.bC} onPress={() => setModal(false)}><Text style={sh.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={sh.bOk} onPress={save}><Text style={sh.bOkT}>Guardar</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}
