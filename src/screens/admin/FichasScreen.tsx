import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

export default function FichasScreen({ darkOnly }: { darkOnly?: boolean } = {}) {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [recipeItems, setRecipeItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ingSearch, setIngSearch] = useState('');
  const [showIngDrop, setShowIngDrop] = useState(false);
  const [editQty, setEditQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const COCINA_CATS = ['Burgers & Sándwiches', 'Papas', 'Picoteos & Tablas', 'Pizzas', 'Platos Fríos', 'Salchipapas XL', 'Sushi', 'Pizza York'];
  const DARK_BRANDS = ['Pizza York', 'Sushi Go', 'Monkey Burger'];

  const load = useCallback(async () => {
    const [{ data: p }, { data: c }, { data: i }, { data: r }, { data: ri }] = await Promise.all([
      // darkOnly: include inactive products for recipe cross-reference (Pizza York etc may be inactive in Almíbar)
      darkOnly ? supabase.from('products').select('*').order('name') : supabase.from('products').select('*').eq('active', true).order('name'),
      supabase.from('categories').select('*').eq('active', true).order('name'),
      supabase.from('ingredients').select('*').eq('active', true).order('name'),
      supabase.from('recipes').select('*'),
      supabase.from('recipe_items').select('*'),
    ]);

    if (darkOnly) {
      const { data: dk } = await supabase.from('delivery_products').select('*').eq('is_active', true).order('brand,sort_order');
      if (dk && p) {
        const darkProds = dk.map((dp: any) => {
          const dpName = (dp.name || '').trim().toLowerCase();
          const almMatch = p.find((ap: any) => (ap.name || '').trim().toLowerCase() === dpName);
          return { id: almMatch?.id || dp.id, name: dp.name, price: Number(dp.price), category_id: dp.brand, _brand: dp.brand, _darkId: dp.id };
        });
        setProducts(darkProds);
        setCategories(DARK_BRANDS.map(b => ({ id: b, name: b })));
      }
    } else {
      if (p) setProducts(p);
      if (c) setCategories(c);
    }
    if (i) setIngredients(i);
    if (r) setRecipes(r);
    if (ri) setRecipeItems(ri);
  }, [darkOnly]);

  useEffect(() => { load(); }, [load]);

  const getRecipe = (productId: string) => recipes.find(r => r.product_id === productId);

  const getItems = (productId: string) => {
    const recipe = getRecipe(productId);
    if (!recipe) return [];
    return recipeItems.filter(ri => ri.recipe_id === recipe.id).map(ri => {
      const ing = ingredients.find(i => i.id === ri.ingredient_id);
      if (!ing) return null;
      const cpu = Number(ing.cost_per_unit) || 0;
      const qty = Number(ri.quantity) || 0;
      const iu = (ing.unit || '').toLowerCase();
      const ru = (ri.unit || iu).toLowerCase();
      // Convert units: if ingredient is in kg but recipe says g, divide by 1000
      let cost = qty * cpu;
      if (iu === 'kg' && ru === 'g') cost = qty * cpu / 1000;
      else if (iu === 'lt' && ru === 'ml') cost = qty * cpu / 1000;
      else if (iu === 'g' && ru === 'kg') cost = qty * cpu * 1000;
      else if (iu === 'ml' && ru === 'lt') cost = qty * cpu * 1000;
      return { riId: ri.id, ingId: ing.id, name: ing.name, qty, unit: ri.unit || ing.unit, ingUnit: iu, cpu, cost: Math.round(cost) };
    }).filter(Boolean);
  };

  const calcCost = (productId: string) => getItems(productId).reduce((s, i: any) => s + i.cost, 0);

  // Build display list
  const allProds = products.map(p => {
    const cat = categories.find(c => c.id === p.category_id);
    const catName = cat?.name || (p._brand || '?');
    const isCocina = COCINA_CATS.some(c => catName.includes(c));
    const items = getItems(p.id);
    const cost = items.reduce((s: number, i: any) => s + i.cost, 0);
    const hasRecipe = items.length > 0;
    return { ...p, catName, section: isCocina ? 'cocina' : 'barra', cost, items, hasRecipe };
  });

  // Include ALL products (with and without recipe) so user can create recipes
  const filtered = filter === 'all' ? allProds
    : darkOnly ? allProds.filter(p => p.catName === filter)
    : allProds.filter(p => p.section === filter);

  const grouped: Record<string, any[]> = {};
  filtered.forEach(p => { if (!grouped[p.catName]) grouped[p.catName] = []; grouped[p.catName].push(p); });

  // ── CRUD Operations ──
  const addIngredient = async (productId: string, ingredientId: string) => {
    // For dark kitchen products, the productId might be from delivery_products (no match in products)
    // Check if there's a recipe already; if not, check if productId exists in products table
    let recipe = getRecipe(productId);
    if (!recipe) {
      // Verify productId exists in products table (recipes FK requires it)
      const prodExists = products.find(p => p.id === productId);
      let targetId = productId;

      // If productId doesn't exist in products (it's a delivery_products id), we can't create recipe
      if (!prodExists || prodExists._darkId) {
        // Find by name in all products (including inactive)
        const pName = products.find(p => p.id === productId)?.name;
        if (pName) {
          const { data: almMatch } = await supabase.from('products').select('id').ilike('name', pName).limit(1).single();
          if (almMatch) {
            targetId = almMatch.id;
          } else {
            // Create product in products table for recipe FK (as inactive, dark kitchen only)
            const dp = products.find(pp => pp.id === productId);
            const { data: newProd } = await supabase.from('products').insert({
              name: pName, price: dp?.price || 0, active: false,
              category_id: 'd0000000-0000-0000-0000-000000000099', // Descontinuados
              description: `[Dark Kitchen: ${dp?._brand || ''}]`,
            }).select().single();
            if (newProd) { targetId = newProd.id; }
            else { Alert.alert('Error', 'No se pudo crear producto para receta'); return; }
          }
        } else { Alert.alert('Error', 'Producto no encontrado'); return; }
      }

      const { data } = await supabase.from('recipes').insert({ product_id: targetId, yield_portions: 1 }).select().single();
      if (!data) { Alert.alert('Error', 'No se pudo crear receta'); return; }
      recipe = data;
    }
    const ing = ingredients.find(i => i.id === ingredientId);
    const defaultQty = (ing?.unit === 'unidad') ? 1 : 0.1;
    await supabase.from('recipe_items').insert({ recipe_id: recipe.id, ingredient_id: ingredientId, quantity: defaultQty, unit: ing?.unit || 'kg' });
    setIngSearch(''); setShowIngDrop(false);
    load();
  };

  const removeIngredient = async (riId: string) => {
    await supabase.from('recipe_items').delete().eq('id', riId);
    load();
  };

  const updateQty = async (riId: string, newQty: number) => {
    if (isNaN(newQty) || newQty < 0) return;
    setSaving(true);
    await supabase.from('recipe_items').update({ quantity: newQty }).eq('id', riId);
    await load();
    setSaving(false);
  };

  const updateUnit = async (riId: string, newUnit: string) => {
    await supabase.from('recipe_items').update({ unit: newUnit }).eq('id', riId);
    load();
  };

  // ── Descargar HTML ──
  const descargar = () => {
    if (Platform.OS !== 'web') return;
    const withRecipe = allProds.filter(p => p.hasRecipe);
    let html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${darkOnly ? 'Dark Kitchens' : 'Almíbar'} — Fichas Técnicas</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;background:#f3f4f6;color:#111}
.header{background:${darkOnly ? '#E63946' : '#059669'};color:#fff;padding:24px;text-align:center}
.header h1{font-size:24px;font-weight:800}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;padding:16px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px}
.card-name{font-size:15px;font-weight:800}.card-meta{font-size:12px;color:#6b7280;margin:4px 0 8px}
.card-meta b{color:#059669}table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#f3f4f6;padding:5px 8px;text-align:left;font-weight:700}td{padding:5px 8px;border-top:1px solid #f3f4f6}
.cost-row{background:#d1fae5;font-weight:700}.cat{font-size:16px;font-weight:800;color:#059669;margin:20px 16px 8px;border-bottom:2px solid #059669;padding-bottom:4px}
</style></head><body><div class="header"><h1>${darkOnly ? 'Dark Kitchens' : 'Almíbar'} — Fichas Técnicas</h1></div>`;

    const cats: Record<string, any[]> = {};
    withRecipe.forEach(p => { if (!cats[p.catName]) cats[p.catName] = []; cats[p.catName].push(p); });
    for (const [cat, prods] of Object.entries(cats).sort(([a], [b]) => a.localeCompare(b))) {
      html += `<div class="cat">${cat}</div><div class="grid">`;
      for (const p of prods) {
        const fc = p.price > 0 ? Math.round(p.cost / p.price * 100) : 0;
        html += `<div class="card"><div class="card-name">${p.name}</div><div class="card-meta">Precio: <b>${fmt(p.price)}</b> · Costo: <b>${fmt(p.cost)}</b> · FC: <b>${fc}%</b></div>
<table><tr><th>Ingrediente</th><th>Cant.</th><th>Und.</th><th>Costo</th></tr>`;
        for (const it of p.items) html += `<tr><td>${it.name}</td><td>${it.qty}</td><td>${it.unit}</td><td>${fmt(it.cost)}</td></tr>`;
        html += `<tr class="cost-row"><td colspan="3">COSTO TOTAL</td><td>${fmt(p.cost)}</td></tr></table></div>`;
      }
      html += `</div>`;
    }
    html += `</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Fichas_${darkOnly ? 'DarkKitchens' : 'Almibar'}_${new Date().toLocaleDateString('en-CA')}.html`;
    a.click();
  };

  return (
    <View style={st.wrap}>
      {/* Header */}
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>Fichas Técnicas ({allProds.filter(p => p.hasRecipe).length}/{allProds.length})</Text>
          <Text style={{ fontSize: 12, color: COLORS.textMuted }}>Click en una ficha para editar ingredientes</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(darkOnly
            ? [['all', 'Todas'], ['Pizza York', '🍕 Pizza York'], ['Sushi Go', '🍣 Sushi Go'], ['Monkey Burger', '🍔 Monkey Burger']]
            : [['all', 'Todas'], ['cocina', '🍳 Cocina'], ['barra', '🍸 Barra']]
          ).map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => setFilter(k)}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: filter === k ? COLORS.primary : COLORS.background, borderWidth: 1, borderColor: filter === k ? COLORS.primary : COLORS.border }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: filter === k ? '#fff' : COLORS.textSecondary }}>{l}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={{ backgroundColor: '#42A5F5', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 }} onPress={descargar}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>💾 Descargar HTML</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Cards */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, prods]) => (
          <View key={cat}>
            <Text style={st.catTitle}>{cat} ({prods.length})</Text>
            <View style={st.grid}>
              {prods.sort((a: any, b: any) => a.name.localeCompare(b.name)).map((p: any) => {
                const isExpanded = expandedId === p.id;
                const fc = p.price > 0 ? Math.round(p.cost / p.price * 100) : 0;
                const fcColor = fc > 35 ? COLORS.error : fc > 28 ? '#D97706' : COLORS.success;

                return (
                  <View key={p.id} style={[st.card, isExpanded && { borderColor: COLORS.primary, borderWidth: 2, zIndex: 100 }]}>
                    <TouchableOpacity onPress={() => setExpandedId(isExpanded ? null : p.id)}>
                      <Text style={st.cardName}>{p.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 6, alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.primary }}>{fmt(p.price)}</Text>
                        {p.hasRecipe ? (
                          <>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.error }}>Costo: {fmt(p.cost)}</Text>
                            <View style={{ backgroundColor: fcColor + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: fcColor }}>FC: {fc}%</Text>
                            </View>
                          </>
                        ) : (
                          <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textMuted }}>Sin receta</Text>
                        )}
                        <Text style={{ fontSize: 14, color: COLORS.textMuted, marginLeft: 'auto' }}>{isExpanded ? '▲' : '▼'}</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Collapsed: mini table */}
                    {!isExpanded && p.hasRecipe && (
                      <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, overflow: 'hidden' }}>
                        <View style={{ flexDirection: 'row', backgroundColor: COLORS.background, paddingVertical: 5, paddingHorizontal: 8 }}>
                          <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: COLORS.textMuted }}>Ingrediente</Text>
                          <Text style={{ width: 55, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'right' }}>Cant.</Text>
                          <Text style={{ width: 40, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' }}>Und.</Text>
                          <Text style={{ width: 55, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'right' }}>Costo</Text>
                        </View>
                        {p.items.map((it: any, i: number) => (
                          <View key={i} style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                            <Text style={{ flex: 1, fontSize: 11, color: COLORS.text }}>{it.name}</Text>
                            <Text style={{ width: 55, fontSize: 12, fontWeight: '700', textAlign: 'right' }}>{it.qty}</Text>
                            <Text style={{ width: 40, fontSize: 10, color: COLORS.textMuted, textAlign: 'center' }}>{it.unit}</Text>
                            <Text style={{ width: 55, fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, textAlign: 'right' }}>{fmt(it.cost)}</Text>
                          </View>
                        ))}
                        <View style={{ flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#D1FAE5', borderTopWidth: 2, borderTopColor: COLORS.primary }}>
                          <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: '#047857' }}>COSTO TOTAL</Text>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#047857' }}>{fmt(p.cost)}</Text>
                        </View>
                      </View>
                    )}

                    {/* Expanded: editable table */}
                    {isExpanded && (
                      <View style={{ marginTop: 4 }}>
                        {/* Food cost bar */}
                        {p.hasRecipe && (
                          <View style={{ marginBottom: 10 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Food Cost</Text>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: fcColor }}>{fc}% — Margen {fmt(p.price - p.cost)}</Text>
                            </View>
                            <View style={{ height: 10, backgroundColor: COLORS.border, borderRadius: 5, overflow: 'hidden' }}>
                              <View style={{ height: '100%', width: `${Math.min(fc, 100)}%`, backgroundColor: fcColor, borderRadius: 5 }} />
                            </View>
                          </View>
                        )}

                        {/* Editable ingredients */}
                        <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, overflow: 'hidden' }}>
                          <View style={{ flexDirection: 'row', backgroundColor: COLORS.background, paddingVertical: 6, paddingHorizontal: 8 }}>
                            <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: COLORS.textMuted }}>Ingrediente</Text>
                            <Text style={{ width: 70, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' }}>Cantidad</Text>
                            <Text style={{ width: 50, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' }}>Und.</Text>
                            <Text style={{ width: 60, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'right' }}>Costo</Text>
                            <View style={{ width: 30 }} />
                          </View>
                          {p.items.map((it: any) => (
                            <View key={it.riId} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                              <Text style={{ flex: 1, fontSize: 12, color: COLORS.text }}>{it.name}</Text>
                              <TextInput
                                style={{ width: 70, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 3, fontSize: 13, fontWeight: '700', textAlign: 'center', backgroundColor: '#fff' }}
                                defaultValue={String(it.qty)}
                                keyboardType="decimal-pad"
                                onEndEditing={(e) => {
                                  const v = parseFloat(e.nativeEvent.text);
                                  if (!isNaN(v) && v !== it.qty) updateQty(it.riId, v);
                                }}
                              />
                              <TouchableOpacity
                                style={{ width: 50, alignItems: 'center' }}
                                onPress={() => {
                                  const units = ['kg', 'g', 'lt', 'ml', 'unidad'];
                                  const idx = units.indexOf(it.unit);
                                  const next = units[(idx + 1) % units.length];
                                  updateUnit(it.riId, next);
                                }}
                              >
                                <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '600', textDecorationLine: 'underline' }}>{it.unit}</Text>
                              </TouchableOpacity>
                              <Text style={{ width: 60, fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textAlign: 'right' }}>{fmt(it.cost)}</Text>
                              <TouchableOpacity style={{ width: 30, alignItems: 'center' }} onPress={() => removeIngredient(it.riId)}>
                                <Text style={{ fontSize: 16, color: COLORS.error }}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                          {p.hasRecipe && (
                            <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: '#D1FAE5', borderTopWidth: 2, borderTopColor: COLORS.primary }}>
                              <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: '#047857' }}>COSTO TOTAL</Text>
                              <Text style={{ fontSize: 14, fontWeight: '800', color: '#047857' }}>{fmt(p.cost)}</Text>
                              <View style={{ width: 30 }} />
                            </View>
                          )}
                        </View>

                        {/* Add ingredient */}
                        <View style={{ marginTop: 8, position: 'relative' as any }}>
                          <TextInput
                            style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 8, fontSize: 13, backgroundColor: '#fff' }}
                            placeholder="🔍 Agregar ingrediente..."
                            value={ingSearch}
                            onChangeText={t => { setIngSearch(t); setShowIngDrop(t.length >= 2); }}
                            onFocus={() => ingSearch.length >= 2 && setShowIngDrop(true)}
                          />
                          {showIngDrop && (
                            <View style={{ position: 'absolute' as any, top: 42, left: 0, right: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, maxHeight: 180, zIndex: 10, ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,.1)' } : {}) } as any}>
                              <ScrollView style={{ maxHeight: 180 }}>
                                {ingredients
                                  .filter(i => i.name.toLowerCase().includes(ingSearch.toLowerCase()))
                                  .filter(i => !p.items.some((it: any) => it.ingId === i.id))
                                  .slice(0, 10)
                                  .map(i => (
                                    <TouchableOpacity key={i.id} onPress={() => addIngredient(p.id, i.id)}
                                      style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                                      <Text style={{ fontSize: 13, color: COLORS.text }}>{i.name}</Text>
                                      <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{fmt(i.cost_per_unit || 0)}/{i.unit}</Text>
                                    </TouchableOpacity>
                                  ))}
                              </ScrollView>
                            </View>
                          )}
                        </View>

                        {saving && <Text style={{ fontSize: 11, color: COLORS.primary, marginTop: 4 }}>Guardando...</Text>}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  catTitle: { fontSize: 14, fontWeight: '800', color: COLORS.primary, marginTop: 16, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 2, borderBottomColor: COLORS.primary, textTransform: 'uppercase', letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, width: 380, marginBottom: 4, overflow: 'visible' as any, zIndex: 1 },
  cardName: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
});
