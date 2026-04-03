import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Modal, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../theme';

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

export default function ProductionScreen() {
  const { user } = useAuth();
  const [productions, setProductions] = useState<any[]>([]);
  const [allIngredients, setAllIngredients] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState('');

  // Recipe edit
  const [recipeItems, setRecipeItems] = useState<any[]>([]);
  const [ingSearch, setIngSearch] = useState('');

  // Produce modal
  const [produceModal, setProduceModal] = useState(false);
  const [produceQty, setProduceQty] = useState('1');

  // New production
  const [newModal, setNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('unidad');

  // Logs
  const [logs, setLogs] = useState<any[]>([]);

  const load = useCallback(async () => {
    const [{ data: ings }, { data: recs }, { data: lg }] = await Promise.all([
      supabase.from('ingredients').select('*').eq('active', true).order('name'),
      supabase.from('production_recipes').select('*, ingredient:ingredient_id(name, unit, cost_per_unit)').order('created_at'),
      supabase.from('production_logs').select('*, ingredient:production_ingredient_id(name), producer:produced_by(name)').order('created_at', { ascending: false }).limit(50),
    ]);
    const allIngs = ings || [];
    setAllIngredients(allIngs);
    setProductions(allIngs.filter(i => i.is_production));
    setRecipes(recs || []);
    setLogs(lg || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectProduction = (prod: any) => {
    setSelected(prod);
    const items = recipes.filter(r => r.production_ingredient_id === prod.id);
    setRecipeItems(items);
  };

  // Calculate cost from recipe
  const recipeCost = recipeItems.reduce((a, ri) => {
    const cpu = ri.ingredient?.cost_per_unit || 0;
    const q = parseFloat(ri.quantity) || 0;
    const u = ri.unit || ri.ingredient?.unit || 'g';
    let c = cpu * q;
    if (ri.ingredient?.unit === 'kg' && u === 'g') c = cpu * q / 1000;
    if (ri.ingredient?.unit === 'lt' && u === 'ml') c = cpu * q / 1000;
    return a + c;
  }, 0);

  // Add ingredient to recipe
  const addToRecipe = async (ing: any) => {
    if (!selected) return;
    const { error } = await supabase.from('production_recipes').insert({
      production_ingredient_id: selected.id, ingredient_id: ing.id, quantity: 1, unit: ing.unit,
    });
    if (error) { Alert.alert('Error', error.message); return; }
    setIngSearch('');
    await load();
    const updRecs = (await supabase.from('production_recipes').select('*, ingredient:ingredient_id(name, unit, cost_per_unit)').eq('production_ingredient_id', selected.id)).data || [];
    setRecipeItems(updRecs);
  };

  const updateRecipeField = (recipeId: string, field: string, value: any) => {
    setRecipeItems(prev => prev.map(ri => ri.id === recipeId ? { ...ri, [field]: value } : ri));
  };

  const saveRecipeItem = async (recipeId: string) => {
    const ri = recipeItems.find(r => r.id === recipeId);
    if (!ri) return;
    await supabase.from('production_recipes').update({ quantity: parseFloat(ri.quantity) || 0, unit: ri.unit || 'g' }).eq('id', recipeId);
  };

  const deleteRecipeItem = async (recipeId: string) => {
    await supabase.from('production_recipes').delete().eq('id', recipeId);
    setRecipeItems(prev => prev.filter(ri => ri.id !== recipeId));
    await load();
  };

  // Produce: deduct ingredients, add to production stock
  const handleProduce = async () => {
    if (!selected || !user) return;
    const qty = parseFloat(produceQty) || 0;
    if (qty <= 0) { Alert.alert('', 'Ingresa cantidad'); return; }
    if (recipeItems.length === 0) { Alert.alert('', 'Agrega ingredientes a la receta primero'); return; }

    try {
      // Deduct ingredients
      for (const ri of recipeItems) {
        const needed = ri.quantity * qty;
        const { data: cur } = await supabase.from('ingredients').select('stock_current').eq('id', ri.ingredient_id).single();
        if (cur) {
          const newStock = Math.max(0, (cur.stock_current || 0) - needed);
          await supabase.from('ingredients').update({ stock_current: newStock }).eq('id', ri.ingredient_id);
        }
      }

      // Add to production stock
      const { data: cur } = await supabase.from('ingredients').select('stock_current').eq('id', selected.id).single();
      if (cur) {
        await supabase.from('ingredients').update({
          stock_current: (cur.stock_current || 0) + qty,
          cost_per_unit: recipeCost > 0 ? Math.round(recipeCost) : selected.cost_per_unit,
        }).eq('id', selected.id);
      }

      // Log
      await supabase.from('production_logs').insert({
        production_ingredient_id: selected.id, quantity_produced: qty, produced_by: user.id,
      });

      Alert.alert('✅ Producción registrada', `${qty} ${selected.unit} de ${selected.name}`);
      setProduceModal(false);
      setProduceQty('1');
      await load();
      selectProduction({ ...selected, stock_current: (cur?.stock_current || 0) + qty });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  // Create new production ingredient
  const createProduction = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from('ingredients').insert({
      name: newName.trim(), unit: newUnit, stock_current: 0, stock_min: 0,
      cost_per_unit: 0, category: 'Producción', is_production: true, active: true,
    });
    if (error) { Alert.alert('Error', error.message); return; }
    setNewModal(false); setNewName(''); setNewUnit('unidad');
    await load();
  };

  const filtered = productions.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const baseIngredients = allIngredients.filter(i => !i.is_production);

  return (
    <View style={st.wrap}>
      {/* Sidebar */}
      <View style={st.side}>
        <View style={st.sideHdr}>
          <Text style={st.sideTitle}>Producción</Text>
          <TouchableOpacity style={st.newBtn} onPress={() => setNewModal(true)}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>+ Nuevo</Text>
          </TouchableOpacity>
        </View>
        <TextInput style={st.sideSearch} placeholder="Buscar..." placeholderTextColor="#999" value={search} onChangeText={setSearch} />
        {/* Low stock alert */}
        {(() => {
          const lowStock = productions.filter(p => p.stock_min > 0 && (p.stock_current || 0) <= p.stock_min);
          if (lowStock.length === 0) return null;
          return (
            <View style={{ backgroundColor: '#E53935', paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>⚠ Stock bajo: {lowStock.map(p => p.name).join(', ')}</Text>
            </View>
          );
        })()}
        <ScrollView>
          {filtered.map(p => {
            const isActive = selected?.id === p.id;
            const recCount = recipes.filter(r => r.production_ingredient_id === p.id).length;
            const isLow = p.stock_min > 0 && (p.stock_current || 0) <= p.stock_min;
            return (
              <TouchableOpacity key={p.id} style={[st.sideItem, isActive && st.sideItemActive]} onPress={() => selectProduction(p)}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.sideItemT, isActive && st.sideItemTA]}>{p.name}</Text>
                  <Text style={{ fontSize: 10, color: isActive ? '#ffffffaa' : isLow ? '#E53935' : '#888' }}>
                    Stock: {p.stock_current || 0}{p.stock_min > 0 ? '/' + p.stock_min : ''} {p.unit} · {recCount} ing.
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: isActive ? '#fff' : COLORS.primary, fontWeight: '600' }}>{fmt(p.cost_per_unit || 0)}</Text>
                  {isLow && !isActive && <Text style={{ fontSize: 9, color: '#E53935', fontWeight: '700' }}>⚠ BAJO</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Detail */}
      <View style={st.detail}>
        {selected ? (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text }}>{selected.name}</Text>
              <TouchableOpacity style={[st.newBtn, { paddingHorizontal: 16, paddingVertical: 10 }]} onPress={() => setProduceModal(true)}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>🏭 Producir</Text>
              </TouchableOpacity>
            </View>

            {/* Stock info editable */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16, backgroundColor: COLORS.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, marginBottom: 4 }}>STOCK ACTUAL</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: selected.stock_min > 0 && (selected.stock_current || 0) <= selected.stock_min ? '#E53935' : COLORS.primary }}>{selected.stock_current || 0}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>{selected.unit}</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, marginBottom: 4 }}>STOCK MÍNIMO</Text>
                <TextInput
                  style={{ fontSize: 20, fontWeight: '700', color: COLORS.text, backgroundColor: COLORS.background, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 4, textAlign: 'center' }}
                  value={String(selected.stock_min || 0)}
                  onChangeText={v => {
                    const val = parseInt(v) || 0;
                    setSelected((prev: any) => ({ ...prev, stock_min: val }));
                  }}
                  onBlur={async () => {
                    await supabase.from('ingredients').update({ stock_min: selected.stock_min || 0 }).eq('id', selected.id);
                    await load();
                  }}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, marginBottom: 4 }}>COSTO UNIT.</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center' }}>{fmt(selected.cost_per_unit || 0)}</Text>
              </View>
            </View>

            {/* Recipe */}
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>RECETA DE PRODUCCIÓN</Text>
            {recipeItems.length === 0 && <Text style={{ color: COLORS.textMuted, marginBottom: 12 }}>Sin ingredientes. Agrega abajo.</Text>}
            {/* Table header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: COLORS.border, marginBottom: 4 }}>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>Ingrediente</Text>
              <Text style={{ width: 70, fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' }}>Cant.</Text>
              <Text style={{ width: 90, fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' }}>Unidad</Text>
              <Text style={{ width: 80, fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textAlign: 'right' }}>Costo</Text>
              <View style={{ width: 28 }} />
            </View>
            {recipeItems.map(ri => {
              const units = ri.ingredient?.unit === 'kg' || ri.unit === 'kg' || ri.unit === 'g' ? ['g', 'kg'] :
                ri.ingredient?.unit === 'lt' || ri.unit === 'lt' || ri.unit === 'ml' ? ['ml', 'lt'] : ['unidad', 'g', 'kg', 'ml', 'lt'];
              const currentUnit = ri.unit || ri.ingredient?.unit || 'g';
              // Convertir para costo: si ingrediente es por kg y receta en g, dividir por 1000
              const costPerUnit = ri.ingredient?.cost_per_unit || 0;
              const qtyNum = parseFloat(ri.quantity) || 0;
              let costCalc = costPerUnit * qtyNum;
              if (ri.ingredient?.unit === 'kg' && currentUnit === 'g') costCalc = costPerUnit * qtyNum / 1000;
              if (ri.ingredient?.unit === 'lt' && currentUnit === 'ml') costCalc = costPerUnit * qtyNum / 1000;
              return (
                <View key={ri.id} style={st.recipeRow}>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text }}>{ri.ingredient?.name}</Text>
                  <TextInput style={[st.qtyInput, { width: 70 }]} value={String(ri.quantity)} onChangeText={v => updateRecipeField(ri.id, 'quantity', v)} keyboardType="decimal-pad" />
                  <View style={{ width: 90, flexDirection: 'row', gap: 2, justifyContent: 'center' }}>
                    {units.map(u => (
                      <TouchableOpacity key={u} onPress={() => updateRecipeField(ri.id, 'unit', u)}
                        style={{ paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: currentUnit === u ? COLORS.primary : COLORS.background, borderWidth: 1, borderColor: currentUnit === u ? COLORS.primary : COLORS.border }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: currentUnit === u ? '#fff' : COLORS.textMuted }}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.text, width: 80, textAlign: 'right' }}>{fmt(costCalc)}</Text>
                  <TouchableOpacity onPress={() => deleteRecipeItem(ri.id)} style={{ marginLeft: 4, width: 24, alignItems: 'center' }}><Text style={{ color: COLORS.error, fontSize: 14 }}>✕</Text></TouchableOpacity>
                </View>
              );
            })}
            {recipeItems.length > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 2, borderTopColor: COLORS.primary, marginTop: 8 }}>
                <TouchableOpacity style={{ backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }} onPress={async () => {
                  for (const ri of recipeItems) await saveRecipeItem(ri.id);
                  // Actualizar costo del item de producción
                  const totalCost = recipeItems.reduce((a, ri) => {
                    const cpu = ri.ingredient?.cost_per_unit || 0;
                    const q = parseFloat(ri.quantity) || 0;
                    const u = ri.unit || ri.ingredient?.unit || 'g';
                    let c = cpu * q;
                    if (ri.ingredient?.unit === 'kg' && u === 'g') c = cpu * q / 1000;
                    if (ri.ingredient?.unit === 'lt' && u === 'ml') c = cpu * q / 1000;
                    return a + c;
                  }, 0);
                  await supabase.from('ingredients').update({ cost_per_unit: Math.round(totalCost) }).eq('id', selected.id);
                  Alert.alert('✅ Receta guardada', `Costo actualizado: ${fmt(totalCost)}`);
                  await load();
                }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>💾 Guardar receta</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.primary }}>Costo total: {fmt(recipeCost)}</Text>
              </View>
            )}

            {/* Add ingredient */}
            <View style={{ marginTop: 16 }}>
              <TextInput style={st.searchInput} placeholder="🔍 Agregar ingrediente a la receta..." placeholderTextColor={COLORS.textMuted} value={ingSearch} onChangeText={setIngSearch} />
              {ingSearch.length >= 2 && (
                <View style={{ backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, maxHeight: 150 }}>
                  <ScrollView nestedScrollEnabled>
                    {baseIngredients.filter(i => i.name.toLowerCase().includes(ingSearch.toLowerCase())).slice(0, 10).map(i => (
                      <TouchableOpacity key={i.id} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between' }} onPress={() => addToRecipe(i)}>
                        <Text style={{ fontSize: 13, color: COLORS.text }}>{i.name}</Text>
                        <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{i.unit} · {fmt(i.cost_per_unit || 0)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Recent logs */}
            {logs.filter(l => l.production_ingredient_id === selected.id).length > 0 && (
              <View style={{ marginTop: 24 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>HISTORIAL DE PRODUCCIÓN</Text>
                {logs.filter(l => l.production_ingredient_id === selected.id).slice(0, 10).map(l => (
                  <View key={l.id} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: COLORS.textMuted, width: 100 }}>{new Date(l.created_at).toLocaleDateString('es-CL')}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.success, flex: 1 }}>+{l.quantity_produced} {selected.unit}</Text>
                    <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{l.producer?.name || '-'}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 40 }}>🏭</Text>
            <Text style={{ color: COLORS.textMuted, marginTop: 8 }}>Selecciona un item de producción</Text>
          </View>
        )}
      </View>

      {/* Produce Modal */}
      <Modal visible={produceModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 24, width: '90%', maxWidth: 400 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 12 }}>🏭 Producir: {selected?.name}</Text>
            <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>Costo por unidad: {fmt(recipeCost)} · {recipeItems.length} ingredientes</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4 }}>Cantidad a producir</Text>
            <TextInput style={{ backgroundColor: COLORS.background, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, padding: 12, fontSize: 24, fontWeight: '800', textAlign: 'center', color: COLORS.text }} value={produceQty} onChangeText={setProduceQty} keyboardType="decimal-pad" autoFocus />
            <Text style={{ fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 }}>Se descontarán los ingredientes del stock</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }} onPress={() => setProduceModal(false)}>
                <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center' }} onPress={handleProduce}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Producir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* New Production Modal */}
      <Modal visible={newModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 24, width: '90%', maxWidth: 400 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 12 }}>Nuevo Item Producción</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4 }}>Nombre</Text>
            <TextInput style={st.searchInput} value={newName} onChangeText={setNewName} placeholder="Ej: Masa Pizza, Pollo Apanado..." placeholderTextColor={COLORS.textMuted} autoFocus />
            <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4, marginTop: 12 }}>Unidad</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {['unidad', 'kg', 'lt', 'porción'].map(u => (
                <TouchableOpacity key={u} onPress={() => setNewUnit(u)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: newUnit === u ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: newUnit === u ? COLORS.primary : COLORS.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: newUnit === u ? '#fff' : COLORS.textSecondary }}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }} onPress={() => setNewModal(false)}>
                <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center' }} onPress={createProduction}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.background },
  side: { width: 260, backgroundColor: '#3C3C3C' },
  sideHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  sideTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  newBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  sideSearch: { backgroundColor: '#4A4A4A', borderRadius: 8, marginHorizontal: 10, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#fff' },
  sideItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#4A4A4A', flexDirection: 'row', alignItems: 'center' },
  sideItemActive: { backgroundColor: COLORS.primary },
  sideItemT: { fontSize: 13, color: '#CCC' },
  sideItemTA: { color: '#fff', fontWeight: '700' },
  detail: { flex: 1 },
  recipeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8 },
  qtyInput: { backgroundColor: COLORS.background, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, color: COLORS.text, textAlign: 'center' },
  searchInput: { backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: COLORS.text },
});
