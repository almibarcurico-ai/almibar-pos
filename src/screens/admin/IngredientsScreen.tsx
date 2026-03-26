// src/screens/admin/IngredientsScreen.tsx

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';

const CATS = ['Carnes','Pescados','Mariscos','Lácteos','Verduras','Frutas','Licores','Cervezas','Destilados','Insumos','Especias','Otros'];
const UNITS = ['gr','kg','ml','lt','unidad'];

interface Props { onBack: () => void }

export default function IngredientsScreen({ onBack }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [modal, setModal] = useState(false);
  const [ed, setEd] = useState<any>({});
  const [isNew, setIsNew] = useState(false);

  useEffect(() => { load() }, []);

  const load = async () => {
    const { data } = await supabase.from('ingredients').select('*').eq('active', true).order('name');
    if (data) setItems(data);
  };

  const fmt = (p: number) => '$' + Math.round(p).toLocaleString('es-CL');

  const filtered = items.filter(i => {
    const ms = !search || i.name.toLowerCase().includes(search.toLowerCase());
    const mc = filterCat === 'all' || i.category === filterCat;
    return ms && mc;
  });

  const lowStock = items.filter(i => i.stock_current <= i.stock_min && i.stock_min > 0);

  const openNew = () => { setEd({ name:'', unit:'gr', stock_current:0, stock_min:0, cost_per_unit:0, category:'Otros' }); setIsNew(true); setModal(true); };
  const openEdit = (i: any) => { setEd({...i}); setIsNew(false); setModal(true); };

  const save = async () => {
    if (!ed.name?.trim()) { Alert.alert('Error','Ingresa un nombre'); return; }
    const payload = { name: ed.name.trim(), unit: ed.unit, stock_current: parseFloat(ed.stock_current)||0, stock_min: parseFloat(ed.stock_min)||0, cost_per_unit: parseFloat(ed.cost_per_unit)||0, category: ed.category };
    try {
      if (isNew) { const { error } = await supabase.from('ingredients').insert(payload); if (error) throw error; }
      else { const { error } = await supabase.from('ingredients').update(payload).eq('id', ed.id); if (error) throw error; }
      setModal(false); await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const del = (i: any) => Alert.alert(`Eliminar ${i.name}`, '¿Seguro?', [{ text:'No' }, { text:'Sí', style:'destructive', onPress: async () => { await supabase.from('ingredients').update({ active: false }).eq('id', i.id); await load(); }}]);

  const [importModal, setImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const fileInputRef = useRef<any>(null);

  // EXPORT CSV
  const exportCSV = () => {
    const header = 'nombre,unidad,stock_actual,stock_minimo,costo_por_unidad,categoria';
    const rows = items.map(i => `${i.name},${i.unit},${i.stock_current},${i.stock_min},${i.cost_per_unit},${i.category}`);
    const csv = [header, ...rows].join('\n');

    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ingredientes_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      Alert.alert('✅', `${items.length} ingredientes exportados`);
    } else {
      Alert.alert('CSV', csv);
    }
  };

  // IMPORT CSV
  const handleFileSelect = (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setImportText(text);
      setImportModal(true);
    };
    reader.readAsText(file);
  };

  const openImport = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      setImportText('');
      setImportModal(true);
    }
  };

  const processImport = async () => {
    if (!importText.trim()) { Alert.alert('Error', 'Sin datos para importar'); return; }
    try {
      const lines = importText.trim().split('\n');
      // Skip header if present
      const startIdx = lines[0].toLowerCase().includes('nombre') ? 1 : 0;
      let count = 0;

      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length < 2 || !cols[0]) continue;

        const payload = {
          name: cols[0],
          unit: UNITS.includes(cols[1]) ? cols[1] : 'gr',
          stock_current: parseFloat(cols[2]) || 0,
          stock_min: parseFloat(cols[3]) || 0,
          cost_per_unit: parseFloat(cols[4]) || 0,
          category: cols[5] && CATS.includes(cols[5]) ? cols[5] : 'Otros',
        };

        // Check if exists (update) or new (insert)
        const existing = items.find(x => x.name.toLowerCase() === payload.name.toLowerCase());
        if (existing) {
          await supabase.from('ingredients').update(payload).eq('id', existing.id);
        } else {
          await supabase.from('ingredients').insert(payload);
        }
        count++;
      }

      setImportModal(false);
      setImportText('');
      Alert.alert('✅ Importación completa', `${count} ingredientes procesados`);
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  return (
    <View style={s.c}>
      {/* Hidden file input for web */}
      {Platform.OS === 'web' && (
        // @ts-ignore
        <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileSelect} style={{ display: 'none' }} />
      )}

      <View style={s.hdr}>
        <TouchableOpacity onPress={onBack}><Text style={s.back}>← Volver</Text></TouchableOpacity>
        <Text style={s.hdrT}>🥩 Ingredientes</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={[s.addBtn, { backgroundColor: COLORS.info }]} onPress={openImport}><Text style={s.addBtnT}>📥</Text></TouchableOpacity>
          <TouchableOpacity style={[s.addBtn, { backgroundColor: COLORS.success }]} onPress={exportCSV}><Text style={s.addBtnT}>📤</Text></TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={openNew}><Text style={s.addBtnT}>+</Text></TouchableOpacity>
        </View>
      </View>

      {lowStock.length > 0 && (
        <View style={s.alert}>
          <Text style={s.alertT}>⚠️ {lowStock.length} con stock bajo</Text>
          <Text style={s.alertS}>{lowStock.map(i=>i.name).join(', ')}</Text>
        </View>
      )}

      <View style={{ paddingHorizontal:16, paddingVertical:10 }}>
        <TextInput style={s.si} placeholder="🔍 Buscar ingrediente..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight:40, marginBottom:8 }} contentContainerStyle={{ paddingHorizontal:12 }}>
        <Chip label="Todos" active={filterCat==='all'} onPress={()=>setFilterCat('all')} />
        {CATS.map(c => <Chip key={c} label={c} active={filterCat===c} onPress={()=>setFilterCat(c)} />)}
      </ScrollView>

      <Text style={s.cnt}>{filtered.length} ingredientes</Text>

      <ScrollView contentContainerStyle={{ paddingHorizontal:16, paddingBottom:100 }}>
        {filtered.map(i => (
          <TouchableOpacity key={i.id} style={s.row} onPress={()=>openEdit(i)}>
            <View style={{ flex:1 }}>
              <Text style={s.rn}>{i.name}</Text>
              <Text style={s.rs}>{i.category} • {i.unit} • Costo: {fmt(i.cost_per_unit)}/{i.unit}</Text>
            </View>
            <View style={{ alignItems:'flex-end', gap:4 }}>
              <Text style={[s.sv, i.stock_current <= i.stock_min && i.stock_min > 0 && { color: COLORS.error }]}>
                {Math.round(i.stock_current)} {i.unit}
              </Text>
              <TouchableOpacity onPress={()=>del(i)}><Text style={{fontSize:12}}>🗑</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={modal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow:1, justifyContent:'center', alignItems:'center', padding:16 }}><View style={s.md}>
          <Text style={s.mdT}>{isNew ? 'Nuevo Ingrediente' : 'Editar Ingrediente'}</Text>

          <Text style={s.lb}>Nombre</Text>
          <TextInput style={s.inp} value={ed.name||''} onChangeText={t=>setEd((e:any)=>({...e,name:t}))} placeholder="Ej: Salmón fresco" placeholderTextColor={COLORS.textMuted} />

          <Text style={s.lb}>Categoría</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight:40 }}>
            {CATS.map(c => <Chip key={c} label={c} active={ed.category===c} onPress={()=>setEd((e:any)=>({...e,category:c}))} />)}
          </ScrollView>

          <Text style={s.lb}>Unidad base</Text>
          <View style={{ flexDirection:'row', gap:6 }}>
            {UNITS.map(u => <Chip key={u} label={u} active={ed.unit===u} onPress={()=>setEd((e:any)=>({...e,unit:u}))} />)}
          </View>

          <Text style={s.lb}>Stock actual ({ed.unit||'unidad'})</Text>
          <TextInput style={s.inp} value={String(ed.stock_current||'')} onChangeText={t=>setEd((e:any)=>({...e,stock_current:t}))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} />

          <Text style={s.lb}>Stock mínimo (alerta)</Text>
          <TextInput style={s.inp} value={String(ed.stock_min||'')} onChangeText={t=>setEd((e:any)=>({...e,stock_min:t}))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} />

          <Text style={s.lb}>Costo por {ed.unit||'unidad'}</Text>
          <TextInput style={s.inp} value={String(ed.cost_per_unit||'')} onChangeText={t=>setEd((e:any)=>({...e,cost_per_unit:t}))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} />

          <View style={s.mBs}>
            <TouchableOpacity style={s.bC} onPress={()=>setModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={s.bOk} onPress={save}><Text style={s.bOkT}>Guardar</Text></TouchableOpacity>
          </View>
        </View></ScrollView></View>
      </Modal>

      {/* Import Modal */}
      <Modal visible={importModal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow:1, justifyContent:'center', alignItems:'center', padding:16 }}><View style={s.md}>
          <Text style={s.mdT}>📥 Importar Ingredientes</Text>
          <Text style={{ fontSize:12, color:COLORS.textSecondary, textAlign:'center', marginTop:4 }}>Formato CSV: nombre,unidad,stock_actual,stock_minimo,costo_por_unidad,categoria</Text>
          <Text style={{ fontSize:11, color:COLORS.textMuted, textAlign:'center', marginTop:4 }}>Unidades: gr, kg, ml, lt, unidad</Text>
          <Text style={{ fontSize:11, color:COLORS.textMuted, textAlign:'center' }}>Categorías: Carnes, Pescados, Mariscos, Lácteos, Verduras, Frutas, Licores, etc.</Text>

          <Text style={s.lb}>Datos CSV</Text>
          <TextInput
            style={[s.inp, { minHeight:120, textAlignVertical:'top' }]}
            value={importText}
            onChangeText={setImportText}
            placeholder={"Salmón,gr,5000,1000,15,Pescados\nQueso mozzarella,gr,3000,500,8,Lácteos"}
            placeholderTextColor={COLORS.textMuted}
            multiline
          />

          {importText.trim() && (
            <Text style={{ fontSize:12, color:COLORS.info, marginTop:8 }}>
              {importText.trim().split('\n').filter(l => l.trim()).length} líneas detectadas
            </Text>
          )}

          <View style={s.mBs}>
            <TouchableOpacity style={s.bC} onPress={() => { setImportModal(false); setImportText(''); }}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={s.bOk} onPress={processImport}><Text style={s.bOkT}>Importar</Text></TouchableOpacity>
          </View>
        </View></ScrollView></View>
      </Modal>
    </View>
  );
}

function Chip({ label, active, onPress }: { label:string; active:boolean; onPress:()=>void }) {
  return <TouchableOpacity style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:14, backgroundColor:active?COLORS.primary:COLORS.card, borderWidth:1, borderColor:active?COLORS.primary:COLORS.border, marginRight:6 }} onPress={onPress}><Text style={{ fontSize:12, fontWeight:'600', color:active?'#fff':COLORS.textSecondary }}>{label}</Text></TouchableOpacity>;
}

const s = StyleSheet.create({
  c:{flex:1,backgroundColor:COLORS.background},
  hdr:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:16,paddingTop:50,paddingBottom:12,backgroundColor:COLORS.card,borderBottomWidth:1,borderBottomColor:COLORS.border},
  back:{color:COLORS.primary,fontSize:15,fontWeight:'600'},hdrT:{fontSize:18,fontWeight:'700',color:COLORS.text},
  addBtn:{paddingHorizontal:14,paddingVertical:8,borderRadius:8,backgroundColor:COLORS.primary},addBtnT:{color:'#fff',fontWeight:'700',fontSize:13},
  alert:{backgroundColor:COLORS.error+'15',padding:12,marginHorizontal:16,marginTop:10,borderRadius:10,borderWidth:1,borderColor:COLORS.error+'30'},
  alertT:{fontSize:13,fontWeight:'700',color:COLORS.error},alertS:{fontSize:11,color:COLORS.textSecondary,marginTop:2},
  si:{backgroundColor:COLORS.card,borderRadius:10,borderWidth:1,borderColor:COLORS.border,paddingHorizontal:14,paddingVertical:10,fontSize:14,color:COLORS.text},
  cnt:{paddingHorizontal:16,fontSize:12,color:COLORS.textMuted,marginBottom:8},
  row:{flexDirection:'row',alignItems:'center',backgroundColor:COLORS.card,borderRadius:10,padding:14,marginVertical:3,borderWidth:1,borderColor:COLORS.border},
  rn:{fontSize:14,fontWeight:'600',color:COLORS.text},rs:{fontSize:11,color:COLORS.textMuted,marginTop:2},
  sv:{fontSize:14,fontWeight:'700',color:COLORS.success},
  ov:{flex:1,backgroundColor:COLORS.overlay},
  md:{width:'92%' as any,maxWidth:450,backgroundColor:COLORS.card,borderRadius:16,padding:24,borderWidth:1,borderColor:COLORS.border},
  mdT:{fontSize:20,fontWeight:'700',color:COLORS.text,textAlign:'center',marginBottom:8},
  lb:{fontSize:13,color:COLORS.textSecondary,marginBottom:6,marginTop:14},
  inp:{backgroundColor:COLORS.background,borderRadius:10,borderWidth:1,borderColor:COLORS.border,paddingHorizontal:14,paddingVertical:12,fontSize:15,color:COLORS.text},
  mBs:{flexDirection:'row',gap:12,marginTop:20},
  bC:{flex:1,paddingVertical:14,borderRadius:10,borderWidth:1,borderColor:COLORS.border,alignItems:'center'},bCT:{color:COLORS.textSecondary,fontWeight:'600',fontSize:15},
  bOk:{flex:1,paddingVertical:14,borderRadius:10,backgroundColor:COLORS.primary,alignItems:'center'},bOkT:{color:'#fff',fontWeight:'700',fontSize:15},
});
