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
  const recipeCost = recipeItems.reduce((a, ri) => a + (ri.ingredient?.cost_per_unit || 0) * (parseFloat(ri.quantity) || 0), 0);

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
        <ScrollView>
          {filtered.map(p => {
            const isActive = selected?.id === p.id;
            const recCount = recipes.filter(r => r.production_ingredient_id === p.id).length;
            return (
              <TouchableOpacity key={p.id} style={[st.sideItem, isActive && st.sideItemActive]} onPress={() => selectProduction(p)}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.sideItemT, isActive && st.sideItemTA]}>{p.name}</Text>
                  <Text style={{ fontSize: 10, color: isActive ? '#ffffffaa' : '#888' }}>Stock: {p.stock_current || 0} {p.unit} · {recCount} ingredientes</Text>
                </View>
                <Text style={{ fontSize: 11, color: isActive ? '#fff' : COLORS.primary, fontWeight: '600' }}>{fmt(p.cost_per_unit || 0)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Detail */}
      <View style={st.detail}>
        {selected ? (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text }}>{selected.name}</Text>
                <Text style={{ fontSize: 12, color: COLORS.textMuted }}>Stock: {selected.stock_current || 0} {selected.unit} · Costo: {fmt(selected.cost_per_unit || 0)}</Text>
              </View>
              <TouchableOpacity style={[st.newBtn, { paddingHorizontal: 16, paddingVertical: 10 }]} onPress={() => setProduceModal(true)}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>🏭 Producir</Text>
              </TouchableOpacity>
            </View>

            {/* Recipe */}
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8, letterSpacing: 0.5 }}>RECETA DE PRODUCCIÓN</Text>
            {recipeItems.length === 0 && <Text style={{ color: COLORS.textMuted, marginBottom: 12 }}>Sin ingredientes. Agrega abajo.</Text>}
            {recipeItems.map(ri => (
              <View key={ri.id} style={st.recipeRow}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text }}>{ri.ingredient?.name}</Text>
                <TextInput style={[st.qtyInput, { width: 70 }]} value={String(ri.quantity)} onChangeText={v => updateRecipeField(ri.id, 'quantity', v)} onBlur={() => saveRecipeItem(ri.id)} keyboardType="decimal-pad" />
                <TextInput style={[st.qtyInput, { width: 50 }]} value={ri.unit || ri.ingredient?.unit || 'g'} onChangeText={v => updateRecipeField(ri.id, 'unit', v)} onBlur={() => saveRecipeItem(ri.id)} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.text, width: 80, textAlign: 'right' }}>{fmt((ri.ingredient?.cost_per_unit || 0) * (parseFloat(ri.quantity) || 0))}</Text>
                <TouchableOpacity onPress={() => deleteRecipeItem(ri.id)} style={{ marginLeft: 8 }}><Text style={{ color: COLORS.error, fontSize: 16 }}>✕</Text></TouchableOpacity>
              </View>
            ))}
            {recipeItems.length > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8, borderTopWidth: 2, borderTopColor: COLORS.primary, marginTop: 8 }}>
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
