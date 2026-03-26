import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { COLORS } from '../theme';
interface Props { onBack: () => void; }
export default function ProductsScreen({ onBack }: Props) {
  const [products, setProducts] = useState<any[]>([]); const [categories, setCategories] = useState<any[]>([]); const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false); const [ed, setEd] = useState<any>({}); const [isNew, setIsNew] = useState(false);
  useEffect(() => { load(); }, []);
  const load = async () => {
    const { data: p } = await supabase.from('products').select('*').eq('active', true).order('sort_order');
    const { data: c } = await supabase.from('categories').select('*').eq('active', true).order('sort_order');
    if (p) setProducts(p); if (c) setCategories(c);
  };
  const fmt = (p: number) => '$' + p.toLocaleString('es-CL');
  const catName = (id: string) => categories.find(c => c.id === id)?.name || '';
  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const openNew = () => { setEd({ name:'', price:0, category_id:categories[0]?.id||'' }); setIsNew(true); setModal(true); };
  const openEdit = (p: any) => { setEd({...p}); setIsNew(false); setModal(true); };
  const save = async () => {
    if (isNew) await supabase.from('products').insert({ name:ed.name, price:ed.price, category_id:ed.category_id, sort_order:0, tags:[] });
    else await supabase.from('products').update({ name:ed.name, price:ed.price, category_id:ed.category_id }).eq('id', ed.id);
    setModal(false); await load();
  };
  const del = async (id: string) => { await supabase.from('products').update({ active: false }).eq('id', id); await load(); };
  return (
    <View style={s.c}>
      <View style={s.hdr}><TouchableOpacity onPress={onBack}><Text style={s.back}>← Admin</Text></TouchableOpacity><Text style={s.hdrT}>🍕 Productos</Text><TouchableOpacity style={s.addBtn} onPress={openNew}><Text style={s.addBtnT}>+ Nuevo</Text></TouchableOpacity></View>
      <View style={{paddingHorizontal:16,paddingVertical:10}}><TextInput style={s.si} placeholder="🔍 Buscar..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} /></View>
      <Text style={{paddingHorizontal:16,fontSize:12,color:COLORS.textMuted,marginBottom:8}}>{filtered.length} productos</Text>
      <ScrollView contentContainerStyle={{paddingHorizontal:16,paddingBottom:100}}>
        {filtered.map(p => <TouchableOpacity key={p.id} style={s.row} onPress={()=>openEdit(p)}>
          <View style={{flex:1}}><Text style={s.rn}>{p.name}</Text><Text style={s.rs}>{catName(p.category_id)}</Text></View>
          <Text style={{fontSize:14,fontWeight:'700',color:COLORS.primary}}>{fmt(p.price)}</Text>
          <TouchableOpacity onPress={()=>del(p.id)}><Text>🗑</Text></TouchableOpacity>
        </TouchableOpacity>)}
      </ScrollView>
      <Modal visible={modal} transparent animationType="fade"><View style={s.ov}><View style={s.md}>
        <Text style={s.mdT}>{isNew?'Nuevo':'Editar'} Producto</Text>
        <Text style={s.lb}>Nombre</Text><TextInput style={s.inp} value={ed.name||''} onChangeText={t=>setEd((e:any)=>({...e,name:t}))} placeholderTextColor={COLORS.textMuted} />
        <Text style={s.lb}>Precio</Text><TextInput style={s.inp} value={String(ed.price||'')} onChangeText={t=>setEd((e:any)=>({...e,price:parseInt(t)||0}))} keyboardType="number-pad" placeholderTextColor={COLORS.textMuted} />
        <Text style={s.lb}>Categoría</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{maxHeight:40}}>
          {categories.map(c=><TouchableOpacity key={c.id} style={{paddingHorizontal:12,paddingVertical:6,borderRadius:14,backgroundColor:ed.category_id===c.id?COLORS.primary:COLORS.card,borderWidth:1,borderColor:ed.category_id===c.id?COLORS.primary:COLORS.border,marginRight:6}} onPress={()=>setEd((e:any)=>({...e,category_id:c.id}))}><Text style={{fontSize:12,fontWeight:'600',color:ed.category_id===c.id?'#fff':COLORS.textSecondary}}>{c.name}</Text></TouchableOpacity>)}
        </ScrollView>
        <View style={s.btns}><TouchableOpacity style={s.bC} onPress={()=>setModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity><TouchableOpacity style={s.bOk} onPress={save}><Text style={s.bOkT}>Guardar</Text></TouchableOpacity></View>
      </View></View></Modal>
    </View>
  );
}
const s=StyleSheet.create({c:{flex:1,backgroundColor:COLORS.background},hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:50,paddingBottom:12,backgroundColor:COLORS.card,borderBottomWidth:1,borderBottomColor:COLORS.border},back:{color:COLORS.primary,fontSize:15,fontWeight:'600'},hdrT:{fontSize:18,fontWeight:'700',color:COLORS.text},addBtn:{paddingHorizontal:14,paddingVertical:8,borderRadius:8,backgroundColor:COLORS.primary},addBtnT:{color:'#fff',fontSize:13,fontWeight:'600'},si:{backgroundColor:COLORS.card,borderRadius:10,borderWidth:1,borderColor:COLORS.border,paddingHorizontal:14,paddingVertical:10,fontSize:14,color:COLORS.text},row:{flexDirection:'row',alignItems:'center',backgroundColor:COLORS.card,borderRadius:10,padding:14,marginVertical:3,borderWidth:1,borderColor:COLORS.border,gap:10},rn:{fontSize:14,fontWeight:'600',color:COLORS.text},rs:{fontSize:11,color:COLORS.textMuted,marginTop:2},ov:{flex:1,backgroundColor:COLORS.overlay,justifyContent:'center',alignItems:'center'},md:{width:'92%' as any,maxWidth:450,backgroundColor:COLORS.card,borderRadius:16,padding:24,borderWidth:1,borderColor:COLORS.border},mdT:{fontSize:20,fontWeight:'700',color:COLORS.text,textAlign:'center'},lb:{fontSize:13,color:COLORS.textSecondary,marginBottom:6,marginTop:14},inp:{backgroundColor:COLORS.background,borderRadius:10,borderWidth:1,borderColor:COLORS.border,paddingHorizontal:14,paddingVertical:12,fontSize:15,color:COLORS.text},btns:{flexDirection:'row',gap:12,marginTop:20},bC:{flex:1,paddingVertical:14,borderRadius:10,borderWidth:1,borderColor:COLORS.border,alignItems:'center'},bCT:{color:COLORS.textSecondary,fontWeight:'600',fontSize:15},bOk:{flex:1,paddingVertical:14,borderRadius:10,backgroundColor:COLORS.primary,alignItems:'center'},bOkT:{color:'#fff',fontWeight:'700',fontSize:15}});
