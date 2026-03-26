// src/screens/RecipesScreen.tsx - Recipes with food cost calculation
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { COLORS } from '../theme';

export default function RecipesScreen({ onBack }: { onBack: () => void }) {
  const [products, setProducts] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [recipeModal, setRecipeModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [recipeItems, setRecipeItems] = useState<any[]>([]);
  const [addIngModal, setAddIngModal] = useState(false);
  const [ingSearch, setIngSearch] = useState('');
  const [selIng, setSelIng] = useState<any>(null);
  const [selQty, setSelQty] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: p } = await supabase.from('products').select('*').eq('active', true).order('name');
    const { data: r } = await supabase.from('recipes').select('*, recipe_items(*, ingredient:ingredient_id(*))').order('created_at');
    const { data: i } = await supabase.from('ingredients').select('*').eq('active', true).order('name');
    if (p) setProducts(p);
    if (r) setRecipes(r);
    if (i) setIngredients(i);
  };

  const fmt = (p: number) => '$' + Math.round(p).toLocaleString('es-CL');
  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  const getRecipe = (productId: string) => recipes.find((r: any) => r.product_id === productId);

  const calcCost = (items: any[]) => {
    const cost = items.reduce((s: number, ri: any) => {
      const ing = ri.ingredient || ingredients.find((i: any) => i.id === ri.ingredient_id);
      return s + (ri.quantity * (ing?.cost_per_unit || 0));
    }, 0);
    const netSuggested = cost / 0.30;
    const priceSuggested = Math.ceil((netSuggested * 1.19) / 100) * 100;
    return { cost, netSuggested, priceSuggested };
  };

  const openRecipe = async (product: any) => {
    setSelectedProduct(product);
    const existing = getRecipe(product.id);
    if (existing && existing.recipe_items) {
      setRecipeItems(existing.recipe_items);
    } else {
      setRecipeItems([]);
    }
    setRecipeModal(true);
  };

  const addIngredient = () => {
    if (!selIng || !selQty) return;
    const qty = parseFloat(selQty);
    if (!qty || qty <= 0) { Alert.alert('Error', 'Cantidad inválida'); return; }
    setRecipeItems(prev => [...prev, { id: `temp-${Date.now()}`, ingredient_id: selIng.id, ingredient: selIng, quantity: qty }]);
    setAddIngModal(false); setSelIng(null); setSelQty('');
  };

  const removeRecipeItem = (id: string) => {
    setRecipeItems(prev => prev.filter(i => i.id !== id));
  };

  const saveRecipe = async () => {
    if (!selectedProduct) return;
    try {
      let existing = getRecipe(selectedProduct.id);
      let recipeId: string;

      if (existing) {
        recipeId = existing.id;
        await supabase.from('recipe_items').delete().eq('recipe_id', recipeId);
        await supabase.from('recipes').update({ updated_at: new Date().toISOString() }).eq('id', recipeId);
      } else {
        const { data, error } = await supabase.from('recipes').insert({ product_id: selectedProduct.id }).select().single();
        if (error) throw error;
        recipeId = data.id;
      }

      if (recipeItems.length > 0) {
        const items = recipeItems.map(ri => ({ recipe_id: recipeId, ingredient_id: ri.ingredient_id, quantity: ri.quantity }));
        await supabase.from('recipe_items').insert(items);
      }

      setRecipeModal(false);
      Alert.alert('✅ Receta guardada');
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const { cost, netSuggested, priceSuggested } = calcCost(recipeItems);

  return (
    <View style={s.c}>
      <View style={s.hdr}><TouchableOpacity onPress={onBack}><Text style={s.back}>← Admin</Text></TouchableOpacity><Text style={s.hdrT}>📋 Recetas & Food Cost</Text><View style={{ width: 60 }} /></View>
      <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}><TextInput style={s.si} placeholder="🔍 Buscar producto..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} /></View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {filtered.map(p => {
          const r = getRecipe(p.id);
          const hasRecipe = r && r.recipe_items && r.recipe_items.length > 0;
          const rc = hasRecipe ? calcCost(r.recipe_items) : null;
          const fcPercent = rc && p.price > 0 ? Math.round((rc.cost / (p.price / 1.19)) * 100) : 0;
          return (
            <TouchableOpacity key={p.id} style={s.row} onPress={() => openRecipe(p)}>
              <View style={{ flex: 1 }}>
                <Text style={s.rn}>{p.name}</Text>
                <Text style={s.rs}>Precio actual: {fmt(p.price)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {hasRecipe ? (<>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.success }}>Costo: {fmt(rc!.cost)}</Text>
                  <Text style={{ fontSize: 11, color: fcPercent > 35 ? COLORS.error : fcPercent > 30 ? COLORS.warning : COLORS.success }}>FC: {fcPercent}%</Text>
                </>) : (
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Sin receta</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* RECIPE MODAL */}
      <Modal visible={recipeModal} animationType="slide">
        <View style={s.c}>
          <View style={s.hdr}>
            <TouchableOpacity onPress={() => setRecipeModal(false)}><Text style={s.back}>✕ Cerrar</Text></TouchableOpacity>
            <Text style={s.hdrT}>{selectedProduct?.name}</Text>
            <TouchableOpacity style={s.addBtn} onPress={() => { setIngSearch(''); setAddIngModal(true); }}><Text style={s.addBtnT}>+ Ingrediente</Text></TouchableOpacity>
          </View>

          {/* Food cost card */}
          <View style={{ margin: 16, backgroundColor: COLORS.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Costo receta</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text }}>{fmt(cost)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Precio neto sugerido (FC 30%)</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary }}>{fmt(netSuggested)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 2, borderTopColor: COLORS.primary }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.text }}>Precio sugerido (+ IVA 19%)</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.primary }}>{fmt(priceSuggested)}</Text>
            </View>
            {selectedProduct && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Precio actual</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: selectedProduct.price < priceSuggested ? COLORS.error : COLORS.success }}>{fmt(selectedProduct.price)} {selectedProduct.price < priceSuggested ? '⚠️ Bajo' : '✅'}</Text>
              </View>
            )}
          </View>

          {/* Ingredients list */}
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8, textTransform: 'uppercase' }}>Ingredientes ({recipeItems.length})</Text>
            {recipeItems.length === 0 && <Text style={{ color: COLORS.textMuted, textAlign: 'center', marginTop: 20 }}>Agrega ingredientes con el botón "+"</Text>}
            {recipeItems.map((ri, idx) => {
              const ing = ri.ingredient || ingredients.find((i: any) => i.id === ri.ingredient_id);
              const itemCost = ri.quantity * (ing?.cost_per_unit || 0);
              return (
                <View key={ri.id || idx} style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rn}>{ing?.name || 'Ingrediente'}</Text>
                    <Text style={s.rs}>{ri.quantity} {ing?.unit} × {fmt(ing?.cost_per_unit || 0)}/{ing?.unit}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary }}>{fmt(itemCost)}</Text>
                    <TouchableOpacity onPress={() => removeRecipeItem(ri.id)}><Text>🗑</Text></TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Save button */}
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border }}>
            <TouchableOpacity style={[s.addBtn, { paddingVertical: 16, alignItems: 'center', backgroundColor: COLORS.success }]} onPress={saveRecipe}>
              <Text style={s.addBtnT}>💾 Guardar Receta</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Add ingredient modal */}
        <Modal visible={addIngModal} transparent animationType="fade">
          <View style={s.ov}><View style={[s.md, { maxHeight: '80%' as any }]}>
            <Text style={s.mdT}>Agregar Ingrediente</Text>
            <TextInput style={[s.si, { marginVertical: 10 }]} placeholder="🔍 Buscar ingrediente..." placeholderTextColor={COLORS.textMuted} value={ingSearch} onChangeText={setIngSearch} autoFocus />
            <ScrollView style={{ maxHeight: 200 }}>
              {ingredients.filter(i => !ingSearch || i.name.toLowerCase().includes(ingSearch.toLowerCase())).map(i => (
                <TouchableOpacity key={i.id} onPress={() => setSelIng(i)} style={[s.row, { marginVertical: 2 }, selIng?.id === i.id && { borderColor: COLORS.primary }]}>
                  <Text style={s.rn}>{i.name}</Text>
                  <Text style={s.rs}>{i.unit} • {fmt(i.cost_per_unit)}/{i.unit}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {selIng && (<>
              <Text style={s.lb}>Cantidad ({selIng.unit})</Text>
              <TextInput style={[s.inp, { fontSize: 20, textAlign: 'center', fontWeight: '700' }]} value={selQty} onChangeText={setSelQty} keyboardType="decimal-pad" placeholder={`Ej: ${selIng.unit === 'gr' ? '200' : selIng.unit === 'ml' ? '50' : '1'}`} placeholderTextColor={COLORS.textMuted} />
              {selQty && parseFloat(selQty) > 0 && (
                <Text style={{ fontSize: 13, color: COLORS.primary, textAlign: 'center', marginTop: 6, fontWeight: '700' }}>Costo: {fmt(parseFloat(selQty) * selIng.cost_per_unit)}</Text>
              )}
            </>)}
            <View style={s.mBs}>
              <TouchableOpacity style={s.bC} onPress={() => { setAddIngModal(false); setSelIng(null); setSelQty(''); }}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={s.bOk} onPress={addIngredient}><Text style={s.bOkT}>Agregar</Text></TouchableOpacity>
            </View>
          </View></View>
        </Modal>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background }, hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  back: { color: COLORS.primary, fontSize: 15, fontWeight: '600' }, hdrT: { fontSize: 16, fontWeight: '700', color: COLORS.text }, addBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.primary }, addBtnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
  si: { backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginVertical: 3, borderWidth: 1, borderColor: COLORS.border }, rn: { fontSize: 14, fontWeight: '600', color: COLORS.text }, rs: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  ov: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' }, md: { width: '92%' as any, maxWidth: 450, backgroundColor: COLORS.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border }, mdT: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  lb: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginTop: 14 }, inp: { backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text },
  mBs: { flexDirection: 'row', gap: 12, marginTop: 20 }, bC: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }, bCT: { color: COLORS.textSecondary, fontWeight: '600' }, bOk: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' }, bOkT: { color: '#fff', fontWeight: '700' },
});
