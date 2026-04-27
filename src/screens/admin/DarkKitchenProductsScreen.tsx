// src/screens/admin/DarkKitchenProductsScreen.tsx
// Gestión de productos Dark Kitchens: Pizza York, Sushi Go, Monkey Burger
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Modal, Alert, StyleSheet, Switch,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');
const pct = (cost: number, price: number) => price > 0 ? Math.round(((price - cost) / price) * 100) : 0;

type Brand = 'Pizza York' | 'Sushi Go' | 'Monkey Burger';

const BRANDS: { name: Brand; emoji: string; color: string }[] = [
  { name: 'Pizza York', emoji: '🍕', color: '#E63946' },
  { name: 'Sushi Go', emoji: '🍣', color: '#D42027' },
  { name: 'Monkey Burger', emoji: '🍔', color: '#F5A623' },
];

const CATEGORIES = ['pizza', 'roll', 'burger', 'mechada', 'pollo', 'agregado', 'bebida'];

interface DeliveryProduct {
  id: string;
  brand: Brand;
  category: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  is_active: boolean;
  sort_order: number;
}

interface RecipeItem {
  id?: string;
  recipe_id?: string;
  ingredient_id: string;
  ingredient_name?: string;
  quantity: number;
  unit: string;
  cost_per_unit: number;
}

export default function DarkKitchenProductsScreen() {
  const [products, setProducts] = useState<DeliveryProduct[]>([]);
  const [allIngredients, setAllIngredients] = useState<any[]>([]);
  const [selected, setSelected] = useState<DeliveryProduct | null>(null);
  const [filterBrand, setFilterBrand] = useState<Brand | null>(null);
  const [search, setSearch] = useState('');
  const [expandedBrands, setExpandedBrands] = useState<Record<string, boolean>>({ 'Pizza York': true, 'Sushi Go': true, 'Monkey Burger': true });

  // Editor state
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editBrand, setEditBrand] = useState<Brand>('Pizza York');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editActive, setEditActive] = useState(true);

  // Recipe state
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([]);
  const [hasRecipe, setHasRecipe] = useState(false);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [ingSearch, setIngSearch] = useState('');

  // Modal nuevo producto
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCategory, setNewCategory] = useState('pizza');
  const [newBrand, setNewBrand] = useState<Brand>('Pizza York');

  const load = useCallback(async () => {
    const [pRes, iRes] = await Promise.all([
      supabase.from('delivery_products').select('*').order('brand').order('sort_order'),
      supabase.from('ingredients').select('*').eq('active', true).order('name'),
    ]);
    if (pRes.data) setProducts(pRes.data);
    if (iRes.data) setAllIngredients(iRes.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Cargar receta cuando se selecciona un producto
  const loadRecipe = useCallback(async (product: DeliveryProduct) => {
    setRecipeItems([]);
    setHasRecipe(false);
    setRecipeId(null);
    setProductId(null);

    // Buscar en products por nombre
    const { data: matchedProducts } = await supabase
      .from('products')
      .select('id')
      .ilike('name', product.name)
      .limit(1);

    if (!matchedProducts || matchedProducts.length === 0) return;

    const pid = matchedProducts[0].id;
    setProductId(pid);

    const { data: recipes } = await supabase
      .from('recipes')
      .select('id')
      .eq('product_id', pid)
      .limit(1);

    if (!recipes || recipes.length === 0) return;

    const rid = recipes[0].id;
    setRecipeId(rid);
    setHasRecipe(true);

    const { data: items } = await supabase
      .from('recipe_items')
      .select('id, recipe_id, ingredient_id, quantity, unit')
      .eq('recipe_id', rid);

    if (items) {
      const enriched = items.map((ri: any) => {
        const ing = allIngredients.find((i: any) => i.id === ri.ingredient_id);
        return {
          ...ri,
          ingredient_name: ing?.name || '?',
          cost_per_unit: ing?.cost_per_unit || 0,
        };
      });
      setRecipeItems(enriched);
    }
  }, [allIngredients]);

  const selectProduct = (p: DeliveryProduct) => {
    setSelected(p);
    setEditName(p.name);
    setEditDesc(p.description || '');
    setEditPrice(String(p.price));
    setEditCategory(p.category || '');
    setEditBrand(p.brand);
    setEditImageUrl(p.image_url || '');
    setEditActive(p.is_active);
    loadRecipe(p);
  };

  // CRUD
  const handleSave = async () => {
    if (!selected) return;
    const { error } = await supabase.from('delivery_products').update({
      name: editName,
      description: editDesc,
      price: parseFloat(editPrice) || 0,
      category: editCategory,
      brand: editBrand,
      image_url: editImageUrl,
      is_active: editActive,
    }).eq('id', selected.id);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Guardado', 'Producto actualizado');
    load();
  };

  const handleDelete = async () => {
    if (!selected) return;
    Alert.alert('Eliminar', `¿Eliminar "${selected.name}"?`, [
      { text: 'Cancelar' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          await supabase.from('delivery_products').delete().eq('id', selected.id);
          setSelected(null);
          load();
        }
      },
    ]);
  };

  const handleToggleActive = async (p: DeliveryProduct) => {
    await supabase.from('delivery_products').update({ is_active: !p.is_active }).eq('id', p.id);
    load();
  };

  const handleCreate = async () => {
    if (!newName.trim()) { Alert.alert('Error', 'Nombre requerido'); return; }
    const { error } = await supabase.from('delivery_products').insert({
      brand: newBrand,
      category: newCategory,
      name: newName.trim(),
      description: newDesc.trim(),
      price: parseFloat(newPrice) || 0,
      is_active: true,
      sort_order: products.length + 1,
    });
    if (error) { Alert.alert('Error', error.message); return; }
    setShowNewModal(false);
    setNewName(''); setNewDesc(''); setNewPrice(''); setNewCategory('pizza'); setNewBrand('Pizza York');
    load();
  };

  // Receta: agregar ingrediente
  const addIngredient = (ing: any) => {
    if (recipeItems.find(ri => ri.ingredient_id === ing.id)) return;
    setRecipeItems([...recipeItems, {
      ingredient_id: ing.id,
      ingredient_name: ing.name,
      quantity: 1,
      unit: ing.unit || 'un',
      cost_per_unit: ing.cost_per_unit || 0,
    }]);
    setIngSearch('');
  };

  const removeIngredient = (idx: number) => {
    setRecipeItems(recipeItems.filter((_, i) => i !== idx));
  };

  const updateQty = (idx: number, qty: string) => {
    const arr = [...recipeItems];
    arr[idx].quantity = parseFloat(qty) || 0;
    setRecipeItems(arr);
  };

  const handleSaveRecipe = async () => {
    if (!selected) return;

    // Buscar producto en products
    const { data: matchedProducts } = await supabase
      .from('products')
      .select('id')
      .ilike('name', selected.name)
      .limit(1);

    if (!matchedProducts || matchedProducts.length === 0) {
      Alert.alert('Aviso', 'Este producto no existe en la tabla "products" de Almíbar. No se puede guardar receta.');
      return;
    }

    const pid = matchedProducts[0].id;
    let rid = recipeId;

    // Si no tiene recipe, crear
    if (!rid) {
      const { data: newRecipe, error } = await supabase
        .from('recipes')
        .insert({ product_id: pid })
        .select('id')
        .single();
      if (error || !newRecipe) { Alert.alert('Error', 'No se pudo crear receta'); return; }
      rid = newRecipe.id;
      setRecipeId(rid);
    }

    // Eliminar items viejos y crear nuevos
    await supabase.from('recipe_items').delete().eq('recipe_id', rid);
    if (recipeItems.length > 0) {
      const rows = recipeItems.map(ri => ({
        recipe_id: rid,
        ingredient_id: ri.ingredient_id,
        quantity: ri.quantity,
        unit: ri.unit,
      }));
      const { error } = await supabase.from('recipe_items').insert(rows);
      if (error) { Alert.alert('Error', error.message); return; }
    }
    Alert.alert('Receta guardada');
    setHasRecipe(true);
  };

  // Costo total de receta
  const recipeCost = recipeItems.reduce((sum, ri) => sum + ri.quantity * ri.cost_per_unit, 0);

  // Filtrado
  const filtered = products.filter(p => {
    if (filterBrand && p.brand !== filterBrand) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const brandCount = (b: Brand) => products.filter(p => p.brand === b).length;

  const getBrandColor = (brand: Brand) => BRANDS.find(b => b.name === brand)?.color || COLORS.textMuted;

  // Ingredientes filtrados para buscador
  const filteredIngredients = ingSearch.length > 1
    ? allIngredients.filter(i => i.name.toLowerCase().includes(ingSearch.toLowerCase())).slice(0, 8)
    : [];

  return (
    <View style={s.container}>
      {/* COLUMNA IZQUIERDA - Sidebar */}
      <View style={s.sidebar}>
        <Text style={s.sidebarTitle}>Dark Kitchens</Text>

        <TouchableOpacity
          style={[s.sidebarItem, !filterBrand && s.sidebarItemActive]}
          onPress={() => setFilterBrand(null)}
        >
          <Text style={[s.sidebarItemText, !filterBrand && { color: '#fff' }]}>
            Todos ({products.length})
          </Text>
        </TouchableOpacity>

        {BRANDS.map(brand => (
          <View key={brand.name}>
            <TouchableOpacity
              style={[s.brandHeader, filterBrand === brand.name && { backgroundColor: brand.color + '18' }]}
              onPress={() => {
                setFilterBrand(brand.name);
                setExpandedBrands(prev => ({ ...prev, [brand.name]: !prev[brand.name] }));
              }}
            >
              <Text style={[s.brandHeaderText, { color: brand.color }]}>
                {brand.emoji} {brand.name} ({brandCount(brand.name)})
              </Text>
              <Text style={{ color: brand.color }}>{expandedBrands[brand.name] ? '▼' : '▶'}</Text>
            </TouchableOpacity>

            {expandedBrands[brand.name] && (
              <View style={s.catList}>
                {CATEGORIES.filter(cat =>
                  products.some(p => p.brand === brand.name && p.category === cat)
                ).map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={s.catItem}
                    onPress={() => { setFilterBrand(brand.name); setSearch(''); }}
                  >
                    <Text style={s.catItemText}>
                      {cat} ({products.filter(p => p.brand === brand.name && p.category === cat).length})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>

      {/* COLUMNA CENTRAL - Tabla */}
      <View style={s.center}>
        <View style={s.searchRow}>
          <TextInput
            style={s.searchInput}
            placeholder="🔍 Buscar producto..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          <TouchableOpacity style={s.addBtn} onPress={() => setShowNewModal(true)}>
            <Text style={s.addBtnText}>+ Nuevo Producto</Text>
          </TouchableOpacity>
        </View>

        {/* Header tabla */}
        <View style={s.tableHeader}>
          <Text style={[s.thCell, { flex: 2 }]}>Producto</Text>
          <Text style={[s.thCell, { flex: 1.2 }]}>Marca</Text>
          <Text style={[s.thCell, { flex: 1 }]}>Categoría</Text>
          <Text style={[s.thCell, { flex: 0.8 }]}>Precio</Text>
          <Text style={[s.thCell, { flex: 0.8 }]}>Costo</Text>
          <Text style={[s.thCell, { flex: 0.6 }]}>Margen</Text>
          <Text style={[s.thCell, { flex: 0.5 }]}>Activo</Text>
        </View>

        <ScrollView style={s.tableBody}>
          {filtered.map(p => {
            const isSelected = selected?.id === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[s.tableRow, isSelected && s.tableRowSelected]}
                onPress={() => selectProduct(p)}
              >
                <Text style={[s.tdCell, { flex: 2, fontWeight: '600' }]} numberOfLines={1}>{p.name}</Text>
                <View style={{ flex: 1.2 }}>
                  <View style={[s.badge, { backgroundColor: getBrandColor(p.brand) + '20' }]}>
                    <Text style={[s.badgeText, { color: getBrandColor(p.brand) }]}>{p.brand}</Text>
                  </View>
                </View>
                <Text style={[s.tdCell, { flex: 1 }]}>{p.category || '—'}</Text>
                <Text style={[s.tdCell, { flex: 0.8 }]}>{fmt(p.price)}</Text>
                <Text style={[s.tdCell, { flex: 0.8, color: COLORS.textMuted }]}>
                  {isSelected && hasRecipe ? fmt(recipeCost) : '—'}
                </Text>
                <Text style={[s.tdCell, { flex: 0.6, color: isSelected && hasRecipe ? (pct(recipeCost, p.price) >= 60 ? COLORS.success : COLORS.warning) : COLORS.textMuted }]}>
                  {isSelected && hasRecipe ? `${pct(recipeCost, p.price)}%` : '—'}
                </Text>
                <View style={{ flex: 0.5, alignItems: 'center' }}>
                  <Switch
                    value={p.is_active}
                    onValueChange={() => handleToggleActive(p)}
                    trackColor={{ true: COLORS.success, false: COLORS.border }}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
          {filtered.length === 0 && (
            <Text style={s.emptyText}>No hay productos</Text>
          )}
        </ScrollView>
      </View>

      {/* COLUMNA DERECHA - Detalle/Editor */}
      <ScrollView style={s.detail}>
        {!selected ? (
          <View style={s.emptyDetail}>
            <Text style={s.emptyDetailText}>Selecciona un producto</Text>
          </View>
        ) : (
          <View style={s.detailContent}>
            <Text style={s.detailTitle}>Editar Producto</Text>

            <Text style={s.label}>Nombre</Text>
            <TextInput style={s.input} value={editName} onChangeText={setEditName} />

            <Text style={s.label}>Descripción</Text>
            <TextInput style={[s.input, { minHeight: 60 }]} value={editDesc} onChangeText={setEditDesc} multiline />

            <Text style={s.label}>Precio</Text>
            <TextInput style={s.input} value={editPrice} onChangeText={setEditPrice} keyboardType="numeric" />

            <Text style={s.label}>Categoría</Text>
            <View style={s.dropdownRow}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[s.catChip, editCategory === cat && s.catChipActive]}
                  onPress={() => setEditCategory(cat)}
                >
                  <Text style={[s.catChipText, editCategory === cat && { color: '#fff' }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Marca</Text>
            <View style={s.dropdownRow}>
              {BRANDS.map(b => (
                <TouchableOpacity
                  key={b.name}
                  style={[s.brandChip, editBrand === b.name && { backgroundColor: b.color }]}
                  onPress={() => setEditBrand(b.name)}
                >
                  <Text style={[s.brandChipText, editBrand === b.name && { color: '#fff' }]}>
                    {b.emoji} {b.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Imagen URL</Text>
            <TextInput style={s.input} value={editImageUrl} onChangeText={setEditImageUrl} placeholder="https://..." placeholderTextColor={COLORS.textMuted} />

            <View style={s.switchRow}>
              <Text style={s.label}>Activo</Text>
              <Switch
                value={editActive}
                onValueChange={setEditActive}
                trackColor={{ true: COLORS.success, false: COLORS.border }}
              />
            </View>

            <View style={s.btnRow}>
              <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                <Text style={s.saveBtnText}>Guardar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}>
                <Text style={s.deleteBtnText}>Eliminar</Text>
              </TouchableOpacity>
            </View>

            {/* FICHA TECNICA */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>FICHA TÉCNICA</Text>
              {hasRecipe ? (
                <View>
                  {recipeItems.map((ri, idx) => (
                    <View key={idx} style={s.fichaRow}>
                      <Text style={s.fichaName}>{ri.ingredient_name}</Text>
                      <Text style={s.fichaQty}>{ri.quantity} {ri.unit}</Text>
                      <Text style={s.fichaCost}>{fmt(ri.quantity * ri.cost_per_unit)}</Text>
                    </View>
                  ))}
                  <View style={s.fichaTotalRow}>
                    <Text style={s.fichaTotalLabel}>Costo total</Text>
                    <Text style={s.fichaTotalValue}>{fmt(recipeCost)}</Text>
                  </View>
                  <View style={s.fichaTotalRow}>
                    <Text style={s.fichaTotalLabel}>Margen</Text>
                    <Text style={[s.fichaTotalValue, { color: pct(recipeCost, parseFloat(editPrice) || 0) >= 60 ? COLORS.success : COLORS.warning }]}>
                      {pct(recipeCost, parseFloat(editPrice) || 0)}%
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={s.noRecipeText}>Sin ficha técnica</Text>
              )}
            </View>

            {/* RECETA EDITABLE */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>RECETA</Text>

              <TextInput
                style={s.input}
                placeholder="Buscar ingrediente..."
                placeholderTextColor={COLORS.textMuted}
                value={ingSearch}
                onChangeText={setIngSearch}
              />
              {filteredIngredients.length > 0 && (
                <View style={s.ingDropdown}>
                  {filteredIngredients.map(ing => (
                    <TouchableOpacity key={ing.id} style={s.ingDropdownItem} onPress={() => addIngredient(ing)}>
                      <Text style={s.ingDropdownText}>{ing.name} ({ing.unit})</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {recipeItems.map((ri, idx) => (
                <View key={idx} style={s.recipeItemRow}>
                  <Text style={s.recipeItemName} numberOfLines={1}>{ri.ingredient_name}</Text>
                  <TextInput
                    style={s.recipeQtyInput}
                    value={String(ri.quantity)}
                    onChangeText={(v) => updateQty(idx, v)}
                    keyboardType="numeric"
                  />
                  <Text style={s.recipeUnit}>{ri.unit}</Text>
                  <TouchableOpacity onPress={() => removeIngredient(idx)}>
                    <Text style={s.removeIngBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={s.saveRecipeBtn} onPress={handleSaveRecipe}>
                <Text style={s.saveRecipeBtnText}>Guardar receta</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* MODAL NUEVO PRODUCTO */}
      <Modal visible={showNewModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Nuevo Producto</Text>

            <Text style={s.label}>Marca</Text>
            <View style={s.dropdownRow}>
              {BRANDS.map(b => (
                <TouchableOpacity
                  key={b.name}
                  style={[s.brandChip, newBrand === b.name && { backgroundColor: b.color }]}
                  onPress={() => setNewBrand(b.name)}
                >
                  <Text style={[s.brandChipText, newBrand === b.name && { color: '#fff' }]}>
                    {b.emoji} {b.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Categoría</Text>
            <View style={s.dropdownRow}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[s.catChip, newCategory === cat && s.catChipActive]}
                  onPress={() => setNewCategory(cat)}
                >
                  <Text style={[s.catChipText, newCategory === cat && { color: '#fff' }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Nombre</Text>
            <TextInput style={s.input} value={newName} onChangeText={setNewName} placeholder="Ej: Pizza Pepperoni" placeholderTextColor={COLORS.textMuted} />

            <Text style={s.label}>Descripción</Text>
            <TextInput style={s.input} value={newDesc} onChangeText={setNewDesc} placeholder="Descripción corta" placeholderTextColor={COLORS.textMuted} />

            <Text style={s.label}>Precio</Text>
            <TextInput style={s.input} value={newPrice} onChangeText={setNewPrice} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.textMuted} />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowNewModal(false)}>
                <Text style={s.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleCreate}>
                <Text style={s.saveBtnText}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.background },

  // Sidebar
  sidebar: { width: 220, backgroundColor: COLORS.card, borderRightWidth: 1, borderRightColor: COLORS.border, paddingTop: 16 },
  sidebarTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, paddingHorizontal: 14, marginBottom: 12 },
  sidebarItem: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, marginHorizontal: 8, marginBottom: 4 },
  sidebarItemActive: { backgroundColor: COLORS.primary },
  sidebarItemText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  brandHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 8, borderRadius: 8, marginTop: 4 },
  brandHeaderText: { fontSize: 13, fontWeight: '700' },
  catList: { paddingLeft: 28, paddingBottom: 4 },
  catItem: { paddingVertical: 6 },
  catItemText: { fontSize: 12, color: COLORS.textMuted },

  // Center
  center: { flex: 1, borderRightWidth: 1, borderRightColor: COLORS.border },
  searchRow: { flexDirection: 'row', padding: 12, gap: 8 },
  searchInput: { flex: 1, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.text },
  addBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.primary, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background },
  thCell: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' },
  tableBody: { flex: 1 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.card },
  tableRowSelected: { backgroundColor: COLORS.primary + '10' },
  tdCell: { fontSize: 13, color: COLORS.text },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: COLORS.textMuted, marginTop: 40, fontSize: 14 },

  // Detail
  detail: { width: 380, backgroundColor: COLORS.card },
  emptyDetail: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyDetailText: { color: COLORS.textMuted, fontSize: 14 },
  detailContent: { padding: 16 },
  detailTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: COLORS.background, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text },
  dropdownRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  catChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  brandChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  brandChipText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  deleteBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.error, alignItems: 'center' },
  deleteBtnText: { color: COLORS.error, fontWeight: '600', fontSize: 14 },

  // Ficha técnica
  section: { marginTop: 24, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, letterSpacing: 0.5, marginBottom: 10 },
  fichaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  fichaName: { flex: 1, fontSize: 12, color: COLORS.text },
  fichaQty: { width: 60, fontSize: 12, color: COLORS.textMuted, textAlign: 'right' },
  fichaCost: { width: 70, fontSize: 12, color: COLORS.textSecondary, textAlign: 'right', fontWeight: '600' },
  fichaTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  fichaTotalLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  fichaTotalValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  noRecipeText: { fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic' },

  // Receta editable
  ingDropdown: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, marginTop: 4, maxHeight: 180 },
  ingDropdownItem: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  ingDropdownText: { fontSize: 13, color: COLORS.text },
  recipeItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  recipeItemName: { flex: 1, fontSize: 12, color: COLORS.text },
  recipeQtyInput: { width: 50, backgroundColor: COLORS.background, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, color: COLORS.text, textAlign: 'center' },
  recipeUnit: { fontSize: 11, color: COLORS.textMuted, width: 30 },
  removeIngBtn: { fontSize: 16, color: COLORS.error, fontWeight: '700', paddingHorizontal: 6 },
  saveRecipeBtn: { marginTop: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.primary + '15', alignItems: 'center' },
  saveRecipeBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modal: { width: '90%' as any, maxWidth: 460, backgroundColor: COLORS.card, borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 12 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  cancelBtnText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
});
