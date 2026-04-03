// IngredientsScreen — Excel import/export + price history
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../theme';
import * as XLSX from 'xlsx';

const CATS = ['Carnes','Pescados','Mariscos','Lácteos','Verduras','Frutas','Licores','Cervezas','Destilados','Insumos','Especias','Otros'];
const UNITS = ['gr','kg','ml','lt','unidad'];
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');
const alert = (title: string, msg?: string) => typeof window !== 'undefined' ? window.alert(title + (msg ? '\n' + msg : '')) : null;
const confirm = (msg: string) => typeof window !== 'undefined' ? window.confirm(msg) : true;

export default function IngredientsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [modal, setModal] = useState(false);
  const [ed, setEd] = useState<any>({});
  const [isNew, setIsNew] = useState(false);
  const [historyModal, setHistoryModal] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyName, setHistoryName] = useState('');
  const fileRef = useRef<any>(null);
  const [diffModal, setDiffModal] = useState(false);
  const [diffRows, setDiffRows] = useState<any[]>([]);
  const [pendingImport, setPendingImport] = useState<any[]>([]);

  const load = useCallback(async () => {
    const [{ data }, { data: sups }] = await Promise.all([
      supabase.from('ingredients').select('*').eq('active', true).order('name'),
      supabase.from('suppliers').select('*').order('name'),
    ]);
    if (data) setItems(data);
    if (sups) setSuppliers(sups);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(i => {
    const ms = !search || i.name.toLowerCase().includes(search.toLowerCase());
    const mc = filterCat === 'all' || i.category === filterCat;
    const msp = filterSupplier === 'all' || (filterSupplier === 'sin' ? !i.default_supplier_id : i.default_supplier_id === filterSupplier);
    return ms && mc && msp;
  });
  const supplierName = (id: string | null) => id ? (suppliers.find(s => s.id === id)?.name || '-') : '-';

  const lowStock = items.filter(i => i.stock_current <= i.stock_min && i.stock_min > 0);

  const openNew = () => {
    setEd({ name: '', unit: 'gr', stock_current: 0, stock_min: 0, cost_per_unit: 0, category: 'Otros' });
    setIsNew(true); setModal(true);
  };

  const openEdit = (i: any) => {
    setEd({ ...i }); setIsNew(false); setModal(true);
  };

  const save = async () => {
    if (!ed.name?.trim()) { alert('Error', 'Ingresa un nombre'); return; }
    const newCost = parseFloat(ed.cost_per_unit) || 0;
    const payload = {
      name: ed.name.trim(), unit: ed.unit,
      stock_current: parseFloat(ed.stock_current) || 0,
      stock_min: parseFloat(ed.stock_min) || 0,
      cost_per_unit: newCost, category: ed.category,
      default_supplier_id: ed.default_supplier_id || null,
    };

    try {
      if (isNew) {
        await supabase.from('ingredients').insert(payload);
      } else {
        // Track price change
        const oldCost = items.find(x => x.id === ed.id)?.cost_per_unit || 0;
        if (oldCost !== newCost) {
          await supabase.from('ingredient_price_history').insert({
            ingredient_id: ed.id, old_price: oldCost, new_price: newCost,
            changed_by: user?.id || null,
          });
        }
        await supabase.from('ingredients').update(payload).eq('id', ed.id);
      }
      setModal(false); await load();
    } catch (e: any) { alert('Error', e.message); }
  };

  const del = (i: any) => {
    if (!confirm('¿Eliminar "' + i.name + '"?')) return;
    supabase.from('ingredients').update({ active: false }).eq('id', i.id).then(() => load());
  };

  // Price history
  const showHistory = async (i: any) => {
    setHistoryName(i.name);
    const { data } = await supabase.from('ingredient_price_history')
      .select('*, user:changed_by(name)')
      .eq('ingredient_id', i.id)
      .order('changed_at', { ascending: false })
      .limit(20);
    setHistory(data || []);
    setHistoryModal(true);
  };

  // EXPORT EXCEL
  const exportExcel = () => {
    const data = items.map(i => ({
      Nombre: i.name,
      Unidad: i.unit,
      Stock_Actual: i.stock_current,
      Stock_Minimo: i.stock_min,
      Costo_Unidad: i.cost_per_unit,
      Categoria: i.category,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    // Column widths
    ws['!cols'] = [{ wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ingredientes');
    XLSX.writeFile(wb, `ingredientes_${new Date().toISOString().split('T')[0]}.xlsx`);
    alert('✅ Exportado', `${items.length} ingredientes`);
  };

  // IMPORT EXCEL — show diff first
  const handleFile = (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);
        if (rows.length === 0) { alert('Error', 'Archivo vacío'); return; }

        const diffs: any[] = [];
        const pending: any[] = [];

        for (const row of rows) {
          const name = (row.Nombre || row.nombre || '').trim();
          if (!name) continue;
          const payload = {
            name,
            unit: UNITS.includes(row.Unidad || row.unidad) ? (row.Unidad || row.unidad) : 'gr',
            stock_current: parseFloat(row.Stock_Actual || row.stock_actual) || 0,
            stock_min: parseFloat(row.Stock_Minimo || row.stock_minimo) || 0,
            cost_per_unit: parseFloat(row.Costo_Unidad || row.costo_unidad) || 0,
            category: CATS.includes(row.Categoria || row.categoria) ? (row.Categoria || row.categoria) : 'Otros',
          };

          const existing = items.find(x => x.name.toLowerCase() === name.toLowerCase());
          if (existing) {
            const stockDiff = payload.stock_current - existing.stock_current;
            const costDiff = payload.cost_per_unit - existing.cost_per_unit;
            diffs.push({
              name, type: 'update', id: existing.id,
              oldStock: existing.stock_current, newStock: payload.stock_current, stockDiff,
              oldCost: existing.cost_per_unit, newCost: payload.cost_per_unit, costDiff,
              unit: payload.unit, hasChanges: stockDiff !== 0 || costDiff !== 0,
            });
          } else {
            diffs.push({
              name, type: 'new', id: null,
              oldStock: 0, newStock: payload.stock_current, stockDiff: payload.stock_current,
              oldCost: 0, newCost: payload.cost_per_unit, costDiff: payload.cost_per_unit,
              unit: payload.unit, hasChanges: true,
            });
          }
          pending.push({ ...payload, existingId: existing?.id || null, oldCost: existing?.cost_per_unit || 0 });
        }

        // Also check items NOT in the Excel (missing)
        for (const item of items) {
          const inExcel = rows.some(r => (r.Nombre || r.nombre || '').trim().toLowerCase() === item.name.toLowerCase());
          if (!inExcel) {
            diffs.push({
              name: item.name, type: 'missing', id: item.id,
              oldStock: item.stock_current, newStock: null, stockDiff: null,
              oldCost: item.cost_per_unit, newCost: null, costDiff: null,
              unit: item.unit, hasChanges: false,
            });
          }
        }

        setDiffRows(diffs);
        setPendingImport(pending);
        setDiffModal(true);
      } catch (e: any) { alert('Error', e.message); }
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const applyImport = async () => {
    let created = 0, updated = 0;
    for (const p of pendingImport) {
      if (!p.hasChanges && p.existingId) continue;
      const payload = { name: p.name, unit: p.unit, stock_current: p.stock_current, stock_min: p.stock_min, cost_per_unit: p.cost_per_unit, category: p.category };
      if (p.existingId) {
        if (p.oldCost !== p.cost_per_unit) {
          await supabase.from('ingredient_price_history').insert({
            ingredient_id: p.existingId, old_price: p.oldCost,
            new_price: p.cost_per_unit, changed_by: user?.id || null,
          });
        }
        await supabase.from('ingredients').update(payload).eq('id', p.existingId);
        updated++;
      } else {
        await supabase.from('ingredients').insert(payload);
        created++;
      }
    }
    setDiffModal(false);
    alert('✅ Importación aplicada', created + ' creados, ' + updated + ' actualizados');
    await load();
  };

  return (
    <View style={s.wrap}>
      {/* Hidden file input */}
      {Platform.OS === 'web' && (
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' } as any} />
      )}

      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>🥩 Ingredientes ({items.length})</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={[s.btn, { backgroundColor: '#42A5F5' }]} onPress={() => fileRef.current?.click()}>
            <Text style={s.btnT}>📥 Importar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: '#4CAF50' }]} onPress={exportExcel}>
            <Text style={s.btnT}>📤 Exportar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btn} onPress={openNew}>
            <Text style={s.btnT}>+ Nuevo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search + filter */}
      <View style={s.toolbar}>
        <View style={s.searchBox}>
          <Text style={{ color: COLORS.textMuted }}>🔍</Text>
          <TextInput style={s.searchInp} placeholder="Buscar..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><Text style={{ color: COLORS.textMuted }}>✕</Text></TouchableOpacity> : null}
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Sidebar categorías */}
        <View style={{ width: 200, backgroundColor: '#3C3C3C' }}>
          <TouchableOpacity style={[s.sideItem, filterCat === 'all' && s.sideItemA]} onPress={() => setFilterCat('all')}>
            <Text style={[s.sideItemT, filterCat === 'all' && s.sideItemTA]}>Todos</Text>
            <Text style={s.sideCount}>{items.length}</Text>
          </TouchableOpacity>
          <ScrollView>
            {CATS.map(c => {
              const n = items.filter(i => i.category === c).length;
              if (n === 0) return null;
              const isActive = filterCat === c;
              return (
                <TouchableOpacity key={c} style={[s.sideItem, isActive && s.sideItemA]} onPress={() => setFilterCat(isActive ? 'all' : c)}>
                  <Text style={[s.sideItemT, isActive && s.sideItemTA]}>{c}</Text>
                  <Text style={s.sideCount}>{n}</Text>
                </TouchableOpacity>
              );
            })}
            {/* Producción */}
            {items.filter(i => i.is_production).length > 0 && (
              <TouchableOpacity style={[s.sideItem, filterCat === 'Producción' && s.sideItemA]} onPress={() => setFilterCat(filterCat === 'Producción' ? 'all' : 'Producción')}>
                <Text style={[s.sideItemT, filterCat === 'Producción' && s.sideItemTA]}>🏭 Producción</Text>
                <Text style={s.sideCount}>{items.filter(i => i.is_production).length}</Text>
              </TouchableOpacity>
            )}

            {/* Separador proveedores */}
            <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#888', letterSpacing: 1 }}>PROVEEDORES</Text>
            </View>
            <TouchableOpacity style={[s.sideItem, filterSupplier === 'all' && s.sideItemA]} onPress={() => setFilterSupplier('all')}>
              <Text style={[s.sideItemT, filterSupplier === 'all' && s.sideItemTA]}>Todos</Text>
            </TouchableOpacity>
            {suppliers.map(sup => {
              const n = items.filter(i => i.default_supplier_id === sup.id).length;
              if (n === 0) return null;
              const isA = filterSupplier === sup.id;
              return (
                <TouchableOpacity key={sup.id} style={[s.sideItem, isA && s.sideItemA]} onPress={() => setFilterSupplier(isA ? 'all' : sup.id)}>
                  <Text style={[s.sideItemT, isA && s.sideItemTA]}>{sup.name}</Text>
                  <Text style={s.sideCount}>{n}</Text>
                </TouchableOpacity>
              );
            })}
            {(() => {
              const sinProv = items.filter(i => !i.default_supplier_id).length;
              return sinProv > 0 ? (
                <TouchableOpacity style={[s.sideItem, filterSupplier === 'sin' && s.sideItemA]} onPress={() => setFilterSupplier(filterSupplier === 'sin' ? 'all' : 'sin')}>
                  <Text style={[s.sideItemT, filterSupplier === 'sin' && s.sideItemTA]}>Sin proveedor</Text>
                  <Text style={s.sideCount}>{sinProv}</Text>
                </TouchableOpacity>
              ) : null;
            })()}
          </ScrollView>
        </View>

        {/* Tabla */}
        <View style={{ flex: 1 }}>
          <View style={s.tHead}>
            <Text style={[s.th, { flex: 1 }]}>Ingrediente</Text>
            <Text style={[s.th, { width: 90 }]}>Proveedor</Text>
            <Text style={[s.th, { width: 60, textAlign: 'center' }]}>Unidad</Text>
            <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Stock</Text>
            <Text style={[s.th, { width: 60, textAlign: 'right' }]}>Mín.</Text>
            <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Costo</Text>
            <Text style={[s.th, { width: 50 }]}></Text>
          </View>
          <ScrollView>
            {filtered.map((i, idx) => {
              const isLow = i.stock_current <= i.stock_min && i.stock_min > 0;
              return (
                <TouchableOpacity key={i.id} style={[s.tRow, idx % 2 === 0 && s.tRowAlt]} onPress={() => openEdit(i)}>
                  <Text style={[s.td, { flex: 1, fontWeight: '600' }]}>{i.name}</Text>
                  <Text style={[s.td, { width: 90, fontSize: 11, color: i.default_supplier_id ? COLORS.text : COLORS.textMuted }]}>{supplierName(i.default_supplier_id)}</Text>
                  <Text style={[s.td, { width: 60, textAlign: 'center', fontSize: 11, color: COLORS.textSecondary }]}>{i.unit}</Text>
                  <Text style={[s.td, { width: 80, textAlign: 'right', fontWeight: '600', color: isLow ? '#E53935' : COLORS.text }]}>
                    {Math.round(i.stock_current)} {i.unit}
                  </Text>
                  <Text style={[s.td, { width: 60, textAlign: 'right', fontSize: 11, color: i.stock_min > 0 ? COLORS.textSecondary : COLORS.textMuted }]}>
                    {i.stock_min > 0 ? Math.round(i.stock_min) : '-'}
                  </Text>
                  <Text style={[s.td, { width: 80, textAlign: 'right', fontWeight: '700', color: COLORS.primary }]}>
                    {fmt(i.cost_per_unit)}
                  </Text>
                  <View style={{ width: 50, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                    <TouchableOpacity onPress={() => showHistory(i)}><Text style={{ fontSize: 12 }}>📊</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => del(i)}><Text style={{ fontSize: 12 }}>🗑️</Text></TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* EDIT MODAL */}
      <Modal visible={modal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}><View style={s.md}>
          <Text style={s.mdT}>{isNew ? '➕ Nuevo Ingrediente' : '✏️ Editar: ' + (ed.name || '')}</Text>

          <Text style={s.lb}>Nombre *</Text>
          <TextInput style={s.inp} value={ed.name || ''} onChangeText={t => setEd((e: any) => ({ ...e, name: t }))} placeholder="Ej: Salmón fresco" placeholderTextColor={COLORS.textMuted} />

          <Text style={s.lb}>Categoría</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 36 }}>
            {CATS.map(c => <Chip key={c} label={c} active={ed.category === c} onPress={() => setEd((e: any) => ({ ...e, category: c }))} />)}
          </ScrollView>

          <Text style={s.lb}>Proveedor</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 36 }}>
            <Chip label="Sin proveedor" active={!ed.default_supplier_id} onPress={() => setEd((e: any) => ({ ...e, default_supplier_id: null }))} />
            {suppliers.map(sup => <Chip key={sup.id} label={sup.name} active={ed.default_supplier_id === sup.id} onPress={() => setEd((e: any) => ({ ...e, default_supplier_id: sup.id }))} />)}
          </ScrollView>

          <Text style={s.lb}>Unidad base</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {UNITS.map(u => <Chip key={u} label={u} active={ed.unit === u} onPress={() => setEd((e: any) => ({ ...e, unit: u }))} />)}
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.lb}>Stock actual</Text>
              <TextInput style={s.inp} value={String(ed.stock_current || '')} onChangeText={t => setEd((e: any) => ({ ...e, stock_current: t }))} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.lb}>Stock mínimo</Text>
              <TextInput style={s.inp} value={String(ed.stock_min || '')} onChangeText={t => setEd((e: any) => ({ ...e, stock_min: t }))} keyboardType="decimal-pad" />
            </View>
          </View>

          <Text style={s.lb}>Costo por {ed.unit || 'unidad'} *</Text>
          <TextInput style={[s.inp, { fontSize: 20, fontWeight: '700' }]} value={String(ed.cost_per_unit || '')} onChangeText={t => setEd((e: any) => ({ ...e, cost_per_unit: t }))} keyboardType="decimal-pad" />

          {!isNew && ed.id && (() => {
            const old = items.find(x => x.id === ed.id);
            const oldCost = old?.cost_per_unit || 0;
            const newCost = parseFloat(ed.cost_per_unit) || 0;
            if (oldCost !== newCost && oldCost > 0) {
              const diff = newCost - oldCost;
              const pct = ((diff / oldCost) * 100).toFixed(1);
              return (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: diff > 0 ? '#E6510020' : '#2E7D3220', borderRadius: 8, padding: 10, marginTop: 8 }}>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Cambio: {fmt(oldCost)} → {fmt(newCost)}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: diff > 0 ? '#E65100' : '#2E7D32' }}>{diff > 0 ? '+' : ''}{pct}%</Text>
                </View>
              );
            }
            return null;
          })()}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <TouchableOpacity style={s.bCancel} onPress={() => setModal(false)}><Text style={s.bCancelT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={s.bSave} onPress={save}><Text style={s.bSaveT}>Guardar</Text></TouchableOpacity>
          </View>
        </View></ScrollView></View>
      </Modal>

      {/* DIFF MODAL */}
      <Modal visible={diffModal} transparent animationType="fade">
        <View style={s.ov}><View style={[s.md, { maxWidth: 700, maxHeight: '90%' as any }]}>
          <Text style={s.mdT}>📋 Reporte de Diferencias</Text>
          <Text style={{ textAlign: 'center', fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 }}>
            {diffRows.filter(d => d.type === 'new').length} nuevos · {diffRows.filter(d => d.type === 'update' && d.hasChanges).length} con cambios · {diffRows.filter(d => d.type === 'update' && !d.hasChanges).length} sin cambios · {diffRows.filter(d => d.type === 'missing').length} no en Excel
          </Text>

          <ScrollView style={{ maxHeight: 500 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: COLORS.background, borderRadius: 6, marginBottom: 4 }}>
              <Text style={[s.th, { width: 24 }]}></Text>
              <Text style={[s.th, { flex: 1 }]}>Ingrediente</Text>
              <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Stock Ant.</Text>
              <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Stock Nvo.</Text>
              <Text style={[s.th, { width: 60, textAlign: 'right' }]}>Dif. Stock</Text>
              <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Costo Ant.</Text>
              <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Costo Nvo.</Text>
              <Text style={[s.th, { width: 55, textAlign: 'right' }]}>Dif. %</Text>
            </View>

            {diffRows.filter(d => d.hasChanges || d.type === 'new' || d.type === 'missing').map((d, i) => {
              const icon = d.type === 'new' ? '🟢' : d.type === 'missing' ? '⚪' : d.hasChanges ? '🟡' : '⚪';
              const costPct = d.oldCost > 0 && d.costDiff !== null ? ((d.costDiff / d.oldCost) * 100).toFixed(1) : '—';
              return (
                <View key={i} style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center', backgroundColor: d.type === 'new' ? '#4CAF5015' : d.type === 'missing' ? COLORS.background : d.hasChanges ? '#F59E0B15' : COLORS.card }}>
                  <Text style={{ width: 24, fontSize: 12 }}>{icon}</Text>
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.text }}>{d.name}</Text>
                  <Text style={{ width: 70, textAlign: 'right', fontSize: 11, color: COLORS.textSecondary }}>{d.oldStock !== null ? Math.round(d.oldStock) : '—'}</Text>
                  <Text style={{ width: 70, textAlign: 'right', fontSize: 11, fontWeight: '600', color: COLORS.text }}>{d.newStock !== null ? Math.round(d.newStock) : '—'}</Text>
                  <Text style={{ width: 60, textAlign: 'right', fontSize: 11, fontWeight: '700', color: d.stockDiff > 0 ? '#4CAF50' : d.stockDiff < 0 ? '#E53935' : COLORS.textMuted }}>
                    {d.stockDiff !== null ? (d.stockDiff > 0 ? '+' : '') + Math.round(d.stockDiff) : '—'}
                  </Text>
                  <Text style={{ width: 70, textAlign: 'right', fontSize: 11, color: COLORS.textSecondary }}>{d.oldCost !== null ? fmt(d.oldCost) : '—'}</Text>
                  <Text style={{ width: 70, textAlign: 'right', fontSize: 11, fontWeight: '600', color: COLORS.primary }}>{d.newCost !== null ? fmt(d.newCost) : '—'}</Text>
                  <Text style={{ width: 55, textAlign: 'right', fontSize: 11, fontWeight: '600', color: d.costDiff > 0 ? '#E65100' : d.costDiff < 0 ? '#2E7D32' : COLORS.textMuted }}>
                    {costPct !== '—' ? (d.costDiff > 0 ? '+' : '') + costPct + '%' : '—'}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <TouchableOpacity style={s.bCancel} onPress={() => setDiffModal(false)}><Text style={s.bCancelT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={s.bSave} onPress={applyImport}><Text style={s.bSaveT}>✅ Aplicar Cambios</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* HISTORY MODAL */}
      <Modal visible={historyModal} transparent animationType="fade">
        <View style={s.ov}><View style={[s.md, { maxWidth: 500 }]}>
          <Text style={s.mdT}>📊 Historial: {historyName}</Text>
          
          {history.length === 0 ? (
            <Text style={{ textAlign: 'center', color: COLORS.textMuted, paddingVertical: 20 }}>Sin cambios de precio registrados</Text>
          ) : (
            <ScrollView style={{ maxHeight: 400 }}>
              <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                <Text style={[s.th, { flex: 1 }]}>Fecha</Text>
                <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Anterior</Text>
                <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Nuevo</Text>
                <Text style={[s.th, { width: 60, textAlign: 'right' }]}>Cambio</Text>
                <Text style={[s.th, { width: 70 }]}>Quién</Text>
              </View>
              {history.map(h => {
                const diff = h.new_price - h.old_price;
                const pct = h.old_price > 0 ? ((diff / h.old_price) * 100).toFixed(1) : '—';
                return (
                  <View key={h.id} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' }}>
                    <Text style={{ flex: 1, fontSize: 11, color: COLORS.textSecondary }}>
                      {new Date(h.changed_at).toLocaleDateString('es-CL')} {new Date(h.changed_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={{ width: 80, textAlign: 'right', fontSize: 12, color: COLORS.textSecondary }}>{fmt(h.old_price)}</Text>
                    <Text style={{ width: 80, textAlign: 'right', fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{fmt(h.new_price)}</Text>
                    <Text style={{ width: 60, textAlign: 'right', fontSize: 11, fontWeight: '600', color: diff > 0 ? '#E65100' : '#2E7D32' }}>
                      {diff > 0 ? '+' : ''}{pct}%
                    </Text>
                    <Text style={{ width: 70, fontSize: 11, color: COLORS.textSecondary, paddingLeft: 6 }}>{h.user?.name || '—'}</Text>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity style={[s.bCancel, { marginTop: 16 }]} onPress={() => setHistoryModal(false)}>
            <Text style={s.bCancelT}>Cerrar</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>
    </View>
  );
}

function Chip({ label, active, count, onPress }: { label: string; active: boolean; count?: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: active ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: active ? COLORS.primary : COLORS.border, marginRight: 4 }} onPress={onPress}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#fff' : COLORS.textSecondary }}>
        {label}{count !== undefined ? ` (${count})` : ''}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: COLORS.primary },
  btnT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  alertBar: { backgroundColor: '#E5393520', padding: 10, marginHorizontal: 14, marginTop: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E5393540' },
  toolbar: { paddingHorizontal: 14, paddingVertical: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  searchInp: { flex: 1, fontSize: 13, color: COLORS.text, marginLeft: 6 },
  tHead: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  th: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  tRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' },
  tRowAlt: { backgroundColor: COLORS.card + '40' },
  td: { fontSize: 13, color: COLORS.text },
  ov: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' },
  md: { width: '92%' as any, maxWidth: 450, backgroundColor: COLORS.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border },
  mdT: { fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  lb: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 4, marginTop: 12 },
  inp: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text },
  bCancel: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  bCancelT: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
  bSave: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  bSaveT: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sideItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#4A4A4A' },
  sideItemA: { backgroundColor: COLORS.primary },
  sideItemT: { fontSize: 13, color: '#CCC' },
  sideItemTA: { color: '#fff', fontWeight: '700' },
  sideCount: { fontSize: 10, color: '#999', backgroundColor: '#4A4A4A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' as any, minWidth: 22, textAlign: 'center' as any },
});
