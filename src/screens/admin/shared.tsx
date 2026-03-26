// src/screens/admin/shared.tsx
import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { COLORS } from '../../theme';

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[sh.chip, active && sh.chipA]}>
      <Text style={[sh.chipT, active && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function LB({ text }: { text: string }) {
  return <Text style={sh.lb}>{text}</Text>;
}

export function SearchRow({ search, setSearch, onAdd, addLabel }: { search: string; setSearch: (s: string) => void; onAdd: () => void; addLabel?: string }) {
  return (
    <View style={sh.searchRow}>
      <TextInput style={sh.searchInp} placeholder="🔍 Buscar..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} />
      <TouchableOpacity style={sh.addBtn} onPress={onAdd}><Text style={sh.addBtnT}>{addLabel || '+ Nuevo'}</Text></TouchableOpacity>
    </View>
  );
}

export const fmt = (p: number) => '$' + Math.round(p).toLocaleString('es-CL');

export const sh = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background },
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  searchInp: { flex: 1, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.text },
  addBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.primary, justifyContent: 'center' },
  addBtnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
  count: { paddingHorizontal: 16, fontSize: 12, color: COLORS.textMuted, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginVertical: 3, borderWidth: 1, borderColor: COLORS.border, gap: 10 },
  rowName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  rowSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, marginRight: 6 },
  chipA: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipT: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  lb: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginTop: 14 },
  ov: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' },
  md: { width: '92%' as any, maxWidth: 480, backgroundColor: COLORS.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border },
  mdT: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  inp: { backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text },
  mBs: { flexDirection: 'row', gap: 12, marginTop: 20 },
  bC: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  bCT: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },
  bOk: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  bOkT: { color: '#fff', fontWeight: '700', fontSize: 15 },
  stockVal: { fontSize: 14, fontWeight: '700', color: COLORS.text },
});
