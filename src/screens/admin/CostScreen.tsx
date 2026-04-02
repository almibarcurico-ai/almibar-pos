import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';

const IVA = 0.19;
const DEFAULT_FOOD_COST = 0.30; // 30%

const fmtN = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');
const pct = (n: number) => Math.round(n * 100) + '%';

export default function CostScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [recipeItems, setRecipeItems] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [targetCost, setTargetCost] = useState(DEFAULT_FOOD_COST);
  const [editingPrice, setEditingPrice] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<'name' | 'cost' | 'margin' | 'foodcost'>('name');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [pR, cR, iR, rR, riR] = await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('name'),
      supabase.from('categories').select('*').eq('active', true).order('sort_order'),
      supabase.from('ingredients').select('*').eq('active', true),
      supabase.from('recipes').select('*'),
      supabase.from('recipe_items').select('*'),
    ]);
    if (pR.data) setProducts(pR.data);
    if (cR.data) setCategories(cR.data);
    if (iR.data) setIngredients(iR.data);
    if (rR.data) setRecipes(rR.data);
    if (riR.data) setRecipeItems(riR.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Calculate cost for each product
  const calcCost = (productId: string) => {
    const recipe = recipes.find(r => r.product_id === productId);
    if (!recipe) return 0;
    const items = recipeItems.filter(ri => ri.recipe_id === recipe.id);
    return items.reduce((total, ri) => {
      const ing = ingredients.find(i => i.id === ri.ingredient_id);
      if (!ing) return total;
      const cpu = ing.cost_per_unit || 0;
      const qty = ri.quantity || 0;
      const iu = (ing.unit || '').toLowerCase();
      const ru = (ri.unit || iu).toLowerCase();
      // Conversión de unidades
      if (iu === 'kg' && ru === 'g') return total + cpu * qty / 1000;
      if (iu === 'lt' && ru === 'ml') return total + cpu * qty / 1000;
      if (iu === 'g' && ru === 'kg') return total + cpu * qty * 1000;
      if (iu === 'ml' && ru === 'lt') return total + cpu * qty * 1000;
      return total + cpu * qty;
    }, 0);
  };

  // Build product data with all calculations
  const productData = products.map(p => {
    const cost = calcCost(p.id); // Costo receta (neto)
    const precioCartaNeto = p.price / (1 + IVA); // Precio carta sin IVA
    const precioSugeridoNeto = cost > 0 ? cost / targetCost : 0; // Precio neto al % objetivo
    const precioSugeridoBruto = Math.round(precioSugeridoNeto * (1 + IVA)); // + IVA
    const foodCostReal = precioCartaNeto > 0 ? cost / precioCartaNeto : 0;
    const margenNeto = precioCartaNeto - cost;
    const margenPct = precioCartaNeto > 0 ? margenNeto / precioCartaNeto : 0;
    const catName = categories.find(c => c.id === p.category_id)?.name || '?';
    const recipeCount = recipes.find(r => r.product_id === p.id) ? recipeItems.filter(ri => ri.recipe_id === recipes.find(r => r.product_id === p.id)?.id).length : 0;

    return {
      ...p, cost, precioCartaNeto, precioSugeridoNeto, precioSugeridoBruto,
      foodCostReal, margenNeto, margenPct, catName, recipeCount,
    };
  });

  // Filter and sort
  let filtered = productData.filter(p => {
    if (selectedCat && p.category_id !== selectedCat) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (sortBy === 'cost') filtered.sort((a, b) => b.cost - a.cost);
  else if (sortBy === 'margin') filtered.sort((a, b) => a.margenPct - b.margenPct);
  else if (sortBy === 'foodcost') filtered.sort((a, b) => b.foodCostReal - a.foodCostReal);
  else filtered.sort((a, b) => a.name.localeCompare(b.name));

  // Stats
  const withCost = productData.filter(p => p.cost > 0);
  const avgFoodCost = withCost.length > 0 ? withCost.reduce((a, p) => a + p.foodCostReal, 0) / withCost.length : 0;
  const overTarget = withCost.filter(p => p.foodCostReal > targetCost);
  const noCost = productData.filter(p => p.cost === 0);

  // Save price
  const savePrice = async (productId: string) => {
    const val = editingPrice[productId];
    if (!val) return;
    const newPrice = parseInt(val) || 0;
    if (newPrice <= 0) return;
    await supabase.from('products').update({ price: newPrice }).eq('id', productId);
    setEditingPrice(prev => { const n = { ...prev }; delete n[productId]; return n; });
    await load();
    Alert.alert('✅ Precio actualizado', 'El menú se actualizó automáticamente');
  };

  const fcColor = (fc: number) => fc <= 0.25 ? COLORS.success : fc <= targetCost ? '#E8C44A' : fc <= 0.40 ? COLORS.primary : COLORS.error;

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.textMuted }}>Cargando costos...</Text></View>;

  return (
    <View style={st.wrap}>
      {/* Sidebar */}
      <View style={st.side}>
        <View style={st.sideHdr}>
          <Text style={st.sideTitle}>Costos</Text>
        </View>

        {/* Target food cost */}
        <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#4A4A4A' }}>
          <Text style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>FOOD COST OBJETIVO</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {[0.25, 0.30, 0.35, 0.40].map(t => (
              <TouchableOpacity key={t} onPress={() => setTargetCost(t)}
                style={{ flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: targetCost === t ? COLORS.primary : '#4A4A4A', alignItems: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: targetCost === t ? '#000' : '#CCC' }}>{Math.round(t * 100)}%</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Stats */}
        <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#4A4A4A' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 10, color: '#888' }}>Food cost promedio</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: fcColor(avgFoodCost) }}>{pct(avgFoodCost)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 10, color: '#888' }}>Sobre objetivo</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: overTarget.length > 0 ? COLORS.error : COLORS.success }}>{overTarget.length}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 10, color: '#888' }}>Sin receta</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#888' }}>{noCost.length}</Text>
          </View>
        </View>

        {/* Categories */}
        <TouchableOpacity style={[st.sideItem, !selectedCat && st.sideItemActive]} onPress={() => setSelectedCat(null)}>
          <Text style={[st.sideItemT, !selectedCat && st.sideItemTA]}>Todos ({productData.length})</Text>
        </TouchableOpacity>
        <ScrollView>
          {categories.map(c => {
            const count = productData.filter(p => p.category_id === c.id).length;
            if (count === 0) return null;
            const isActive = selectedCat === c.id;
            return (
              <TouchableOpacity key={c.id} style={[st.sideItem, isActive && st.sideItemActive]} onPress={() => setSelectedCat(c.id)}>
                <Text style={[st.sideItemT, isActive && st.sideItemTA]}>{c.name} ({count})</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main content */}
      <View style={{ flex: 1 }}>
        {/* Toolbar */}
        <View style={{ flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center' }}>
          <TextInput style={st.searchInput} placeholder="🔍 Buscar producto..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} />
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {([['name', 'A-Z'], ['cost', 'Costo'], ['foodcost', 'FC%'], ['margin', 'Margen']] as const).map(([k, l]) => (
              <TouchableOpacity key={k} onPress={() => setSortBy(k as any)}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: sortBy === k ? COLORS.primary : COLORS.background, borderWidth: 1, borderColor: sortBy === k ? COLORS.primary : COLORS.border }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: sortBy === k ? '#fff' : COLORS.textSecondary }}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Table header */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FAFAFA', borderBottomWidth: 2, borderBottomColor: COLORS.border }}>
          <Text style={[st.th, { flex: 1 }]}>Producto</Text>
          <Text style={[st.th, { width: 70, textAlign: 'right' }]}>Costo</Text>
          <Text style={[st.th, { width: 80, textAlign: 'right' }]}>Sugerido</Text>
          <Text style={[st.th, { width: 90, textAlign: 'right' }]}>P. Carta</Text>
          <Text style={[st.th, { width: 55, textAlign: 'center' }]}>FC%</Text>
          <Text style={[st.th, { width: 70, textAlign: 'right' }]}>Margen</Text>
        </View>

        {/* Products */}
        <ScrollView>
          {filtered.map((p, i) => (
            <View key={p.id} style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: i % 2 === 0 ? COLORS.card : COLORS.background, alignItems: 'center' }}>
              {/* Name + category */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }} numberOfLines={1}>{p.name}</Text>
                <Text style={{ fontSize: 9, color: COLORS.textMuted }}>{p.catName} · {p.recipeCount > 0 ? `${p.recipeCount} ing.` : 'Sin receta'}</Text>
              </View>

              {/* Costo receta (neto) */}
              <Text style={{ width: 70, fontSize: 12, color: p.cost > 0 ? COLORS.text : COLORS.textMuted, textAlign: 'right' }}>
                {p.cost > 0 ? fmtN(p.cost) : '-'}
              </Text>

              {/* Precio sugerido (bruto con IVA) */}
              <Text style={{ width: 80, fontSize: 12, color: p.precioSugeridoBruto > 0 ? COLORS.textSecondary : COLORS.textMuted, textAlign: 'right' }}>
                {p.precioSugeridoBruto > 0 ? fmtN(p.precioSugeridoBruto) : '-'}
              </Text>

              {/* Precio carta (editable) */}
              <View style={{ width: 90, alignItems: 'flex-end' }}>
                <TextInput
                  style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary, textAlign: 'right', backgroundColor: editingPrice[p.id] !== undefined ? COLORS.background : 'transparent', borderRadius: 4, borderWidth: editingPrice[p.id] !== undefined ? 1 : 0, borderColor: COLORS.primary, paddingHorizontal: 6, paddingVertical: 2, width: 80 }}
                  value={editingPrice[p.id] !== undefined ? editingPrice[p.id] : fmtN(p.price).replace('$', '')}
                  onFocus={() => setEditingPrice(prev => ({ ...prev, [p.id]: String(p.price) }))}
                  onChangeText={v => setEditingPrice(prev => ({ ...prev, [p.id]: v.replace(/\D/g, '') }))}
                  onBlur={() => savePrice(p.id)}
                  keyboardType="number-pad"
                />
              </View>

              {/* Food cost % */}
              <View style={{ width: 55, alignItems: 'center' }}>
                {p.cost > 0 ? (
                  <View style={{ backgroundColor: fcColor(p.foodCostReal) + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: fcColor(p.foodCostReal) + '40' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: fcColor(p.foodCostReal) }}>{pct(p.foodCostReal)}</Text>
                  </View>
                ) : <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>-</Text>}
              </View>

              {/* Margen */}
              <Text style={{ width: 70, fontSize: 12, fontWeight: '600', color: p.margenNeto > 0 ? COLORS.success : p.cost > 0 ? COLORS.error : COLORS.textMuted, textAlign: 'right' }}>
                {p.cost > 0 ? fmtN(p.margenNeto) : '-'}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.background },
  side: { width: 220, backgroundColor: '#3C3C3C' },
  sideHdr: { padding: 14 },
  sideTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  sideItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#4A4A4A' },
  sideItemActive: { backgroundColor: COLORS.primary },
  sideItemT: { fontSize: 12, color: '#CCC' },
  sideItemTA: { color: '#fff', fontWeight: '700' },
  searchInput: { flex: 1, backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: COLORS.text },
  th: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
});
