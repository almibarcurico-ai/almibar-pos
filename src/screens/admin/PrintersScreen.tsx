import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';
import { sendToPrinter, generateComanda, PRINTER_CONFIG } from '../../lib/printService';

export default function PrintersScreen() {
  const [printers, setPrinters] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [catPrinter, setCatPrinter] = useState<any[]>([]);
  const [selected, setSelected] = useState<any|null>(null);
  const [editName, setEditName] = useState('');
  const [editStation, setEditStation] = useState('cocina');
  const [editType, setEditType] = useState('ethernet');
  const [editIp, setEditIp] = useState('');
  const [editPort, setEditPort] = useState('9100');
  const [isNew, setIsNew] = useState(false);

  const load = useCallback(async () => {
    const [pR, cR, cpR] = await Promise.all([
      supabase.from('printers').select('*').eq('active', true).order('name'),
      supabase.from('categories').select('*').eq('active', true).order('sort_order'),
      supabase.from('category_printer').select('*'),
    ]);
    if (pR.data) setPrinters(pR.data);
    if (cR.data) setCategories(cR.data);
    if (cpR.data) setCatPrinter(cpR.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectPrinter = (p: any) => {
    setSelected(p); setEditName(p.name); setEditStation(p.station || 'cocina');
    setEditType(p.type || 'ethernet'); setEditIp(p.ip_address || ''); setEditPort(String(p.port || 9100));
    setIsNew(false);
  };

  const openNew = () => {
    setSelected({ id: null }); setEditName(''); setEditStation('cocina');
    setEditType('ethernet'); setEditIp(''); setEditPort('9100'); setIsNew(true);
  };

  const save = async () => {
    if (!editName.trim()) return;
    const data = { name: editName.trim(), station: editStation, type: editType, ip_address: editIp.trim() || null, port: parseInt(editPort) || 9100 };
    if (isNew) {
      const { data: d } = await supabase.from('printers').insert(data).select('*').single();
      if (d) { setSelected(d); setIsNew(false); }
    } else {
      await supabase.from('printers').update(data).eq('id', selected.id);
    }
    await load();
  };

  const deletePrinter = async () => {
    if (!selected?.id) return;
    const ok = typeof window !== 'undefined' ? window.confirm('¿Eliminar "' + editName + '"?') : true;
    if (!ok) return;
    await supabase.from('printers').update({ active: false }).eq('id', selected.id);
    setSelected(null); await load();
  };

  const toggleCategory = async (catId: string) => {
    if (!selected?.id) return;
    const existing = catPrinter.find(cp => cp.category_id === catId && cp.printer_id === selected.id);
    if (existing) {
      await supabase.from('category_printer').delete().eq('id', existing.id);
    } else {
      await supabase.from('category_printer').insert({ category_id: catId, printer_id: selected.id });
    }
    await load();
  };

  const printerCats = selected?.id ? catPrinter.filter(cp => cp.printer_id === selected.id).map(cp => cp.category_id) : [];

  const testPrint = async () => {
    const override = PRINTER_CONFIG[editStation];
    const ip = override?.ip || editIp;
    const port = override?.port || parseInt(editPort) || 9100;
    if (!ip) { Alert.alert('', 'Ingresa la IP de la impresora'); return; }

    const ticket = generateComanda({
      table: 'TEST',
      waiter: 'Sistema',
      station: editStation,
      items: [
        { name: 'Prueba de impresion', qty: 1 },
        { name: 'Segundo item', qty: 2, notes: 'Con nota' },
      ],
      orderNumber: 0,
    });

    const success = await sendToPrinter(ip, port, ticket, editName);
    Alert.alert(
      success ? '✅ Impreso' : '❌ Error',
      success ? `Ticket enviado a ${editName} (${ip}:${port})` : `No se pudo imprimir en ${ip}:${port}. Verifica que el print-server esté corriendo.`
    );
  };

  const STATIONS = [
    { id: 'cocina', label: '🔥 Cocina', color: '#E53935' },
    { id: 'barra', label: '🍹 Barra', color: '#4CAF50' },
    { id: 'caja', label: '💰 Caja', color: '#42A5F5' },
  ];

  const TYPES = [
    { id: 'ethernet', label: '🌐 Red (Ethernet)' },
    { id: 'usb', label: '🔌 USB' },
  ];

  // Group categories by section
  const SECTIONS = [
    { label: 'COCINA', ids: ['d0000000-0000-0000-0000-000000000050','d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000051','d0000000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-000000000006','d0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000007'] },
    { label: 'BARRA', ids: ['d0000000-0000-0000-0000-000000000014','d0000000-0000-0000-0000-000000000052','d0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000017','d0000000-0000-0000-0000-000000000018','d0000000-0000-0000-0000-000000000019','d0000000-0000-0000-0000-000000000020','d0000000-0000-0000-0000-000000000021','d0000000-0000-0000-0000-000000000022','d0000000-0000-0000-0000-000000000015','d0000000-0000-0000-0000-000000000023','d0000000-0000-0000-0000-000000000024','d0000000-0000-0000-0000-000000000025','d0000000-0000-0000-0000-000000000026','d0000000-0000-0000-0000-000000000027','d0000000-0000-0000-0000-000000000028','d0000000-0000-0000-0000-000000000029','d0000000-0000-0000-0000-000000000011','d0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000013','d0000000-0000-0000-0000-000000000010','d0000000-0000-0000-0000-000000000030'] },
    { label: 'OTROS', ids: ['d0000000-0000-0000-0000-000000000040','d0000000-0000-0000-0000-000000000041'] },
  ];

  return (
    <View style={s.wrap}>
      {/* Printer list */}
      <View style={s.list}>
        <View style={s.toolbar}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>🖨️ Impresoras</Text>
          <TouchableOpacity style={s.addBtn} onPress={openNew}><Text style={s.addBtnT}>+ Nueva</Text></TouchableOpacity>
        </View>
        <ScrollView>
          {printers.map(p => {
            const st = STATIONS.find(x => x.id === p.station);
            const catCount = catPrinter.filter(cp => cp.printer_id === p.id).length;
            const isActive = selected?.id === p.id;
            return (
              <TouchableOpacity key={p.id} style={[s.row, isActive && s.rowActive]} onPress={() => selectPrinter(p)}>
                <View style={[s.stationDot, { backgroundColor: st?.color || '#999' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{p.name}</Text>
                  <Text style={s.rowSub}>
                    {st?.label || p.station} · {p.type === 'ethernet' ? (p.ip_address || 'Sin IP') : 'USB'} · {catCount} categorías
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Detail panel */}
      {selected ? (
        <ScrollView style={s.detail}>
          <View style={s.dHeader}>
            <Text style={s.dTitle}>{isNew ? 'Nueva Impresora' : editName}</Text>
            {!isNew && <TouchableOpacity onPress={deletePrinter}><Text style={{ color: COLORS.error }}>🗑️</Text></TouchableOpacity>}
          </View>

          {/* Config */}
          <View style={s.dBlock}>
            <Text style={s.dBlockTitle}>Configuración</Text>
            <Text style={s.fLabel}>Nombre</Text>
            <TextInput style={s.fInput} value={editName} onChangeText={setEditName} placeholder="Ej: Cocina principal" placeholderTextColor={COLORS.textMuted} />

            <Text style={s.fLabel}>Estación</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              {STATIONS.map(st => (
                <TouchableOpacity key={st.id} style={[s.chip, editStation === st.id && { backgroundColor: st.color, borderColor: st.color }]} onPress={() => setEditStation(st.id)}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: editStation === st.id ? '#fff' : COLORS.text }}>{st.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fLabel}>Conexión</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              {TYPES.map(t => (
                <TouchableOpacity key={t.id} style={[s.chip, editType === t.id && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]} onPress={() => setEditType(t.id)}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: editType === t.id ? '#fff' : COLORS.text }}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {editType === 'ethernet' && (
              <>
                <Text style={s.fLabel}>IP Address</Text>
                <TextInput style={s.fInput} value={editIp} onChangeText={setEditIp} placeholder="192.168.1.100" placeholderTextColor={COLORS.textMuted} />
                <Text style={s.fLabel}>Puerto</Text>
                <TextInput style={s.fInput} value={editPort} onChangeText={setEditPort} placeholder="9100" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" />
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={s.saveBtn} onPress={save}><Text style={s.saveBtnT}>Guardar</Text></TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: COLORS.info }]} onPress={testPrint}><Text style={s.saveBtnT}>🖨️ Test</Text></TouchableOpacity>
            </View>
          </View>

          {/* Categories assignment */}
          {!isNew && selected.id && (
            <View style={s.dBlock}>
              <Text style={s.dBlockTitle}>Categorías asignadas</Text>
              <Text style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10 }}>Los productos de estas categorías se imprimirán en esta impresora</Text>
              {SECTIONS.map(sec => (
                <View key={sec.label}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.primary, letterSpacing: 1.5, marginTop: 8, marginBottom: 4 }}>{sec.label}</Text>
                  {sec.ids.map(catId => {
                    const cat = categories.find(c => c.id === catId);
                    if (!cat) return null;
                    const isLinked = printerCats.includes(catId);
                    return (
                      <TouchableOpacity key={catId} style={[s.catRow, isLinked && s.catRowActive]} onPress={() => toggleCategory(catId)}>
                        <Text style={{ fontSize: 14 }}>{isLinked ? '✅' : '⬜'}</Text>
                        <Text style={{ fontSize: 13, color: COLORS.text, flex: 1 }}>{cat.name}</Text>
                        {/* Show other printers this cat prints to */}
                        {catPrinter.filter(cp => cp.category_id === catId && cp.printer_id !== selected.id).map(cp => {
                          const otherP = printers.find(p => p.id === cp.printer_id);
                          return otherP ? <Text key={cp.id} style={{ fontSize: 9, color: COLORS.textMuted, backgroundColor: COLORS.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>+{otherP.name}</Text> : null;
                        })}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={[s.detail, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontSize: 40 }}>🖨️</Text>
          <Text style={{ color: COLORS.textMuted, marginTop: 8 }}>Selecciona una impresora</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.background },
  list: { width: 280, backgroundColor: COLORS.card, borderRightWidth: 1, borderRightColor: COLORS.border },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  addBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  addBtnT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10 },
  rowActive: { backgroundColor: COLORS.primary + '15', borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  rowName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  rowSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  stationDot: { width: 12, height: 12, borderRadius: 6 },
  detail: { flex: 1 },
  dHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  dBlock: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dBlockTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  fLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4, marginTop: 8 },
  fInput: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: COLORS.text },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  saveBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 },
  saveBtnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
  catRow: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  catRowActive: { backgroundColor: COLORS.success + '10' },
});
