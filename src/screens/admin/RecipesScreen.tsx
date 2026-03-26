// src/screens/admin/RecipesScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, FlatList } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';
import { SearchRow, Chip, LB, fmt, sh } from './shared';

export default function RecipesScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [detailModal, setDetailModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [recipeItems, setRecipeItems] = useState<any[]>([]);
  const [addIngModal, setAddIngModal] = useState(false);
  const [ingSearch, setIngSearch] = useState('');
  const [newIngId, setNewIngId] = useState('');
  const [newIngQty, setNewIngQty] = useState('');
  const [recipeCost, setRecipeCost] = useState({ total_cost: 0, suggested_net: 0, suggested_price: 0 });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: p } = await supabase.from('products').select('*, category:category_id(name)').eq('active', true).order('name');
    const { data: r } = await supabase.from('recipes').select('*');
    const { data: i } = await supabase.from('ingredients').select('*').eq('active', true).order('name');
    if (p) setProducts(p);
    if (r) setRecipes(r);
    if (i) setIngredients(i);
  };

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const getRecipe = (productId: string) => recipes.find(r => r.product_id === productId);
  const hasRecipe = (productId: string) => !!getRecipe(productId);

  const openRecipe = async (product: any) => {
    setSelectedProduct(product);
    let recipe = getRecipe(product.id);

    if (!recipe) {
      const { data, error } = await supabase.from('recipes').insert({ product_id: product.id }).select().single();
      if (error) { Alert.alert('Error', error.message); return; }
      recipe = data;
      setRecipes(prev => [...prev, data]);
    }

    const { data: items } = await supabase.from('recipe_items').select('*, ingredient:ingredient_id(name, unit, cost_per_unit)').eq('recipe_id', recipe.id).order('created_at');
    setRecipeItems(items || []);
    await calcCost(recipe.id);
    setDetailModal(true);
  };

  const calcCost = async (recipeId: string) => {
    const { data } = await supabase.rpc('calculate_recipe_cost', { p_recipe_id: recipeId });
    if (data && data.length > 0) setRecipeCost(data[0]);
    else setRecipeCost({ total_cost: 0, suggested_net: 0, suggested_price: 0 });
  };

  const addIngredient = async () => {
    if (!newIngId || !newIngQty) { Alert.alert('Error', 'Selecciona ingrediente y cantidad'); return; }
    const recipe = getRecipe(selectedProduct.id);
    if (!recipe) return;
    try {
      await supabase.from('recipe_items').insert({ recipe_id: recipe.id, ingredient_id: newIngId, quantity: parseFloat(newIngQty) || 0 });
      const { data: items } = await supabase.from('recipe_items').select('*, ingredient:ingredient_id(name, unit, cost_per_unit)').eq('recipe_id', recipe.id).order('created_at');
      setRecipeItems(items || []);
      await calcCost(recipe.id);
      setAddIngModal(false); setNewIngId(''); setNewIngQty(''); setIngSearch('');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const removeIngredient = async (itemId: string) => {
    const recipe = getRecipe(selectedProduct.id);
    await supabase.from('recipe_items').delete().eq('id', itemId);
    const { data: items } = await supabase.from('recipe_items').select('*, ingredient:ingredient_id(name, unit, cost_per_unit)').eq('recipe_id', recipe.id).order('created_at');
    setRecipeItems(items || []);
    await calcCost(recipe.id);
  };

  const fmtDec = (n: number) => '$' + n.toFixed(1);
  const foodCostPct = selectedProduct?.price > 0 ? ((recipeCost.total_cost / (selectedProduct.price / 1.19)) * 100) : 0;

  return (
    <View style={sh.c}>
      <SearchRow search={search} setSearch={setSearch} onAdd={() => {}} addLabel="📋 Recetas" />
      <Text style={sh.count}>{filtered.length} productos • {recipes.length} con receta</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {filtered.map(p => {
          const has = hasRecipe(p.id);
          return (
            <TouchableOpacity key={p.id} style={[sh.row, has && { borderColor: COLORS.success + '50' }]} onPress={() => openRecipe(p)}>
              <View style={{ flex: 1 }}>
                <Text style={sh.rowName}>{p.name}</Text>
                <Text style={sh.rowSub}>{p.category?.name} • Precio: {fmt(p.price)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {has ? (
                  <View style={{ backgroundColor: COLORS.success + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.success }}>CON RECETA</Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: COLORS.textMuted + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted }}>SIN RECETA</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* RECIPE DETAIL MODAL */}
      <Modal visible={detailModal} animationType="slide">
        <View style={sh.c}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
            <TouchableOpacity onPress={() => setDetailModal(false)}><Text style={{ color: COLORS.primary, fontSize: 15, fontWeight: '600' }}>← Volver</Text></TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }} numberOfLines={1}>{selectedProduct?.name}</Text>
            <TouchableOpacity onPress={() => { setIngSearch(''); setNewIngId(''); setNewIngQty(''); setAddIngModal(true); }}>
              <Text style={{ color: COLORS.primary, fontSize: 14, fontWeight: '600' }}>+ Ingrediente</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            {/* FOOD COST BOX */}
            <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: 12 }}>Food Cost</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Costo Receta</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text }}>{fmt(recipeCost.total_cost)}</Text>
                </View>
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Precio Actual</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.primary }}>{fmt(selectedProduct?.price || 0)}</Text>
                </View>
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Food Cost %</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: foodCostPct <= 30 ? COLORS.success : foodCostPct <= 35 ? COLORS.warning : COLORS.error }}>
                    {foodCostPct.toFixed(1)}%
                  </Text>
                </View>
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Precio sugerido (30% FC + 19% IVA)</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.primary }}>{fmt(recipeCost.suggested_price)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Precio neto sugerido</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textSecondary }}>{fmt(recipeCost.suggested_net)}</Text>
                </View>
              </View>
            </View>

            {/* INGREDIENTS TABLE */}
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>
              Ingredientes ({recipeItems.length})
            </Text>

            {/* Header row */}
            <View style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: COLORS.card, borderRadius: 8, marginBottom: 4, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={{ flex: 3, fontSize: 11, fontWeight: '700', color: COLORS.textSecondary }}>Ingrediente</Text>
              <Text style={{ flex: 2, fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textAlign: 'center' }}>Cantidad</Text>
              <Text style={{ flex: 2, fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textAlign: 'right' }}>Costo</Text>
              <Text style={{ width: 30 }}></Text>
            </View>

            {recipeItems.map(ri => {
              const cost = ri.quantity * (ri.ingredient?.cost_per_unit || 0);
              return (
                <View key={ri.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: COLORS.card, borderRadius: 8, marginVertical: 2, borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ flex: 3, fontSize: 13, fontWeight: '600', color: COLORS.text }}>{ri.ingredient?.name}</Text>
                  <Text style={{ flex: 2, fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' }}>{ri.quantity} {ri.ingredient?.unit}</Text>
                  <Text style={{ flex: 2, fontSize: 13, fontWeight: '700', color: COLORS.primary, textAlign: 'right' }}>{fmtDec(cost)}</Text>
                  <TouchableOpacity onPress={() => removeIngredient(ri.id)} style={{ width: 30, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12 }}>🗑</Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            {recipeItems.length === 0 && (
              <Text style={{ textAlign: 'center', color: COLORS.textMuted, marginTop: 20 }}>Sin ingredientes. Presiona "+ Ingrediente" para agregar.</Text>
            )}

            {recipeItems.length > 0 && (
              <View style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, marginTop: 4, borderTopWidth: 2, borderTopColor: COLORS.primary }}>
                <Text style={{ flex: 3, fontSize: 14, fontWeight: '800', color: COLORS.text }}>TOTAL</Text>
                <Text style={{ flex: 2 }}></Text>
                <Text style={{ flex: 2, fontSize: 14, fontWeight: '800', color: COLORS.primary, textAlign: 'right' }}>{fmt(recipeCost.total_cost)}</Text>
                <View style={{ width: 30 }} />
              </View>
            )}
          </ScrollView>
        </View>

        {/* ADD INGREDIENT MODAL */}
        <Modal visible={addIngModal} transparent animationType="fade">
          <View style={sh.ov}><View style={sh.md}>
            <Text style={sh.mdT}>Agregar Ingrediente</Text>
            <LB text="Buscar ingrediente" />
            <TextInput style={sh.inp} placeholder="🔍 Buscar..." placeholderTextColor={COLORS.textMuted} value={ingSearch} onChangeText={setIngSearch} autoFocus />
            <ScrollView style={{ maxHeight: 200, marginTop: 8 }}>
              {ingredients.filter(i => !ingSearch || i.name.toLowerCase().includes(ingSearch.toLowerCase())).map(i => (
                <TouchableOpacity key={i.id} onPress={() => setNewIngId(i.id)}
                  style={[sh.row, { marginVertical: 2 }, newIngId === i.id && { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10' }]}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text, flex: 1 }}>{i.name}</Text>
                  <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>{i.unit} • {fmt(i.cost_per_unit)}/{i.unit}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {newIngId && (<>
              <LB text={`Cantidad (${ingredients.find(i => i.id === newIngId)?.unit || 'unidad'})`} />
              <TextInput style={[sh.inp, { fontSize: 20, textAlign: 'center', fontWeight: '700' }]} placeholder="0" placeholderTextColor={COLORS.textMuted} keyboardType="decimal-pad" value={newIngQty} onChangeText={setNewIngQty} />
              {newIngQty && parseFloat(newIngQty) > 0 && (() => {
                const ing = ingredients.find(i => i.id === newIngId);
                const cost = parseFloat(newIngQty) * (ing?.cost_per_unit || 0);
                return <Text style={{ textAlign: 'center', marginTop: 6, fontSize: 14, fontWeight: '700', color: COLORS.primary }}>Costo: {fmtDec(cost)}</Text>;
              })()}
            </>)}
            <View style={sh.mBs}>
              <TouchableOpacity style={sh.bC} onPress={() => setAddIngModal(false)}><Text style={sh.bCT}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={sh.bOk} onPress={addIngredient}><Text style={sh.bOkT}>Agregar</Text></TouchableOpacity>
            </View>
          </View></View>
        </Modal>
      </Modal>
    </View>
  );
}
