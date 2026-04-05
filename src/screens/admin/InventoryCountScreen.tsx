import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../theme';
import * as XLSX from 'xlsx';

const COCINA_CATS = ['Carnes','Pescados','Mariscos','Lácteos','Verduras','Frutas','Insumos','Especias'];
const BARRA_CATS = ['Licores','Cervezas','Destilados'];
const isBarraOtros = (name: string) => {
  const n = name.toLowerCase();
  return /red bull|pepsi|crush|cachantun|perrier|ginger|tonica|limon soda|kem |pap |bilz|fentiman|sol$|heineken|kunstm|austral|schop|calafate|cristal|dolbek|viña mar|castillo molina|misiones|gran torobayo|vino |jugo /.test(n);
};
const getStation = (i: any): 'cocina' | 'barra' | 'ambos' => {
  if (i.is_production) return 'cocina';
  if (COCINA_CATS.includes(i.category)) return 'cocina';
  if (BARRA_CATS.includes(i.category)) return 'barra';
  if (i.category === 'Otros') return isBarraOtros(i.name) ? 'barra' : 'ambos';
  return 'ambos';
};

const alert = (t: string, m?: string) => typeof window !== 'undefined' ? window.alert(t + (m ? '\n' + m : '')) : null;
const confirm = (m: string) => typeof window !== 'undefined' ? window.confirm(m) : true;
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
  const [reconteoMode, setReconteoMode] = useState(false);
  const [reconteoValues, setReconteoValues] = useState<Record<string, string>>({});
  const [reconteoPhase, setReconteoPhase] = useState<'initial' | 'recount' | 'final'>('initial');
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

  // Delete inventory count
  const deleteCount = async (countId: string) => {
    if (!confirm('¿Eliminar este conteo de inventario?')) return;
    await supabase.from('inventory_count_items').delete().eq('count_id', countId);
    await supabase.from('inventory_counts').delete().eq('id', countId);
    if (selected?.id === countId) { setSelected(null); setCountItems([]); }
    await load();
    alert('✅', 'Conteo eliminado');
  };

  // STEP 1: Download current stock as Excel (2 hojas: Cocina y Barra)
  const downloadStock = () => {
    const toRow = (i: any) => ({
      Nombre: i.name,
      Unidad: i.unit,
      Categoria: i.category || '',
      Stock_Sistema: i.stock_current,
      Stock_Contado: '',
      Costo_Unidad: i.cost_per_unit,
    });
    const cols = [{ wch: 30 }, { wch: 8 }, { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    const cocina = ingredients.filter(i => { const s = getStation(i); return s === 'cocina' || s === 'ambos'; }).map(toRow);
    const barra = ingredients.filter(i => { const s = getStation(i); return s === 'barra' || s === 'ambos'; }).map(toRow);
    const wb = XLSX.utils.book_new();
    const wsCocina = XLSX.utils.json_to_sheet(cocina);
    wsCocina['!cols'] = cols;
    XLSX.utils.book_append_sheet(wb, wsCocina, 'Cocina');
    const wsBarra = XLSX.utils.json_to_sheet(barra);
    wsBarra['!cols'] = cols;
    XLSX.utils.book_append_sheet(wb, wsBarra, 'Barra');
    XLSX.writeFile(wb, `inventario_${new Date().toLocaleDateString('en-CA')}.xlsx`);
    alert('📥 Descargado', 'Excel con 2 hojas: Cocina y Barra.\nCompleta "Stock_Contado" y sube el archivo.');
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
        // Read all sheets (Cocina + Barra) and merge rows
        const rows: any[] = [];
        const seen = new Set<string>();
        for (const sheetName of wb.SheetNames) {
          const sheetRows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
          for (const r of sheetRows) {
            const name = (r.Nombre || r.nombre || '').trim().toLowerCase();
            if (name && !seen.has(name)) { seen.add(name); rows.push(r); }
          }
        }

        if (rows.length === 0) { alert('Error', 'Archivo vacío'); return; }

        // Create count record
        const { data: countData, error } = await supabase.from('inventory_counts').insert({
          total_items: rows.length, created_by: user?.id || null, status: 'pendiente',
        }).select().single();

        if (error) { alert('Error', error.message); return; }

        const diffs: any[] = [];
        let totalMermaQty = 0;
        let totalMermaValue = 0;
        let totalSobranteQty = 0;
        let totalSobranteValue = 0;
        let matchCount = 0;
        let noMatchNames: string[] = [];

        for (const row of rows) {
          const name = (row.Nombre || row.nombre || '').trim();
          if (!name) continue;

          const countedRaw = row.Stock_Contado ?? row.stock_contado ?? row['Stock Contado'] ?? row['stock contado'] ?? row.Contado ?? row.contado;
          if (countedRaw === undefined || countedRaw === null || countedRaw === '') continue;
          const counted = parseFloat(String(countedRaw));
          if (isNaN(counted)) continue;

          const ing = ingredients.find(x => x.name.toLowerCase().trim() === name.toLowerCase().trim());
          if (!ing) { noMatchNames.push(name); continue; }
          matchCount++;

          const systemStock = ing.stock_current || 0;
          const diff = counted - systemStock;
          const diffValue = Math.abs(diff) * ing.cost_per_unit;

          if (diff < 0) {
            totalMermaQty += Math.abs(diff);
            totalMermaValue += diffValue;
          } else if (diff > 0) {
            totalSobranteQty += diff;
            totalSobranteValue += diffValue;
          }
          const mermaValue = diff < 0 ? diffValue : 0;

          // Save count item
          await supabase.from('inventory_count_items').insert({
            count_id: countData.id, ingredient_id: ing.id,
            system_stock: systemStock, counted_stock: counted,
            difference: diff, merma_value: mermaValue, cost_per_unit: ing.cost_per_unit,
          });

          diffs.push({
            name, unit: ing.unit, category: ing.category,
            systemStock, counted, diff, mermaValue, 
            sobranteValue: diff > 0 ? diffValue : 0,
            costPerUnit: ing.cost_per_unit,
          });
        }

        // Update count totals
        await supabase.from('inventory_counts').update({
          total_items: matchCount, total_merma_qty: totalMermaQty, total_merma_value: totalMermaValue,
        }).eq('id', countData.id);

        if (noMatchNames.length > 0) {
          console.log('Sin match:', noMatchNames);
        }

        setPendingCountId(countData.id);
        setDiffRows(diffs.sort((a, b) => a.diff - b.diff)); // Worst merma first
        setReconteoPhase('initial');
        setReconteoValues({});
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

  // Totals calculated inline in JSX

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
        <Text style={{ paddingHorizontal: 12, fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 6 }}>HISTORIAL</Text>
        <ScrollView>
          {counts.map(c => {
            const isActive = selected?.id === c.id;
            return (
              <TouchableOpacity key={c.id} style={[s.row, isActive && s.rowActive]} onPress={() => selectCount(c)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{new Date(c.created_at).toLocaleDateString('es-CL')} {new Date(c.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</Text>
                  <Text style={s.rowSub}>{c.total_items} items · Merma: {fmt(c.total_merma_value || 0)} · {c.creator?.name || '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: c.status === 'aplicado' ? '#4CAF5020' : c.status === 'anulado' ? '#E5393520' : '#F57C0020' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: c.status === 'aplicado' ? '#4CAF50' : c.status === 'anulado' ? '#E53935' : '#F57C00' }}>
                      {c.status?.toUpperCase()}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); deleteCount(c.id); }}>
                    <Text style={{ fontSize: 12 }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}
          {counts.length === 0 && <Text style={{ padding: 20, textAlign: 'center', color: COLORS.textMuted }}>Sin conteos realizados</Text>}
        </ScrollView>
      </View>

      {/* Right: Detail */}
      {selected ? (
        <ScrollView style={s.detail}>
          <View style={s.dHeader}>
            <Text style={s.dTitle}>Conteo {new Date(selected.created_at).toLocaleDateString('es-CL')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: selected.status === 'aplicado' ? '#4CAF5020' : '#F57C0020' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: selected.status === 'aplicado' ? '#4CAF50' : '#F57C00' }}>{selected.status?.toUpperCase()}</Text>
              </View>
              <TouchableOpacity onPress={() => deleteCount(selected.id)}>
                <Text style={{ fontSize: 13, color: '#E53935' }}>🗑️ Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Summary cards */}
          <View style={{ flexDirection: 'row', gap: 10, padding: 14 }}>
            <View style={s.sumCard}>
              <Text style={s.sumLabel}>Items</Text>
              <Text style={s.sumValue}>{selected.total_items}</Text>
            </View>
            <View style={[s.sumCard, { borderColor: '#E5393540' }]}>
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
            <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <Text style={[s.th, { flex: 1 }]}>Ingrediente</Text>
              <Text style={[s.th, { width: 50 }]}>Unid.</Text>
              <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Sistema</Text>
              <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Contado</Text>
              <Text style={[s.th, { width: 60, textAlign: 'right' }]}>Dif.</Text>
              <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Merma $</Text>
            </View>
            {countItems.map(ci => (
              <View key={ci.id} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center', backgroundColor: ci.difference < 0 ? '#F59E0B10' : ci.difference > 0 ? '#4CAF5010' : COLORS.card }}>
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.text }}>{ci.ingredient?.name}</Text>
                <Text style={{ width: 50, fontSize: 11, color: COLORS.textSecondary }}>{ci.ingredient?.unit}</Text>
                <Text style={{ width: 70, textAlign: 'right', fontSize: 12, color: COLORS.textSecondary }}>{Math.round(ci.system_stock)}</Text>
                <Text style={{ width: 70, textAlign: 'right', fontSize: 12, fontWeight: '600', color: COLORS.text }}>{Math.round(ci.counted_stock)}</Text>
                <Text style={{ width: 60, textAlign: 'right', fontSize: 12, fontWeight: '700', color: ci.difference < 0 ? '#E53935' : ci.difference > 0 ? '#4CAF50' : COLORS.textMuted }}>
                  {ci.difference > 0 ? '+' : ''}{Math.round(ci.difference)}
                </Text>
                <Text style={{ width: 80, textAlign: 'right', fontSize: 12, fontWeight: '700', color: ci.merma_value > 0 ? '#E53935' : COLORS.textMuted }}>
                  {ci.merma_value > 0 ? '-' + fmt(ci.merma_value) : '—'}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={[s.detail, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontSize: 48 }}>📦</Text>
          <Text style={{ color: COLORS.textMuted, marginTop: 8, fontSize: 16 }}>Control de Inventario</Text>
          <Text style={{ color: COLORS.textMuted, marginTop: 4, fontSize: 13, textAlign: 'center', maxWidth: 300 }}>
            1. Descarga el stock actual{'\n'}
            2. Completa "Stock_Contado" en Excel{'\n'}
            3. Sube el archivo para ver diferencias
          </Text>
        </View>
      )}

      {/* DIFF MODAL — 3 phases: initial → recount → final */}
      <Modal visible={diffModal} transparent animationType="fade">
        <View style={s.ov}><View style={[s.md, { maxWidth: 750, maxHeight: '90%' as any }]}>

          {/* PHASE 1: Mostrar diferencias y pedir reconteo de mermas */}
          {reconteoPhase === 'initial' && (<>
            <Text style={s.mdT}>📊 Diferencias Detectadas</Text>
            <Text style={{ textAlign: 'center', fontSize: 13, color: '#E53935', fontWeight: '600', marginBottom: 12 }}>
              Se encontraron {diffRows.filter(d => d.diff !== 0).length} items con diferencia. Recuenta las mermas para confirmar.
            </Text>

            <ScrollView style={{ maxHeight: 350 }}>
              <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: COLORS.background, borderRadius: 6, marginBottom: 4 }}>
                <Text style={[s.th, { flex: 1 }]}>Ingrediente</Text>
                <Text style={[s.th, { width: 50 }]}>Unid.</Text>
                <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Sistema</Text>
                <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Contado</Text>
                <Text style={[s.th, { width: 60, textAlign: 'right' }]}>Dif.</Text>
              </View>
              {diffRows.filter(d => d.diff !== 0).map((d, i) => (
                <View key={i} style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: d.diff < 0 ? '#F59E0B10' : '#4CAF5010' }}>
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.text }}>{d.name}</Text>
                  <Text style={{ width: 50, fontSize: 11, color: COLORS.textSecondary }}>{d.unit}</Text>
                  <Text style={{ width: 70, textAlign: 'right', fontSize: 11, color: COLORS.textSecondary }}>{parseFloat(d.systemStock.toFixed(2))}</Text>
                  <Text style={{ width: 70, textAlign: 'right', fontSize: 12, fontWeight: '600' }}>{parseFloat(d.counted.toFixed(2))}</Text>
                  <Text style={{ width: 60, textAlign: 'right', fontSize: 12, fontWeight: '700', color: d.diff < 0 ? '#E53935' : '#4CAF50' }}>
                    {d.diff > 0 ? '+' : ''}{parseFloat(d.diff.toFixed(2))}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[s.bCancel, { flex: 1 }]} onPress={() => { setDiffModal(false); setReconteoPhase('initial'); }}>
                <Text style={s.bCancelT}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.bSave, { flex: 1, backgroundColor: '#F57C00' }]} onPress={() => {
                const vals: Record<string, string> = {};
                diffRows.filter(d => d.diff !== 0).forEach(d => { vals[d.name] = ''; });
                setReconteoValues(vals);
                setReconteoPhase('recount');
              }}>
                <Text style={s.bSaveT}>🔄 Recontar Mermas</Text>
              </TouchableOpacity>
            </View>
          </>)}

          {/* PHASE 2: Ingresar reconteo */}
          {reconteoPhase === 'recount' && (<>
            <Text style={s.mdT}>🔄 Reconteo de Mermas</Text>
            <Text style={{ textAlign: 'center', fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>
              Vuelve a contar cada item y escribe el valor real. Solo una oportunidad.
            </Text>

            <ScrollView style={{ maxHeight: 400 }}>
              {diffRows.filter(d => d.diff !== 0).map((d, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: i % 2 === 0 ? COLORS.card : COLORS.background }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{d.name}</Text>
                    <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Sistema: {parseFloat(d.systemStock.toFixed(2))} {d.unit} · 1er conteo: {parseFloat(d.counted.toFixed(2))}</Text>
                  </View>
                  {Platform.OS === 'web' && (
                    <input
                      type="number"
                      step="any"
                      placeholder={String(d.counted)}
                      value={reconteoValues[d.name] || ''}
                      onChange={(e: any) => setReconteoValues(prev => ({ ...prev, [d.name]: e.target.value }))}
                      style={{ width: 90, padding: '6px 10px', borderRadius: 8, border: '1.5px solid ' + COLORS.border, fontSize: 14, fontWeight: '700', textAlign: 'right' } as any}
                    />
                  )}
                  <Text style={{ width: 40, textAlign: 'center', fontSize: 11, color: COLORS.textMuted }}>{d.unit}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[s.bCancel, { flex: 1 }]} onPress={() => setReconteoPhase('initial')}>
                <Text style={s.bCancelT}>← Volver</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.bSave, { flex: 1 }]} onPress={() => {
                // Aplicar reconteo: actualizar diffRows con los nuevos valores
                const updated = diffRows.map(d => {
                  const reVal = reconteoValues[d.name];
                  if (reVal !== undefined && reVal !== '') {
                    const newCounted = parseFloat(reVal);
                    if (!isNaN(newCounted)) {
                      const newDiff = newCounted - d.systemStock;
                      return { ...d, counted: newCounted, diff: newDiff, mermaValue: newDiff < 0 ? Math.abs(newDiff) * d.costPerUnit : 0, sobranteValue: newDiff > 0 ? newDiff * d.costPerUnit : 0 };
                    }
                  }
                  return d; // Sin reconteo, mantener valor original
                });
                setDiffRows(updated.sort((a, b) => a.diff - b.diff));
                setReconteoPhase('final');
              }}>
                <Text style={s.bSaveT}>✅ Confirmar Reconteo</Text>
              </TouchableOpacity>
            </View>
          </>)}

          {/* PHASE 3: Resultado final con valores */}
          {reconteoPhase === 'final' && (<>
            <Text style={s.mdT}>📋 Resultado Final</Text>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={[s.sumCard, { flex: 1 }]}>
                <Text style={s.sumLabel}>Items contados</Text>
                <Text style={s.sumValue}>{diffRows.length}</Text>
              </View>
              <View style={[s.sumCard, { flex: 1, borderColor: '#E5393540' }]}>
                <Text style={s.sumLabel}>🔻 Merma</Text>
                <Text style={[s.sumValue, { color: '#E53935' }]}>{fmt(diffRows.filter(d => d.diff < 0).reduce((acc, d) => acc + d.mermaValue, 0))}</Text>
                <Text style={{ fontSize: 10, color: '#E53935' }}>{diffRows.filter(d => d.diff < 0).length} items</Text>
              </View>
              <View style={[s.sumCard, { flex: 1, borderColor: '#4CAF5040' }]}>
                <Text style={s.sumLabel}>🔺 Sobrante</Text>
                <Text style={[s.sumValue, { color: '#4CAF50' }]}>{fmt(diffRows.filter(d => d.diff > 0).reduce((acc, d) => acc + d.sobranteValue, 0))}</Text>
                <Text style={{ fontSize: 10, color: '#4CAF50' }}>{diffRows.filter(d => d.diff > 0).length} items</Text>
              </View>
            </View>

            <ScrollView style={{ maxHeight: 350 }}>
              <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: COLORS.background, borderRadius: 6, marginBottom: 4 }}>
                <Text style={[s.th, { flex: 1 }]}>Ingrediente</Text>
                <Text style={[s.th, { width: 45 }]}>Unid.</Text>
                <Text style={[s.th, { width: 60, textAlign: 'right' }]}>Sistema</Text>
                <Text style={[s.th, { width: 60, textAlign: 'right' }]}>Final</Text>
                <Text style={[s.th, { width: 55, textAlign: 'right' }]}>Dif.</Text>
                <Text style={[s.th, { width: 75, textAlign: 'right' }]}>Valor</Text>
              </View>
              {diffRows.filter(d => d.diff !== 0).map((d, i) => (
                <View key={i} style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: d.diff < 0 ? '#E5393508' : '#4CAF5008' }}>
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.text }} numberOfLines={1}>{d.name}</Text>
                  <Text style={{ width: 45, fontSize: 11, color: COLORS.textSecondary }}>{d.unit}</Text>
                  <Text style={{ width: 60, textAlign: 'right', fontSize: 11, color: COLORS.textSecondary }}>{parseFloat(d.systemStock.toFixed(2))}</Text>
                  <Text style={{ width: 60, textAlign: 'right', fontSize: 12, fontWeight: '700' }}>{parseFloat(d.counted.toFixed(2))}</Text>
                  <Text style={{ width: 55, textAlign: 'right', fontSize: 12, fontWeight: '700', color: d.diff < 0 ? '#E53935' : '#4CAF50' }}>
                    {d.diff > 0 ? '+' : ''}{parseFloat(d.diff.toFixed(2))}
                  </Text>
                  <Text style={{ width: 75, textAlign: 'right', fontSize: 12, fontWeight: '700', color: d.diff < 0 ? '#E53935' : '#4CAF50' }}>
                    {d.diff < 0 ? '-' : '+'}{fmt(d.diff < 0 ? d.mermaValue : d.sobranteValue)}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[s.bCancel, { flex: 1 }]} onPress={() => { setDiffModal(false); setReconteoPhase('initial'); }}>
                <Text style={s.bCancelT}>Cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: '#42A5F5', paddingVertical: 14, borderRadius: 10, alignItems: 'center' as any }]} onPress={exportDiffReport}>
                <Text style={s.btnT}>📤 Exportar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.bSave, { flex: 1 }]} onPress={() => { applyCount(); setReconteoPhase('initial'); }}>
                <Text style={s.bSaveT}>✅ Aplicar al Stock</Text>
              </TouchableOpacity>
            </View>
          </>)}

        </View></View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.background },
  list: { width: 320, backgroundColor: COLORS.card, borderRightWidth: 1, borderRightColor: COLORS.border },
  header: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center' as any },
  btnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
  row: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowActive: { backgroundColor: COLORS.primary + '10', borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  rowName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  rowSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  detail: { flex: 1 },
  dHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  sumCard: { backgroundColor: COLORS.card, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' as any },
  sumLabel: { fontSize: 11, color: COLORS.textMuted },
  sumValue: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 4 },
  th: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  ov: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' },
  md: { width: '95%' as any, backgroundColor: COLORS.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border },
  mdT: { fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 12 },
  bCancel: { paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' as any },
  bCancelT: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
  bSave: { paddingVertical: 14, borderRadius: 10, backgroundColor: '#4CAF50', alignItems: 'center' as any },
  bSaveT: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
