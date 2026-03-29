import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';

const alert = (t: string, m?: string) => typeof window !== 'undefined' ? window.alert(t + (m ? '\n' + m : '')) : null;
const confirm = (m: string) => typeof window !== 'undefined' ? window.confirm(m) : true;
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

export default function SuppliersScreen() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [modal, setModal] = useState(false);
  const [ed, setEd] = useState<any>({});
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const { data: s } = await supabase.from('suppliers').select('*').eq('active', true).order('name');
    const { data: i } = await supabase.from('ingredients').select('id, name, default_supplier_id').eq('active', true).order('name');
    if (s) setSuppliers(s);
    if (i) setIngredients(i);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = suppliers.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => {
    setEd({ name: '', rut: '', contact_name: '', phone: '', email: '', bank_info: '', notes: '' });
    setIsNew(true); setModal(true);
  };

  const openEdit = (s: any) => { setEd({ ...s }); setIsNew(false); setModal(true); };

  const save = async () => {
    if (!ed.name?.trim()) { alert('Error', 'Ingresa el nombre'); return; }
    const payload = { name: ed.name.trim(), rut: ed.rut?.trim() || null, contact_name: ed.contact_name?.trim() || null, phone: ed.phone?.trim() || null, email: ed.email?.trim() || null, bank_info: ed.bank_info?.trim() || null, notes: ed.notes?.trim() || null };
    if (isNew) await supabase.from('suppliers').insert(payload);
    else await supabase.from('suppliers').update(payload).eq('id', ed.id);
    setModal(false); await load();
  };

  const del = (s: any) => {
    if (!confirm('¿Eliminar "' + s.name + '"?')) return;
    supabase.from('suppliers').update({ active: false }).eq('id', s.id).then(() => { setSelected(null); load(); });
  };

  const supplierIngredients = selected ? ingredients.filter(i => i.default_supplier_id === selected.id) : [];
  const unassigned = ingredients.filter(i => !i.default_supplier_id);

  const assignIngredient = async (ingId: string) => {
    if (!selected) return;
    await supabase.from('ingredients').update({ default_supplier_id: selected.id }).eq('id', ingId);
    await load();
  };

  const unassignIngredient = async (ingId: string) => {
    await supabase.from('ingredients').update({ default_supplier_id: null }).eq('id', ingId);
    await load();
  };

  return (
    <View style={s.wrap}>
      {/* List */}
      <View style={s.list}>
        <View style={s.header}>
          <Text style={s.title}>🚚 Proveedores ({suppliers.length})</Text>
          <TouchableOpacity style={s.btn} onPress={openNew}><Text style={s.btnT}>+ Nuevo</Text></TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
          <TextInput style={s.searchInp} placeholder="Buscar..." placeholderTextColor="#999" value={search} onChangeText={setSearch} />
        </View>
        <ScrollView>
          {filtered.map(sup => {
            const ingCount = ingredients.filter(i => i.default_supplier_id === sup.id).length;
            const isActive = selected?.id === sup.id;
            return (
              <TouchableOpacity key={sup.id} style={[s.row, isActive && s.rowActive]} onPress={() => setSelected(sup)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{sup.name}</Text>
                  <Text style={s.rowSub}>{sup.contact_name || sup.phone || 'Sin contacto'} · {ingCount} ingredientes</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Detail */}
      {selected ? (
        <ScrollView style={s.detail}>
          <View style={s.dHeader}>
            <Text style={s.dTitle}>{selected.name}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => openEdit(selected)}><Text style={{ color: COLORS.primary, fontSize: 13 }}>✏️ Editar</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => del(selected)}><Text style={{ color: '#E53935', fontSize: 13 }}>🗑️</Text></TouchableOpacity>
            </View>
          </View>

          {/* Contact info */}
          <View style={s.dBlock}>
            <Text style={s.dBlockTitle}>Datos de Contacto</Text>
            {selected.rut && <Row label="RUT" value={selected.rut} />}
            {selected.contact_name && <Row label="Contacto" value={selected.contact_name} />}
            {selected.phone && <Row label="Teléfono" value={selected.phone} />}
            {selected.email && <Row label="Email" value={selected.email} />}
            {selected.bank_info && <Row label="Banco" value={selected.bank_info} />}
            {selected.notes && <Row label="Notas" value={selected.notes} />}
          </View>

          {/* Assigned ingredients */}
          <View style={s.dBlock}>
            <Text style={s.dBlockTitle}>Ingredientes asignados ({supplierIngredients.length})</Text>
            {supplierIngredients.map(i => (
              <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
                <Text style={{ flex: 1, fontSize: 13, color: '#2D2D2D' }}>{i.name}</Text>
                <TouchableOpacity onPress={() => unassignIngredient(i.id)}>
                  <Text style={{ fontSize: 11, color: '#E53935' }}>Desvincular</Text>
                </TouchableOpacity>
              </View>
            ))}
            {supplierIngredients.length === 0 && <Text style={{ color: '#999', fontSize: 12 }}>Sin ingredientes asignados</Text>}
          </View>

          {/* Assign unassigned */}
          {unassigned.length > 0 && (
            <View style={s.dBlock}>
              <Text style={s.dBlockTitle}>Asignar ingredientes sin proveedor ({unassigned.length})</Text>
              <ScrollView style={{ maxHeight: 200 }}>
                {unassigned.map(i => (
                  <TouchableOpacity key={i.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }} onPress={() => assignIngredient(i.id)}>
                    <Text style={{ flex: 1, fontSize: 13, color: '#2D2D2D' }}>{i.name}</Text>
                    <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '600' }}>+ Asignar</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={[s.detail, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontSize: 40 }}>🚚</Text>
          <Text style={{ color: '#999', marginTop: 8 }}>Selecciona un proveedor</Text>
        </View>
      )}

      {/* Edit Modal */}
      <Modal visible={modal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}><View style={s.md}>
          <Text style={s.mdT}>{isNew ? '➕ Nuevo Proveedor' : '✏️ ' + (ed.name || '')}</Text>
          <Field label="Nombre *" value={ed.name} onChange={v => setEd((e: any) => ({ ...e, name: v }))} />
          <Field label="RUT" value={ed.rut} onChange={v => setEd((e: any) => ({ ...e, rut: v }))} placeholder="76.123.456-7" />
          <Field label="Contacto" value={ed.contact_name} onChange={v => setEd((e: any) => ({ ...e, contact_name: v }))} />
          <Field label="Teléfono" value={ed.phone} onChange={v => setEd((e: any) => ({ ...e, phone: v }))} />
          <Field label="Email" value={ed.email} onChange={v => setEd((e: any) => ({ ...e, email: v }))} />
          <Field label="Datos bancarios" value={ed.bank_info} onChange={v => setEd((e: any) => ({ ...e, bank_info: v }))} multiline />
          <Field label="Notas" value={ed.notes} onChange={v => setEd((e: any) => ({ ...e, notes: v }))} multiline />
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <TouchableOpacity style={s.bCancel} onPress={() => setModal(false)}><Text style={s.bCancelT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={s.bSave} onPress={save}><Text style={s.bSaveT}>Guardar</Text></TouchableOpacity>
          </View>
        </View></ScrollView></View>
      </Modal>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
      <Text style={{ width: 90, fontSize: 12, color: '#999' }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: '#2D2D2D' }}>{value}</Text>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, multiline }: any) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#999', marginBottom: 4 }}>{label}</Text>
      <TextInput style={{ backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#2D2D2D', ...(multiline ? { minHeight: 60, textAlignVertical: 'top' as any } : {}) }} value={value || ''} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#999" multiline={multiline} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', backgroundColor: '#F5F5F5' },
  list: { width: 320, backgroundColor: '#FFF', borderRightWidth: 1, borderRightColor: '#E0E0E0' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  title: { fontSize: 16, fontWeight: '700', color: '#2D2D2D' },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: COLORS.primary },
  btnT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  searchInp: { backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: '#2D2D2D' },
  row: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  rowActive: { backgroundColor: COLORS.primary + '10', borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  rowName: { fontSize: 14, fontWeight: '700', color: '#2D2D2D' },
  rowSub: { fontSize: 11, color: '#999', marginTop: 2 },
  detail: { flex: 1 },
  dHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  dTitle: { fontSize: 18, fontWeight: '700', color: '#2D2D2D' },
  dBlock: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  dBlockTitle: { fontSize: 14, fontWeight: '700', color: '#2D2D2D', marginBottom: 10 },
  ov: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  md: { width: '92%' as any, maxWidth: 450, backgroundColor: '#FFF', borderRadius: 16, padding: 24 },
  mdT: { fontSize: 18, fontWeight: '700', color: '#2D2D2D', textAlign: 'center', marginBottom: 8 },
  bCancel: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center' },
  bCancelT: { color: '#666', fontWeight: '600', fontSize: 14 },
  bSave: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  bSaveT: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
