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
    if (!editName.trim()) { if (typeof window !== 'undefined') window.alert('Ingresa un nombre'); return; }
    if (!editCatId) { if (typeof window !== 'undefined') window.alert('Selecciona una categoría'); return; }
    try {
      if (isNew) {
        const { data, error } = await supabase.from('products').insert({ name: editName.trim(), price: parseInt(editPrice) || 0, description: editDesc.trim() || null, category_id: editCatId, sort_order: 0 }).select('*').single();
        if (error) { if (typeof window !== 'undefined') window.alert('Error: ' + error.message); return; }
        if (data) { setSelectedProduct(data); setIsNew(false); }
      } else {
        const { error } = await supabase.from('products').update({ name: editName.trim(), price: parseInt(editPrice) || 0, description: editDesc.trim() || null, category_id: editCatId }).eq('id', selectedProduct.id);
        if (error) { if (typeof window !== 'undefined') window.alert('Error: ' + error.message); return; }
      }
      await load();
      if (typeof window !== 'undefined') window.alert('✅ Producto guardado');
    } catch (e: any) { if (typeof window !== 'undefined') window.alert('Error: ' + e.message); }
  };

  const deleteProduct = async () => {
    if (!selectedProduct?.id) return;
    const ok = typeof window !== 'undefined' ? window.confirm('¿Desactivar "' + editName + '"?') : true;
    if (!ok) return;
    await supabase.from('products').update({ active: false }).eq('id', selectedProduct.id);
    setSelectedProduct(null); await load();
  };

  // Recipe state + helpers (declared before usage)
  const [localRecipeQty, setLocalRecipeQty] = useState<Record<string, string>>({});
  const [localRecipeUnit, setLocalRecipeUnit] = useState<Record<string, string>>({});

  const calcIngCost = (ing: any, qty: number, recipeUnit?: string) => {
    const cpu = ing?.cost_per_unit || 0;
    const iu = (ing?.unit || '').toLowerCase();
    const ru = (recipeUnit || iu).toLowerCase();
    if (iu === 'kg' && ru === 'g') return cpu * qty / 1000;
    if (iu === 'lt' && ru === 'ml') return cpu * qty / 1000;
    if (iu === 'g' && ru === 'kg') return cpu * qty * 1000;
    if (iu === 'ml' && ru === 'lt') return cpu * qty * 1000;
    return cpu * qty;
  };

  const productRecipe = selectedProduct?.id ? recipes.find(r => r.product_id === selectedProduct.id) : null;
  const productRecipeItems = productRecipe ? recipeItems.filter(ri => ri.recipe_id === productRecipe.id) : [];
  const recipeCost = productRecipeItems.reduce((s, ri) => {
    const ing = ingredients.find(i => i.id === ri.ingredient_id);
    if (!ing) return s;
    const ru = localRecipeUnit[ri.id] || ri.unit || ing.unit || 'g';
    const q = parseFloat(localRecipeQty[ri.id] !== undefined ? localRecipeQty[ri.id] : String(ri.quantity)) || 0;
    return s + calcIngCost(ing, q, ru);
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

  const saveRecipeItem2 = async (riId: string, overrideUnit?: string) => {
    const update: any = {};
    const qtyVal = localRecipeQty[riId];
    const unitVal = overrideUnit || localRecipeUnit[riId];
    if (qtyVal !== undefined) { const q = parseFloat(qtyVal) || 0; if (q > 0) update.quantity = q; }
    if (unitVal !== undefined) update.unit = unitVal;
    if (Object.keys(update).length > 0) {
      await supabase.from('recipe_items').update(update).eq('id', riId);
      setLocalRecipeQty(prev => { const n = { ...prev }; delete n[riId]; return n; });
      setLocalRecipeUnit(prev => { const n = { ...prev }; delete n[riId]; return n; });
      await load();
    }
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
            const cost = ris.reduce((s, ri) => { const ing = ingredients.find(x => x.id === ri.ingredient_id); if (!ing) return s; return s + calcIngCost(ing, ri.quantity, ri.unit || ing.unit); }, 0);
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
                const currentUnit = localRecipeUnit[ri.id] || ri.unit || ing.unit || 'g';
                const currentQty = parseFloat(localRecipeQty[ri.id] !== undefined ? localRecipeQty[ri.id] : String(ri.quantity)) || 0;
                const cost = calcIngCost(ing, currentQty, currentUnit);
                const iu = (ing.unit || '').toLowerCase();
                const unitOptions = iu === 'kg' || iu === 'g' ? ['g', 'kg'] : iu === 'lt' || iu === 'ml' ? ['ml', 'lt'] : ['unidad'];
                return (
                  <View key={ri.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                    <Text style={{ flex: 1, fontSize: 12, color: COLORS.text }}>{ing.name}</Text>
                    <TextInput
                      style={{ width: 60, fontSize: 12, color: COLORS.text, backgroundColor: COLORS.card, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, textAlign: 'center', borderWidth: 1, borderColor: COLORS.border }}
                      value={localRecipeQty[ri.id] !== undefined ? localRecipeQty[ri.id] : String(ri.quantity)}
                      onChangeText={t => setLocalRecipeQty(prev => ({ ...prev, [ri.id]: t }))}
                      onBlur={() => saveRecipeItem2(ri.id)}
                      keyboardType="decimal-pad"
                    />
                    <View style={{ width: 65, flexDirection: 'row', gap: 1, justifyContent: 'center' }}>
                      {unitOptions.map(u => (
                        <TouchableOpacity key={u} onPress={() => { setLocalRecipeUnit(prev => ({ ...prev, [ri.id]: u })); saveRecipeItem2(ri.id, u); }}
                          style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, backgroundColor: currentUnit === u ? COLORS.primary : COLORS.background, borderWidth: 1, borderColor: currentUnit === u ? COLORS.primary : COLORS.border }}>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: currentUnit === u ? '#fff' : COLORS.textMuted }}>{u}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
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
  wrap: { flex: 1, flexDirection: 'row', backgroundColor: '#F5F5F5' },
  // Sidebar — dark Fudo style
  side: { width: 210, backgroundColor: '#3C3C3C', borderRightWidth: 0 },
  sh: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 },
  shT: { fontSize: 10, fontWeight: '800', color: '#E8562A', letterSpacing: 1.8, textTransform: 'uppercase' },
  si: { paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#4A4A4A' },
  siA: { backgroundColor: '#E8562A', borderLeftWidth: 0, borderRadius: 0 },
  siT: { fontSize: 13, color: '#CCCCCC' },
  siTA: { fontWeight: '700', color: '#FFFFFF' },
  siC: { fontSize: 10, color: '#999999', backgroundColor: '#4A4A4A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, overflow: 'hidden', minWidth: 22, textAlign: 'center' },
  // List — clean product table area
  list: { flex: 1, borderRightWidth: 1, borderRightColor: '#E8E8E8' },
  toolbar: { flexDirection: 'row', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: '#E8E8E8', alignItems: 'center', backgroundColor: '#FFFFFF' },
  sbox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E8E8E8', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  sinp: { flex: 1, fontSize: 13, color: '#1A1A1A', marginLeft: 8, outlineStyle: 'none' } as any,
  addB: { backgroundColor: '#E8562A', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, shadowColor: '#E8562A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 },
  addBT: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  tHead: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FAFAFA', borderBottomWidth: 2, borderBottomColor: '#E8E8E8' },
  th: { fontSize: 11, fontWeight: '700', color: '#999999', letterSpacing: 0.5, textTransform: 'uppercase' },
  tRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', alignItems: 'center', backgroundColor: '#FFFFFF' },
  tRowA: { backgroundColor: '#FAFAFA' },
  td: { fontSize: 14, color: '#1A1A1A' },
  // Detail — white card panel with shadow
  detail: { width: 400, backgroundColor: '#FFFFFF', shadowColor: '#000000', shadowOffset: { width: -2, height: 0 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 5 },
  dSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E8E8E8', backgroundColor: '#FAFAFA' },
  dTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  dBlock: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E8E8' },
  dBlockTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },
  field: { marginBottom: 12 },
  fLabel: { fontSize: 12, fontWeight: '600', color: '#666666', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3 },
  fInput: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E8E8E8', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1A1A1A' },
  saveBtn: { backgroundColor: '#E8562A', paddingHorizontal: 24, paddingVertical: 11, borderRadius: 8, shadowColor: '#E8562A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  saveBtnT: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
