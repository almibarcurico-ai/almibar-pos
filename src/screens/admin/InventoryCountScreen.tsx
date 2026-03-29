import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../theme';
import * as XLSX from 'xlsx';

const alert = (t: string, m?: string) => typeof window !== 'undefined' ? window.alert(t + (m ? '\n' + m : '')) : null;
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

export default function InventoryCountScreen() {
  const { user } = useAuth();
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [counts, setCounts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [countItems, setCountItems] = useState<any[]>([]);
  const [diffModal, setDiffModal] = useState(false);
  const [diffRows, setDiffRows] = useState<any[]>([]);
  const [pendingCountId, setPendingCountId] = useState<string | null>(null);
  const fileRef = useRef<any>(null);

  const load = useCallback(async () => {
    const { data: i } = await supabase.from('ingredients').select('*').eq('active', true).order('name');
    const { data: c } = await supabase.from('inventory_counts').select('*, creator:created_by(name)').order('created_at', { ascending: false }).limit(30);
    if (i) setIngredients(i);
    if (c) setCounts(c);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectCount = async (c: any) => {
    setSelected(c);
    const { data } = await supabase.from('inventory_count_items')
      .select('*, ingredient:ingredient_id(name, unit, category)')
      .eq('count_id', c.id)
      .order('created_at');
    setCountItems(data || []);
  };

  // STEP 1: Download current stock as Excel
  const downloadStock = () => {
    const data = ingredients.map(i => ({
      Nombre: i.name,
      Unidad: i.unit,
      Categoria: i.category || '',
      Stock_Sistema: i.stock_current,
      Stock_Contado: '',
      Costo_Unidad: i.cost_per_unit,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 30 }, { wch: 8 }, { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `inventario_${new Date().toISOString().split('T')[0]}.xlsx`);
    alert('📥 Descargado', 'Completa la columna "Stock_Contado" y sube el archivo');
  };

  // STEP 2: Upload counted Excel
  const handleFile = (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        if (rows.length === 0) { alert('Error', 'Archivo vacío'); return; }

        // Create count record
        const { data: countData, error } = await supabase.from('inventory_counts').insert({
          total_items: rows.length, created_by: user?.id || null, status: 'pendiente',
        }).select().single();

        if (error) { alert('Error', error.message); return; }

        const diffs: any[] = [];
        let totalMermaQty = 0;
        let totalMermaValue = 0;

        for (const row of rows) {
          const name = (row.Nombre || row.nombre || '').trim();
          if (!name) continue;

          const counted = parseFloat(row.Stock_Contado || row.stock_contado);
          if (isNaN(counted)) continue; // Skip if not counted

          const ing = ingredients.find(x => x.name.toLowerCase() === name.toLowerCase());
          if (!ing) continue;

          const systemStock = ing.stock_current || 0;
          const diff = counted - systemStock;
          const mermaValue = diff < 0 ? Math.abs(diff) * ing.cost_per_unit : 0;

          if (diff < 0) {
            totalMermaQty += Math.abs(diff);
            totalMermaValue += mermaValue;
          }

          // Save count item
          await supabase.from('inventory_count_items').insert({
            count_id: countData.id, ingredient_id: ing.id,
            system_stock: systemStock, counted_stock: counted,
            difference: diff, merma_value: mermaValue, cost_per_unit: ing.cost_per_unit,
          });

          diffs.push({
            name, unit: ing.unit, category: ing.category,
            systemStock, counted, diff, mermaValue, costPerUnit: ing.cost_per_unit,
          });
        }

        // Update count totals
        await supabase.from('inventory_counts').update({
          total_items: diffs.length, total_merma_qty: totalMermaQty, total_merma_value: totalMermaValue,
        }).eq('id', countData.id);

        setPendingCountId(countData.id);
        setDiffRows(diffs.sort((a, b) => a.diff - b.diff)); // Worst merma first
        setDiffModal(true);
        await load();
      } catch (e: any) { alert('Error', e.message); }
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  // STEP 3: Apply count — update all stocks
  const applyCount = async () => {
    if (!pendingCountId) return;

    for (const d of diffRows) {
      const ing = ingredients.find(x => x.name.toLowerCase() === d.name.toLowerCase());
      if (ing) {
        await supabase.from('ingredients').update({ stock_current: d.counted }).eq('id', ing.id);
      }
    }

    await supabase.from('inventory_counts').update({
      status: 'aplicado', applied_at: new Date().toISOString(),
    }).eq('id', pendingCountId);

    setDiffModal(false);
    setPendingCountId(null);
    alert('✅ Inventario aplicado', 'Stock actualizado según conteo');
    await load();
  };

  // Export diff report as Excel
  const exportDiffReport = () => {
    const data = diffRows.map(d => ({
      Ingrediente: d.name,
      Unidad: d.unit,
      Categoria: d.category,
      Stock_Sistema: d.systemStock,
      Stock_Contado: d.counted,
      Diferencia: d.diff,
      Costo_Unidad: d.costPerUnit,
      Merma_Valor: d.mermaValue,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 30 }, { wch: 8 }, { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Diferencias');
    XLSX.writeFile(wb, `merma_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const totalMermaQty = diffRows.filter(d => d.diff < 0).reduce((s, d) => s + Math.abs(d.diff), 0);
  const totalMermaValue = diffRows.filter(d => d.diff < 0).reduce((s, d) => s + d.mermaValue, 0);
  const totalSobrante = diffRows.filter(d => d.diff > 0).reduce((s, d) => s + d.diff, 0);

  return (
    <View style={s.wrap}>
      {Platform.OS === 'web' && (
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' } as any} />
      )}

      {/* Left: History */}
      <View style={s.list}>
        <View style={s.header}>
          <Text style={s.title}>📦 Inventario</Text>
        </View>
        <View style={{ padding: 12, gap: 6 }}>
          <TouchableOpacity style={[s.btn, { backgroundColor: '#4CAF50' }]} onPress={downloadStock}>
            <Text style={s.btnT}>📥 Descargar Stock Actual</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: '#42A5F5' }]} onPress={() => fileRef.current?.click()}>
            <Text style={s.btnT}>📤 Subir Conteo</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ paddingHorizontal: 12, fontSize: 12, fontWeight: '700', color: '#999', marginBottom: 6 }}>HISTORIAL</Text>
        <ScrollView>
          {counts.map(c => {
            const isActive = selected?.id === c.id;
            return (
              <TouchableOpacity key={c.id} style={[s.row, isActive && s.rowActive]} onPress={() => selectCount(c)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{new Date(c.created_at).toLocaleDateString('es-CL')} {new Date(c.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</Text>
                  <Text style={s.rowSub}>{c.total_items} items · Merma: {fmt(c.total_merma_value || 0)} · {c.creator?.name || '—'}</Text>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: c.status === 'aplicado' ? '#E8F5E9' : c.status === 'anulado' ? '#FFEBEE' : '#FFF3E0' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: c.status === 'aplicado' ? '#4CAF50' : c.status === 'anulado' ? '#E53935' : '#F57C00' }}>
                    {c.status?.toUpperCase()}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {counts.length === 0 && <Text style={{ padding: 20, textAlign: 'center', color: '#999' }}>Sin conteos realizados</Text>}
        </ScrollView>
      </View>

      {/* Right: Detail */}
      {selected ? (
        <ScrollView style={s.detail}>
          <View style={s.dHeader}>
            <Text style={s.dTitle}>Conteo {new Date(selected.created_at).toLocaleDateString('es-CL')}</Text>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: selected.status === 'aplicado' ? '#E8F5E9' : '#FFF3E0' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: selected.status === 'aplicado' ? '#4CAF50' : '#F57C00' }}>{selected.status?.toUpperCase()}</Text>
            </View>
          </View>

          {/* Summary cards */}
          <View style={{ flexDirection: 'row', gap: 10, padding: 14 }}>
            <View style={s.sumCard}>
              <Text style={s.sumLabel}>Items</Text>
              <Text style={s.sumValue}>{selected.total_items}</Text>
            </View>
            <View style={[s.sumCard, { borderColor: '#FFCDD2' }]}>
              <Text style={s.sumLabel}>Merma</Text>
              <Text style={[s.sumValue, { color: '#E53935' }]}>{fmt(selected.total_merma_value || 0)}</Text>
            </View>
            <View style={s.sumCard}>
              <Text style={s.sumLabel}>Creado por</Text>
              <Text style={[s.sumValue, { fontSize: 14 }]}>{selected.creator?.name || '—'}</Text>
            </View>
          </View>

          {/* Items table */}
          <View style={{ paddingHorizontal: 14 }}>
            <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' }}>
              <Text style={[s.th, { flex: 1 }]}>Ingrediente</Text>
              <Text style={[s.th, { width: 50 }]}>Unid.</Text>
              <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Sistema</Text>
              <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Contado</Text>
              <Text style={[s.th, { width: 60, textAlign: 'right' }]}>Dif.</Text>
              <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Merma $</Text>
            </View>
            {countItems.map(ci => (
              <View key={ci.id} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', alignItems: 'center', backgroundColor: ci.difference < 0 ? '#FFF8E1' : ci.difference > 0 ? '#E8F5E9' : '#FFF' }}>
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#2D2D2D' }}>{ci.ingredient?.name}</Text>
                <Text style={{ width: 50, fontSize: 11, color: '#888' }}>{ci.ingredient?.unit}</Text>
                <Text style={{ width: 70, textAlign: 'right', fontSize: 12, color: '#888' }}>{Math.round(ci.system_stock)}</Text>
                <Text style={{ width: 70, textAlign: 'right', fontSize: 12, fontWeight: '600', color: '#2D2D2D' }}>{Math.round(ci.counted_stock)}</Text>
                <Text style={{ width: 60, textAlign: 'right', fontSize: 12, fontWeight: '700', color: ci.difference < 0 ? '#E53935' : ci.difference > 0 ? '#4CAF50' : '#999' }}>
                  {ci.difference > 0 ? '+' : ''}{Math.round(ci.difference)}
                </Text>
                <Text style={{ width: 80, textAlign: 'right', fontSize: 12, fontWeight: '700', color: ci.merma_value > 0 ? '#E53935' : '#999' }}>
                  {ci.merma_value > 0 ? '-' + fmt(ci.merma_value) : '—'}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={[s.detail, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontSize: 48 }}>📦</Text>
          <Text style={{ color: '#999', marginTop: 8, fontSize: 16 }}>Control de Inventario</Text>
          <Text style={{ color: '#BBB', marginTop: 4, fontSize: 13, textAlign: 'center', maxWidth: 300 }}>
            1. Descarga el stock actual{'\n'}
            2. Completa "Stock_Contado" en Excel{'\n'}
            3. Sube el archivo para ver diferencias
          </Text>
        </View>
      )}

      {/* DIFF MODAL — preview before applying */}
      <Modal visible={diffModal} transparent animationType="fade">
        <View style={s.ov}><View style={[s.md, { maxWidth: 750, maxHeight: '90%' as any }]}>
          <Text style={s.mdT}>📊 Resultado del Conteo</Text>

          {/* Summary */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <View style={[s.sumCard, { flex: 1 }]}>
              <Text style={s.sumLabel}>Items contados</Text>
              <Text style={s.sumValue}>{diffRows.length}</Text>
            </View>
            <View style={[s.sumCard, { flex: 1, borderColor: '#FFCDD2' }]}>
              <Text style={s.sumLabel}>Merma total</Text>
              <Text style={[s.sumValue, { color: '#E53935' }]}>{fmt(totalMermaValue)}</Text>
            </View>
            <View style={[s.sumCard, { flex: 1, borderColor: '#C8E6C9' }]}>
              <Text style={s.sumLabel}>Sobrante</Text>
              <Text style={[s.sumValue, { color: '#4CAF50' }]}>{Math.round(totalSobrante)} u.</Text>
            </View>
            <View style={[s.sumCard, { flex: 1 }]}>
              <Text style={s.sumLabel}>Con diferencia</Text>
              <Text style={s.sumValue}>{diffRows.filter(d => d.diff !== 0).length}</Text>
            </View>
          </View>

          {/* Table */}
          <ScrollView style={{ maxHeight: 400 }}>
            <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: '#F0F0F0', borderRadius: 6, marginBottom: 4 }}>
              <Text style={[s.th, { flex: 1 }]}>Ingrediente</Text>
              <Text style={[s.th, { width: 50 }]}>Unid.</Text>
              <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Sistema</Text>
              <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Contado</Text>
              <Text style={[s.th, { width: 60, textAlign: 'right' }]}>Dif.</Text>
              <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Merma $</Text>
            </View>
            {diffRows.map((d, i) => (
              <View key={i} style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', backgroundColor: d.diff < 0 ? '#FFF8E1' : d.diff > 0 ? '#E8F5E9' : '#FFF' }}>
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#2D2D2D' }}>{d.name}</Text>
                <Text style={{ width: 50, fontSize: 11, color: '#888' }}>{d.unit}</Text>
                <Text style={{ width: 70, textAlign: 'right', fontSize: 11, color: '#888' }}>{Math.round(d.systemStock)}</Text>
                <Text style={{ width: 70, textAlign: 'right', fontSize: 12, fontWeight: '600' }}>{Math.round(d.counted)}</Text>
                <Text style={{ width: 60, textAlign: 'right', fontSize: 12, fontWeight: '700', color: d.diff < 0 ? '#E53935' : d.diff > 0 ? '#4CAF50' : '#999' }}>
                  {d.diff > 0 ? '+' : ''}{Math.round(d.diff)}
                </Text>
                <Text style={{ width: 80, textAlign: 'right', fontSize: 12, fontWeight: '700', color: d.mermaValue > 0 ? '#E53935' : '#999' }}>
                  {d.mermaValue > 0 ? '-' + fmt(d.mermaValue) : '—'}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <TouchableOpacity style={[s.bCancel, { flex: 1 }]} onPress={() => setDiffModal(false)}>
              <Text style={s.bCancelT}>Cerrar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: '#42A5F5', paddingVertical: 14, borderRadius: 10, alignItems: 'center' as any }]} onPress={exportDiffReport}>
              <Text style={s.btnT}>📤 Exportar Reporte</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.bSave, { flex: 1 }]} onPress={applyCount}>
              <Text style={s.bSaveT}>✅ Aplicar al Stock</Text>
            </TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', backgroundColor: '#F5F5F5' },
  list: { width: 320, backgroundColor: '#FFF', borderRightWidth: 1, borderRightColor: '#E0E0E0' },
  header: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  title: { fontSize: 18, fontWeight: '700', color: '#2D2D2D' },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center' as any },
  btnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
  row: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  rowActive: { backgroundColor: COLORS.primary + '10', borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  rowName: { fontSize: 14, fontWeight: '700', color: '#2D2D2D' },
  rowSub: { fontSize: 11, color: '#999', marginTop: 2 },
  detail: { flex: 1 },
  dHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  dTitle: { fontSize: 18, fontWeight: '700', color: '#2D2D2D' },
  sumCard: { backgroundColor: '#FFF', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center' as any },
  sumLabel: { fontSize: 11, color: '#999' },
  sumValue: { fontSize: 22, fontWeight: '800', color: '#2D2D2D', marginTop: 4 },
  th: { fontSize: 11, fontWeight: '600', color: '#999' },
  ov: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  md: { width: '95%' as any, backgroundColor: '#FFF', borderRadius: 16, padding: 24 },
  mdT: { fontSize: 18, fontWeight: '700', color: '#2D2D2D', textAlign: 'center', marginBottom: 12 },
  bCancel: { paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center' as any },
  bCancelT: { color: '#666', fontWeight: '600', fontSize: 14 },
  bSave: { paddingVertical: 14, borderRadius: 10, backgroundColor: '#4CAF50', alignItems: 'center' as any },
  bSaveT: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
