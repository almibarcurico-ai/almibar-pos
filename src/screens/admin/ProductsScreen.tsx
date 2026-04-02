// src/screens/admin/ProductsScreen.tsx
// Fudo-style: sidebar categories + product detail with recipes & modifiers
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

const SECTIONS = [
  { label: 'HAPPY HOUR', ids: ['d0000000-0000-0000-0000-000000000041'] },
  { label: 'COMBOS', ids: ['d0000000-0000-0000-0000-000000000040'] },
  { label: 'COCINA', ids: [
    'd0000000-0000-0000-0000-000000000050','d0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000051',
    'd0000000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-000000000006',
    'd0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000004',
    'd0000000-0000-0000-0000-000000000007',
  ]},
  { label: 'BARRA', ids: [
    'd0000000-0000-0000-0000-000000000014','d0000000-0000-0000-0000-000000000052',
    'd0000000-0000-0000-0000-000000000016','d0000000-0000-0000-0000-000000000017',
    'd0000000-0000-0000-0000-000000000018','d0000000-0000-0000-0000-000000000019',
    'd0000000-0000-0000-0000-000000000020','d0000000-0000-0000-0000-000000000021',
    'd0000000-0000-0000-0000-000000000022','d0000000-0000-0000-0000-000000000015',
    'd0000000-0000-0000-0000-000000000023','d0000000-0000-0000-0000-000000000024',
    'd0000000-0000-0000-0000-000000000025','d0000000-0000-0000-0000-000000000026',
    'd0000000-0000-0000-0000-000000000027','d0000000-0000-0000-0000-000000000028',
    'd0000000-0000-0000-0000-000000000029','d0000000-0000-0000-0000-000000000011',
    'd0000000-0000-0000-0000-000000000012','d0000000-0000-0000-0000-000000000013',
    'd0000000-0000-0000-0000-000000000010','d0000000-0000-0000-0000-000000000030',
  ]},
];

export default function ProductsScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [modGroups, setModGroups] = useState<any[]>([]);
  const [modOptions, setModOptions] = useState<any[]>([]);
  const [productModGroups, setProductModGroups] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [recipeItems, setRecipeItems] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState<string|null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any|null>(null);
  const [search, setSearch] = useState('');
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCatId, setEditCatId] = useState('');
  const [isNew, setIsNew] = useState(false);
  // Recipe add
  const [ingSearch, setIngSearch] = useState('');
  const [showIngSearch, setShowIngSearch] = useState(false);
  // Mod group add
  const [showModAdd, setShowModAdd] = useState(false);

  const load = useCallback(async () => {
    const [pR, cR, iR, mgR, moR, pmR, rR, riR] = await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('sort_order'),
      supabase.from('categories').select('*').eq('active', true).order('sort_order'),
      supabase.from('ingredients').select('*').eq('active', true).order('name'),
      supabase.from('modifier_groups').select('*').eq('active', true).order('sort_order'),
      supabase.from('modifier_options').select('*').eq('active', true).order('sort_order'),
      supabase.from('product_modifier_groups').select('*'),
      supabase.from('recipes').select('*'),
      supabase.from('recipe_items').select('*'),
    ]);
    if (pR.data) setProducts(pR.data);
    if (cR.data) setCategories(cR.data);
    if (iR.data) setIngredients(iR.data);
    if (mgR.data) setModGroups(mgR.data);
    if (moR.data) setModOptions(moR.data);
    if (pmR.data) setProductModGroups(pmR.data);
    if (rR.data) setRecipes(rR.data);
    if (riR.data) setRecipeItems(riR.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const catName = (id: string) => categories.find(c => c.id === id)?.name || '';

  const selectProduct = (p: any) => {
    setSelectedProduct(p); setEditName(p.name); setEditPrice(String(p.price)); setEditDesc(p.description || ''); setEditCatId(p.category_id);
    setIsNew(false); setShowIngSearch(false); setShowModAdd(false);
  };

  const openNew = () => {
    setSelectedProduct({ id: null }); setEditName(''); setEditPrice(''); setEditDesc('');
    setEditCatId(selectedCat || categories[0]?.id || '');
    setIsNew(true); setShowIngSearch(false); setShowModAdd(false);
  };

  const saveProduct = async () => {
    if (!editName.trim()) return;
    try {
      if (isNew) {
        const { data } = await supabase.from('products').insert({ name: editName.trim(), price: parseInt(editPrice) || 0, description: editDesc.trim() || null, category_id: editCatId, sort_order: 0 }).select('*').single();
        if (data) { setSelectedProduct(data); setIsNew(false); }
      } else {
        await supabase.from('products').update({ name: editName.trim(), price: parseInt(editPrice) || 0, description: editDesc.trim() || null, category_id: editCatId }).eq('id', selectedProduct.id);
      }
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const deleteProduct = async () => {
    if (!selectedProduct?.id) return;
    const ok = typeof window !== 'undefined' ? window.confirm('¿Desactivar "' + editName + '"?') : true;
    if (!ok) return;
    await supabase.from('products').update({ active: false }).eq('id', selectedProduct.id);
    setSelectedProduct(null); await load();
  };

  // Recipe helpers
  const productRecipe = selectedProduct?.id ? recipes.find(r => r.product_id === selectedProduct.id) : null;
  const productRecipeItems = productRecipe ? recipeItems.filter(ri => ri.recipe_id === productRecipe.id) : [];
  const recipeCost = productRecipeItems.reduce((s, ri) => {
    const ing = ingredients.find(i => i.id === ri.ingredient_id);
    return s + (ing ? ing.cost_per_unit * ri.quantity : 0);
  }, 0);

  const addIngredient = async (ing: any) => {
    if (!selectedProduct?.id) return;
    let recipe = productRecipe;
    if (!recipe) {
      const { data } = await supabase.from('recipes').insert({ product_id: selectedProduct.id, yield_portions: 1 }).select('*').single();
      recipe = data;
    }
    if (!recipe) return;
    await supabase.from('recipe_items').insert({ recipe_id: recipe.id, ingredient_id: ing.id, quantity: 1 });
    setShowIngSearch(false); setIngSearch(''); await load();
  };

  const updateRecipeQty = async (riId: string, qty: number) => {
    if (qty <= 0) { await supabase.from('recipe_items').delete().eq('id', riId); }
    else { await supabase.from('recipe_items').update({ quantity: qty }).eq('id', riId); }
    await load();
  };

  const removeRecipeItem = async (riId: string) => {
    await supabase.from('recipe_items').delete().eq('id', riId);
    await load();
  };

  // Modifier helpers
  const productMods = selectedProduct?.id ? productModGroups.filter(pm => pm.product_id === selectedProduct.id) : [];

  const toggleModGroup = async (groupId: string) => {
    if (!selectedProduct?.id) return;
    const existing = productMods.find(pm => pm.group_id === groupId);
    if (existing) { await supabase.from('product_modifier_groups').delete().eq('id', existing.id); }
    else { await supabase.from('product_modifier_groups').insert({ product_id: selectedProduct.id, group_id: groupId }); }
    await load();
  };

  // Sidebar
  const displayed = search ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) :
    selectedCat ? products.filter(p => p.category_id === selectedCat) : products;

  const sideItems: { type: 'h'|'c'; label: string; id?: string; count?: number }[] = [];
  SECTIONS.forEach(sec => {
    sideItems.push({ type: 'h', label: sec.label });
    sec.ids.forEach(id => {
      const cat = categories.find(c => c.id === id);
      if (cat) {
        const n = products.filter(p => p.category_id === id).length;
        if (n > 0) sideItems.push({ type: 'c', label: cat.name, id, count: n });
      }
    });
  });

  const filteredIngredients = ingredients.filter(i => !ingSearch || i.name.toLowerCase().includes(ingSearch.toLowerCase())).slice(0, 8);

  return (
    <View style={s.wrap}>
      {/* Sidebar */}
      <ScrollView style={s.side}>
        <TouchableOpacity style={[s.si, !selectedCat && !search && s.siA]} onPress={() => { setSelectedCat(null); setSearch(''); }}>
          <Text style={[s.siT, !selectedCat && !search && s.siTA]}>Todos ({products.length})</Text>
        </TouchableOpacity>
        {sideItems.map((it, i) => it.type === 'h' ? (
          <View key={'h'+i} style={s.sh}><Text style={s.shT}>{it.label}</Text></View>
        ) : (
          <TouchableOpacity key={it.id} style={[s.si, selectedCat === it.id && s.siA]} onPress={() => { setSelectedCat(it.id!); setSearch(''); setSelectedProduct(null); }}>
            <Text style={[s.siT, selectedCat === it.id && s.siTA]}>{it.label}</Text>
            <Text style={s.siC}>{it.count}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Product list */}
      <View style={s.list}>
        <View style={s.toolbar}>
          <View style={s.sbox}>
            <Text style={{ color: COLORS.textMuted }}>🔍</Text>
            <TextInput style={s.sinp} placeholder="Buscar..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={t => { setSearch(t); if (t) setSelectedCat(null); }} />
            {search ? <TouchableOpacity onPress={() => setSearch('')}><Text style={{ color: COLORS.textMuted }}>✕</Text></TouchableOpacity> : null}
          </View>
          <TouchableOpacity style={s.addB} onPress={openNew}><Text style={s.addBT}>+ Nuevo</Text></TouchableOpacity>
        </View>
        <View style={s.tHead}>
          <Text style={[s.th, { flex: 1 }]}>Producto</Text>
          {!selectedCat && <Text style={[s.th, { width: 120 }]}>Categoría</Text>}
          <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Precio</Text>
          <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Costo</Text>
        </View>
        <ScrollView>
          {displayed.map((p, i) => {
            const rec = recipes.find(r => r.product_id === p.id);
            const ris = rec ? recipeItems.filter(ri => ri.recipe_id === rec.id) : [];
            const cost = ris.reduce((s, ri) => { const ing = ingredients.find(x => x.id === ri.ingredient_id); return s + (ing ? ing.cost_per_unit * ri.quantity : 0); }, 0);
            const isActive = selectedProduct?.id === p.id;
            return (
              <TouchableOpacity key={p.id} style={[s.tRow, i % 2 === 0 && s.tRowA, isActive && { backgroundColor: COLORS.primary + '18', borderLeftWidth: 3, borderLeftColor: COLORS.primary }]} onPress={() => selectProduct(p)}>
                <Text style={[s.td, { flex: 1, fontWeight: '600' }]}>{p.name}</Text>
                {!selectedCat && <Text style={[s.td, { width: 120, fontSize: 11, color: COLORS.textSecondary }]}>{catName(p.category_id)}</Text>}
                <Text style={[s.td, { width: 80, textAlign: 'right', fontWeight: '700', color: COLORS.primary }]}>{fmt(p.price)}</Text>
                <Text style={[s.td, { width: 80, textAlign: 'right', color: cost > 0 ? COLORS.textSecondary : COLORS.textMuted }]}>{cost > 0 ? fmt(cost) : '-'}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Detail panel */}
      {selectedProduct && (
        <ScrollView style={s.detail}>
          <View style={s.dSection}>
            <Text style={s.dTitle}>{isNew ? 'Nuevo Producto' : 'Producto: ' + editName}</Text>
            {!isNew && <TouchableOpacity onPress={deleteProduct}><Text style={{ color: COLORS.error, fontSize: 13 }}>🗑️</Text></TouchableOpacity>}
          </View>

          {/* Details */}
          <View style={s.dBlock}>
            <Text style={s.dBlockTitle}>Detalles</Text>
            <View style={s.field}><Text style={s.fLabel}>Nombre *</Text><TextInput style={s.fInput} value={editName} onChangeText={setEditName} /></View>
            <View style={s.field}><Text style={s.fLabel}>Descripción</Text><TextInput style={[s.fInput, { minHeight: 50 }]} value={editDesc} onChangeText={setEditDesc} placeholder="Descripción del producto..." placeholderTextColor={COLORS.textMuted} multiline /></View>
            <View style={s.field}><Text style={s.fLabel}>Precio *</Text><TextInput style={s.fInput} value={editPrice} onChangeText={setEditPrice} keyboardType="number-pad" /></View>
            <View style={s.field}>
              <Text style={s.fLabel}>Categoría *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                {SECTIONS.map(sec => sec.ids.map(id => {
                  const cat = categories.find(c => c.id === id);
                  if (!cat) return null;
                  const active = editCatId === id;
                  return (
                    <TouchableOpacity key={id} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginRight: 4, backgroundColor: active ? '#C8952A' : '#2A2318', borderWidth: 1, borderColor: active ? '#C8952A' : '#2A2318' }} onPress={() => setEditCatId(id)}>
                      <Text style={{ fontSize: 10, color: active ? '#0A0908' : '#8A7A5A' }}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                }))}
              </ScrollView>
            </View>
            {!isNew && recipeCost > 0 && (
              <View style={s.field}>
                <Text style={s.fLabel}>Costo</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary }}>{fmt(recipeCost)}</Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginLeft: 8 }}>Margen: {fmt((parseInt(editPrice)||0) - recipeCost)} ({Math.round(((parseInt(editPrice)||0) - recipeCost) / (parseInt(editPrice)||1) * 100)}%)</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={s.saveBtn} onPress={saveProduct}><Text style={s.saveBtnT}>Guardar</Text></TouchableOpacity>
            </View>
          </View>

          {/* Recipe */}
          {!isNew && selectedProduct.id && (
            <View style={s.dBlock}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.dBlockTitle}>Receta</Text>
                <TouchableOpacity onPress={() => setShowIngSearch(!showIngSearch)}>
                  <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '600' }}>{showIngSearch ? '✕ Cerrar' : '+ Ingrediente'}</Text>
                </TouchableOpacity>
              </View>

              {showIngSearch && (
                <View style={{ marginBottom: 8 }}>
                  <TextInput style={s.fInput} placeholder="Buscar ingrediente..." placeholderTextColor={COLORS.textMuted} value={ingSearch} onChangeText={setIngSearch} />
                  {filteredIngredients.map(ing => (
                    <TouchableOpacity key={ing.id} style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border }} onPress={() => addIngredient(ing)}>
                      <Text style={{ color: COLORS.text, fontSize: 13 }}>{ing.name} <Text style={{ color: COLORS.textSecondary }}>({ing.unit} · {fmt(ing.cost_per_unit)})</Text></Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Recipe header */}
              {productRecipeItems.length > 0 && (
                <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={[s.th, { flex: 1 }]}>Ingrediente</Text>
                  <Text style={[s.th, { width: 70 }]}>Cant.</Text>
                  <Text style={[s.th, { width: 50 }]}>Unid.</Text>
                  <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Costo</Text>
                  <Text style={[s.th, { width: 30 }]}></Text>
                </View>
              )}
              {productRecipeItems.map(ri => {
                const ing = ingredients.find(x => x.id === ri.ingredient_id);
                if (!ing) return null;
                const cost = ing.cost_per_unit * ri.quantity;
                return (
                  <View key={ri.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                    <Text style={{ flex: 1, fontSize: 12, color: COLORS.text }}>{ing.name}</Text>
                    <TextInput
                      style={{ width: 70, fontSize: 12, color: COLORS.text, backgroundColor: COLORS.card, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, textAlign: 'center', borderWidth: 1, borderColor: COLORS.border }}
                      value={String(ri.quantity)}
                      onChangeText={t => updateRecipeQty(ri.id, parseFloat(t) || 0)}
                      keyboardType="decimal-pad"
                    />
                    <Text style={{ width: 50, fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' }}>{ing.unit}</Text>
                    <Text style={{ width: 70, fontSize: 12, color: COLORS.primary, textAlign: 'right' }}>{fmt(cost)}</Text>
                    <TouchableOpacity style={{ width: 30, alignItems: 'center' }} onPress={() => removeRecipeItem(ri.id)}>
                      <Text style={{ color: COLORS.error, fontSize: 14 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {productRecipeItems.length > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8, gap: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary }}>Total receta</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>{fmt(recipeCost)}</Text>
                </View>
              )}
              {productRecipeItems.length === 0 && !showIngSearch && (
                <Text style={{ color: COLORS.textMuted, fontSize: 12, paddingVertical: 12 }}>Sin receta. Agrega ingredientes para calcular food cost.</Text>
              )}
            </View>
          )}

          {/* Modifier Groups */}
          {!isNew && selectedProduct.id && (
            <View style={s.dBlock}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.dBlockTitle}>Grupos Modificadores</Text>
                <TouchableOpacity onPress={() => setShowModAdd(!showModAdd)}>
                  <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '600' }}>{showModAdd ? '✕ Cerrar' : '+ Asociar'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>Asocia grupos modificadores para ofrecer diferentes opciones.</Text>

              {showModAdd && (
                <View style={{ marginBottom: 8 }}>
                  {modGroups.map(mg => {
                    const linked = productMods.some(pm => pm.group_id === mg.id);
                    return (
                      <TouchableOpacity key={mg.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8 }} onPress={() => toggleModGroup(mg.id)}>
                        <Text style={{ fontSize: 16 }}>{linked ? '✅' : '⬜'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: COLORS.text, fontSize: 13 }}>{mg.name}</Text>
                          <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>{mg.type === 'single' ? 'Elegir 1' : 'Elegir varios'} · {modOptions.filter(o => o.group_id === mg.id).length} opciones</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {productMods.map(pm => {
                const mg = modGroups.find(g => g.id === pm.group_id);
                if (!mg) return null;
                const opts = modOptions.filter(o => o.group_id === mg.id);
                return (
                  <View key={pm.id} style={{ backgroundColor: COLORS.card, borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text }}>{mg.name}</Text>
                      <TouchableOpacity onPress={() => toggleModGroup(mg.id)}>
                        <Text style={{ fontSize: 11, color: COLORS.error }}>Desvincular</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                      {opts.map(o => o.name).join(', ')}
                    </Text>
                  </View>
                );
              })}

              {productMods.length === 0 && !showModAdd && (
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Sin modificadores asociados.</Text>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Empty state */}
      {!selectedProduct && (
        <View style={[s.detail, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontSize: 40 }}>🍕</Text>
          <Text style={{ color: COLORS.textMuted, marginTop: 8 }}>Selecciona un producto</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.background },
  // Sidebar
  side: { width: 200, backgroundColor: COLORS.card, borderRightWidth: 1, borderRightColor: COLORS.border },
  sh: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 4 },
  shT: { fontSize: 10, fontWeight: '800', color: COLORS.primary, letterSpacing: 1.5 },
  si: { paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  siA: { backgroundColor: COLORS.primary + '18', borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  siT: { fontSize: 12, color: COLORS.text },
  siTA: { fontWeight: '700', color: COLORS.primary },
  siC: { fontSize: 10, color: COLORS.textMuted },
  // List
  list: { flex: 1, borderRightWidth: 1, borderRightColor: COLORS.border },
  toolbar: { flexDirection: 'row', padding: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' },
  sbox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  sinp: { flex: 1, fontSize: 13, color: COLORS.text, marginLeft: 6 },
  addB: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  addBT: { color: COLORS.background, fontWeight: '700', fontSize: 12 },
  tHead: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  th: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  tRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' },
  tRowA: { backgroundColor: COLORS.card + '40' },
  td: { fontSize: 15, color: COLORS.text },
  // Detail
  detail: { width: 400, backgroundColor: COLORS.background },
  dSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  dBlock: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dBlockTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  field: { marginBottom: 10 },
  fLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4 },
  fInput: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: COLORS.text },
  saveBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 },
  saveBtnT: { color: COLORS.background, fontWeight: '700', fontSize: 14 },
});
