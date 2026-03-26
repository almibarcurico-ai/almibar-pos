// src/screens/TableEditorScreen.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { Sector, Table } from '../types';
import { COLORS } from '../theme';

const { width: SW, height: SH } = Dimensions.get('window');
const CW = SW - 32;
const CH = SH - 280;
const TS = 70;

interface Props { onBack: () => void; }

export default function TableEditorScreen({ onBack }: Props) {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeSector, setActiveSector] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [changed, setChanged] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [newNum, setNewNum] = useState('');
  const [newCap, setNewCap] = useState('4');

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: s } = await supabase.from('sectors').select('*').eq('active', true).order('sort_order');
    if (s && s.length > 0) { setSectors(s); if (!activeSector) setActiveSector(s[0].id); }
    const { data: t } = await supabase.from('tables').select('*').eq('active', true).order('number');
    if (t) setTables(t);
  };

  const st = tables.filter(t => t.sector_id === activeSector);
  const secName = () => sectors.find(s => s.id === activeSector)?.name || '';

  const onPtrDown = (id: string, e: any) => {
    const t = tables.find(x => x.id === id); if (!t) return;
    setDragging(id); setOffset({ x: (e.nativeEvent?.pageX || 0) - t.pos_x, y: (e.nativeEvent?.pageY || 0) - t.pos_y });
  };
  const onPtrMove = (e: any) => {
    if (!dragging) return;
    const nx = Math.max(0, Math.min((e.nativeEvent?.pageX || 0) - offset.x, CW - TS));
    const ny = Math.max(0, Math.min((e.nativeEvent?.pageY || 0) - offset.y, CH - TS));
    setTables(p => p.map(t => t.id === dragging ? { ...t, pos_x: nx, pos_y: ny } : t));
    setChanged(true);
  };
  const onPtrUp = () => { setDragging(null); };

  const save = async () => {
    await Promise.all(st.map(t => supabase.from('tables').update({ pos_x: t.pos_x, pos_y: t.pos_y }).eq('id', t.id)));
    setChanged(false); Alert.alert('✅', 'Posiciones guardadas');
  };

  const addTable = async () => {
    const n = parseInt(newNum); if (!n) { Alert.alert('Error', 'Número inválido'); return; }
    await supabase.from('tables').insert({ sector_id: activeSector, number: n, capacity: parseInt(newCap) || 4, pos_x: Math.random() * (CW - TS), pos_y: Math.random() * (CH - TS), status: 'libre' });
    setAddModal(false); setNewNum(''); setNewCap('4'); await load();
  };

  const delTable = (t: Table) => {
    Alert.alert(`Eliminar Mesa ${t.number}`, '¿Seguro?', [{ text: 'No' }, { text: 'Sí', style: 'destructive', onPress: async () => { await supabase.from('tables').update({ active: false }).eq('id', t.id); await load(); } }]);
  };

  return (
    <View style={s.c}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={onBack}><Text style={s.back}>← Volver</Text></TouchableOpacity>
        <Text style={s.hT}>Editor de Mesas</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.addB} onPress={() => setAddModal(true)}><Text style={s.addBT}>+ Mesa</Text></TouchableOpacity>
          {changed && <TouchableOpacity style={s.saveB} onPress={save}><Text style={s.saveBT}>💾 Guardar</Text></TouchableOpacity>}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 52 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        {sectors.map(sec => <TouchableOpacity key={sec.id} style={[s.tab, activeSector === sec.id && s.tabA]} onPress={() => setActiveSector(sec.id)}><Text style={[s.tabT, activeSector === sec.id && s.tabTA]}>{sec.name} ({tables.filter(t => t.sector_id === sec.id).length})</Text></TouchableOpacity>)}
      </ScrollView>
      <Text style={s.info}>Arrastra las mesas • Sector: {secName()}</Text>

      {/* @ts-ignore */}
      <View style={s.canvas} onPointerMove={onPtrMove} onPointerUp={onPtrUp} onPointerLeave={onPtrUp}>
        {Array.from({ length: Math.floor(CW / 50) }).map((_, i) => <View key={`v${i}`} style={[s.gl, { width: 1, top: 0, bottom: 0, left: (i + 1) * 50 }]} />)}
        {Array.from({ length: Math.floor(CH / 50) }).map((_, i) => <View key={`h${i}`} style={[s.gl, { height: 1, left: 0, right: 0, top: (i + 1) * 50 }]} />)}
        {st.map(t => (
          // @ts-ignore
          <View key={t.id} style={[s.tn, { left: t.pos_x, top: t.pos_y, borderColor: dragging === t.id ? COLORS.primary : COLORS.border }]} onPointerDown={(e: any) => onPtrDown(t.id, e)}>
            <Text style={s.tnN}>{t.number}</Text><Text style={s.tnC}>👤{t.capacity}</Text>
            <TouchableOpacity style={s.tnDel} onPress={() => delTable(t)}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✕</Text></TouchableOpacity>
          </View>
        ))}
        {st.length === 0 && <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.textMuted }}>Sin mesas. Presiona "+ Mesa"</Text></View>}
      </View>

      <Modal visible={addModal} transparent animationType="fade">
        <View style={s.ov}><View style={s.md}>
          <Text style={s.mdT}>Nueva Mesa</Text><Text style={{ fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' }}>Sector: {secName()}</Text>
          <Text style={s.lb}>Número</Text><TextInput style={s.inp} placeholder="26" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" value={newNum} onChangeText={setNewNum} />
          <Text style={s.lb}>Capacidad</Text><TextInput style={s.inp} placeholder="4" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" value={newCap} onChangeText={setNewCap} />
          <View style={s.mBs}><TouchableOpacity style={s.bC} onPress={() => setAddModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity><TouchableOpacity style={s.bOk} onPress={addTable}><Text style={s.bOkT}>Crear</Text></TouchableOpacity></View>
        </View></View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  back: { color: COLORS.primary, fontSize: 15, fontWeight: '600' }, hT: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  addB: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.primary }, addBT: { color: '#fff', fontSize: 13, fontWeight: '600' },
  saveB: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.success }, saveBT: { color: '#fff', fontSize: 13, fontWeight: '600' },
  tab: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 }, tabA: { backgroundColor: COLORS.primary, borderColor: COLORS.primary }, tabT: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary }, tabTA: { color: COLORS.text },
  info: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 8 },
  canvas: { flex: 1, marginHorizontal: 16, marginBottom: 16, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', position: 'relative' },
  gl: { position: 'absolute', backgroundColor: COLORS.border + '30' },
  tn: { position: 'absolute', width: TS, height: TS, borderRadius: 10, borderWidth: 2, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  tnN: { fontSize: 22, fontWeight: '800', color: COLORS.text }, tnC: { fontSize: 10, color: COLORS.textMuted },
  tnDel: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center' },
  ov: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' },
  md: { width: SW * 0.85, maxWidth: 400, backgroundColor: COLORS.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border },
  mdT: { fontSize: 22, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  lb: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginTop: 16 },
  inp: { backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: COLORS.text },
  mBs: { flexDirection: 'row', gap: 12, marginTop: 24 }, bC: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }, bCT: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 }, bOk: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' }, bOkT: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
