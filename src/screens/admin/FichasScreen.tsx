import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
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

  const COCINA_CATS = ['Burgers & Sándwiches', 'Papas', 'Picoteos & Tablas', 'Pizzas', 'Platos Fríos', 'Salchipapas XL', 'Sushi', 'Pizza York'];
  const BARRA_CATS = ['Cócteles Clásicos', 'Coctelería de Autor', 'Cremosos', 'Sours', 'Spritz', 'Old Schools', 'Bottle Drinks', 'Red Bull Drinks', 'Mojitos 1L', 'Mocktails', 'Happy Hour', 'Gin', 'Pisco', 'Whisky', 'Vodka', 'Ron', 'Licores', 'Shots', 'Vinos y Espumantes', 'Cervezas Schop', 'Botellines', 'Bebidas y Jugos', 'Café y Postres', 'Combos'];
  const DARK_BRANDS = ['Pizza York', 'Sushi Go', 'Monkey Burger'];

  const load = useCallback(async () => {
    const [{ data: p }, { data: c }, { data: i }, { data: r }, { data: ri }] = await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('name'),
      supabase.from('categories').select('*').eq('active', true).order('name'),
      supabase.from('ingredients').select('*').eq('active', true),
      supabase.from('recipes').select('*'),
      supabase.from('recipe_items').select('*'),
    ]);

    if (darkOnly) {
      // Load dark kitchen products and cross-reference recipes by name
      const { data: dk } = await supabase.from('delivery_products').select('*').eq('is_active', true).order('brand,sort_order');
      if (dk && p) {
        const almProducts = p;
        const darkProds = dk.map((dp: any) => {
          const almMatch = almProducts.find((ap: any) => ap.name === dp.name);
          return {
            id: almMatch?.id || dp.id,
            name: dp.name,
            price: Number(dp.price),
            category_id: dp.brand, // use brand as category_id for grouping
            description: dp.description,
            _brand: dp.brand,
            _category: dp.category,
            _darkId: dp.id,
          };
        });
        setProducts(darkProds);
        // Create virtual categories from brands
        setCategories(DARK_BRANDS.map(b => ({ id: b, name: b })));
      }
    } else {
      if (p) setProducts(p);
      if (c) setCategories(c);
    }

    if (i) setIngredients(i);
    if (r) setRecipes(r);
    if (ri) setRecipeItems(ri);
  }, []);

  useEffect(() => { load(); }, [load]);

  const calcCost = (productId: string) => {
    const recipe = recipes.find(r => r.product_id === productId);
    if (!recipe) return 0;
    return recipeItems.filter(ri => ri.recipe_id === recipe.id).reduce((total, ri) => {
      const ing = ingredients.find(i => i.id === ri.ingredient_id);
      if (!ing) return total;
      const cpu = ing.cost_per_unit || 0;
      const qty = ri.quantity || 0;
      const iu = (ing.unit || '').toLowerCase();
      const ru = (ri.unit || iu).toLowerCase();
      if (iu === 'kg' && ru === 'g') return total + cpu * qty / 1000;
      if (iu === 'lt' && ru === 'ml') return total + cpu * qty / 1000;
      return total + cpu * qty;
    }, 0);
  };

  const getRecipeItems = (productId: string) => {
    const recipe = recipes.find(r => r.product_id === productId);
    if (!recipe) return [];
    return recipeItems.filter(ri => ri.recipe_id === recipe.id).map(ri => {
      const ing = ingredients.find(i => i.id === ri.ingredient_id);
      return { name: ing?.name || '?', quantity: ri.quantity, unit: ri.unit || ing?.unit || '', ingUnit: ing?.unit || '', costPerUnit: ing?.cost_per_unit || 0 };
    });
  };

  const productsWithRecipe = products.filter(p => {
    const recipe = recipes.find(r => r.product_id === p.id);
    if (!recipe) return false;
    const items = recipeItems.filter(ri => ri.recipe_id === recipe.id);
    return items.length > 0;
  }).map(p => {
    const cat = categories.find(c => c.id === p.category_id);
    const catName = cat?.name || '?';
    const isCocina = COCINA_CATS.some(c => catName.includes(c));
    return { ...p, catName, section: isCocina ? 'cocina' : 'barra', cost: calcCost(p.id), items: getRecipeItems(p.id) };
  });

  const filtered = filter === 'all' ? productsWithRecipe
    : darkOnly ? productsWithRecipe.filter(p => p.catName === filter)
    : productsWithRecipe.filter(p => p.section === filter);

  // Group by category
  const grouped: Record<string, any[]> = {};
  filtered.forEach(p => {
    if (!grouped[p.catName]) grouped[p.catName] = [];
    grouped[p.catName].push(p);
  });

  const descargar = () => {
    if (Platform.OS !== 'web') return;
    const IVA = 0.19;
    let html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Almíbar — Fichas Técnicas</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#f3f4f6;color:#111827;line-height:1.5}
.header{background:#059669;color:#fff;padding:28px 32px;text-align:center}
.header h1{font-size:28px;font-weight:800}
.header .date{font-size:13px;opacity:.85;margin-top:4px}
.container{max-width:1100px;margin:0 auto;padding:24px}
.section-title{font-size:22px;font-weight:800;color:#059669;margin:24px 0 12px;padding-bottom:8px;border-bottom:3px solid #059669}
.cat-title{font-size:16px;font-weight:700;color:#374151;margin:16px 0 8px;text-transform:uppercase;letter-spacing:1px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;break-inside:avoid}
.card-name{font-size:16px;font-weight:800;color:#111827}
.card-meta{font-size:12px;color:#6b7280;margin:2px 0 10px}
.card-meta b{color:#059669}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#f3f4f6;padding:6px 8px;text-align:left;font-weight:700;color:#6b7280;border-bottom:2px solid #e5e7eb}
td{padding:6px 8px;border-bottom:1px solid #f3f4f6}
.cost-row{background:#d1fae5;font-weight:700}
.cost-row td{color:#047857}
@media print{.header{padding:16px}.container{padding:8px}.card{break-inside:avoid;page-break-inside:avoid}.section-title{page-break-before:always}}
</style></head><body>
<div class="header"><h1>Almíbar — Fichas Técnicas</h1><div class="date">Generado: ${new Date().toLocaleDateString('es-CL',{day:'numeric',month:'long',year:'numeric'})}</div></div>
<div class="container">`;

    const sections = [
      { title: 'COCINA', items: productsWithRecipe.filter(p => p.section === 'cocina') },
      { title: 'BARRA', items: productsWithRecipe.filter(p => p.section === 'barra') },
    ];

    for (const sec of sections) {
      html += `<h2 class="section-title">${sec.title}</h2>`;
      const cats: Record<string, any[]> = {};
      sec.items.forEach(p => { if (!cats[p.catName]) cats[p.catName] = []; cats[p.catName].push(p); });

      for (const [cat, prods] of Object.entries(cats).sort(([a],[b]) => a.localeCompare(b))) {
        html += `<h3 class="cat-title">${cat}</h3><div class="grid">`;
        for (const p of prods.sort((a: any, b: any) => a.name.localeCompare(b.name))) {
          const precioNeto = Math.round(p.price / (1 + IVA));
          const fc = precioNeto > 0 && p.cost > 0 ? Math.round(p.cost / precioNeto * 100) : 0;
          html += `<div class="card"><div class="card-name">${p.name}</div>
<div class="card-meta">Precio: <b>${fmt(p.price)}</b> · Costo: <b>${fmt(p.cost)}</b> · FC: <b>${fc}%</b></div>
<table><tr><th>Ingrediente</th><th style="width:70px;text-align:right">Cantidad</th><th style="width:50px;text-align:center">Unidad</th></tr>`;
          for (const item of p.items) {
            html += `<tr><td>${item.name}</td><td style="text-align:right;font-weight:600">${item.quantity}</td><td style="text-align:center">${item.unit}</td></tr>`;
          }
          html += `<tr class="cost-row"><td>COSTO TOTAL</td><td colspan="2" style="text-align:right">${fmt(p.cost)}</td></tr></table></div>`;
        }
        html += `</div>`;
      }
    }

    html += `</div></body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fichas_Tecnicas_Almibar_${new Date().toLocaleDateString('en-CA')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <View style={st.wrap}>
      {/* Header */}
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>Fichas Técnicas ({productsWithRecipe.length})</Text>
          <Text style={{ fontSize: 12, color: COLORS.textMuted }}>{Object.keys(grouped).length} categorías con receta</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(darkOnly
            ? ([['all', 'Todas'], ['Pizza York', '🍕 Pizza York'], ['Sushi Go', '🍣 Sushi Go'], ['Monkey Burger', '🍔 Monkey Burger']] as [string, string][])
            : ([['all', 'Todas'], ['cocina', '🍳 Cocina'], ['barra', '🍸 Barra']] as [string, string][])
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
        {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([cat, prods]) => (
          <View key={cat}>
            <Text style={st.catTitle}>{cat} ({prods.length})</Text>
            <View style={st.grid}>
              {prods.sort((a: any, b: any) => a.name.localeCompare(b.name)).map((p: any) => {
                const precioNeto = Math.round(p.price / 1.19);
                const fc = precioNeto > 0 && p.cost > 0 ? Math.round(p.cost / precioNeto * 100) : 0;
                return (
                  <View key={p.id} style={st.card}>
                    <Text style={st.cardName}>{p.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>{fmt(p.price)}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.error }}>Costo: {fmt(p.cost)}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: fc > 35 ? COLORS.error : fc > 30 ? '#D97706' : COLORS.success }}>FC: {fc}%</Text>
                    </View>
                    {/* Ingredients table */}
                    <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, overflow: 'hidden' }}>
                      <View style={{ flexDirection: 'row', backgroundColor: COLORS.background, paddingVertical: 6, paddingHorizontal: 8 }}>
                        <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>Ingrediente</Text>
                        <Text style={{ width: 60, fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textAlign: 'right' }}>Cant.</Text>
                        <Text style={{ width: 45, fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' }}>Und.</Text>
                      </View>
                      {p.items.map((item: any, i: number) => (
                        <View key={i} style={{ flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: i % 2 === 0 ? '#fff' : COLORS.background }}>
                          <Text style={{ flex: 1, fontSize: 12, color: COLORS.text }}>{item.name}</Text>
                          <Text style={{ width: 60, fontSize: 13, fontWeight: '700', color: COLORS.text, textAlign: 'right' }}>{item.quantity}</Text>
                          <Text style={{ width: 45, fontSize: 11, color: COLORS.textMuted, textAlign: 'center' }}>{item.unit}</Text>
                        </View>
                      ))}
                      <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: '#D1FAE5', borderTopWidth: 2, borderTopColor: COLORS.primary }}>
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: '#047857' }}>COSTO TOTAL</Text>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#047857' }}>{fmt(p.cost)}</Text>
                      </View>
                    </View>
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
  card: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, width: 340, marginBottom: 4 },
  cardName: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
});
