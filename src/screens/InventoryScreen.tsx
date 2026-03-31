// src/screens/InventoryScreen.tsx
// Ingredients, Suppliers, Recipes, Purchases, Food Cost

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, FlatList, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Product } from '../types';
import { COLORS } from '../theme';

const { width: SW } = Dimensions.get('window');
const fmt = (p: number) => '$' + Math.round(p).toLocaleString('es-CL');

type SubView = 'menu' | 'ingredients' | 'suppliers' | 'recipes' | 'purchases';

interface Props { onBack: () => void; initialSub?: string; }

export default function InventoryScreen({ onBack, initialSub }: Props) {
  const [sub, setSub] = useState<SubView>((initialSub as SubView) || 'menu');

  return (
    <View style={s.c}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={sub === 'menu' ? onBack : () => setSub('menu')}>
          <Text style={s.back}>{sub === 'menu' ? '← Admin' : '← Volver'}</Text>
        </TouchableOpacity>
        <Text style={s.hdrT}>📦 Inventario</Text>
        <View style={{ width: 60 }} />
      </View>
      {sub === 'menu' && <InventoryMenu onSelect={setSub} />}
      {sub === 'ingredients' && <IngredientsView />}
      {sub === 'suppliers' && <SuppliersView />}
      {sub === 'recipes' && <RecipesView />}
      {sub === 'purchases' && <PurchasesView />}
    </View>
  );
}

// === MENU ===
function InventoryMenu({ onSelect }: { onSelect: (v: SubView) => void }) {
  const cards = [
    { key: 'ingredients' as SubView, icon: '🧅', title: 'Ingredientes', desc: 'Stock, costos, unidades de medida' },
    { key: 'suppliers' as SubView, icon: '🚛', title: 'Proveedores', desc: 'Datos de contacto y banco' },
    { key: 'recipes' as SubView, icon: '📋', title: 'Recetas', desc: 'Ingredientes por producto + food cost' },
    { key: 'purchases' as SubView, icon: '🧾', title: 'Compras', desc: 'Facturas, actualizar stock y costos' },
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {cards.map(c => (
        <TouchableOpacity key={c.key} style={s.menuCard} onPress={() => onSelect(c.key)}>
          <Text style={{ fontSize: 32 }}>{c.icon}</Text>
          <Text style={s.menuCardT}>{c.title}</Text>
          <Text style={s.menuCardD}>{c.desc}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// === INGREDIENTES ===
function IngredientsView() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>({});
  const [isNew, setIsNew] = useState(false);

  useEffect(() => { load(); }, []);
  const load = async () => {
    const { data } = await supabase.from('ingredients').select('*, supplier:default_supplier_id(name)').eq('active', true).order('name');
    if (data) setItems(data);
  };

  const filtered = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => { setEditing({ name: '', unit: 'gr', stock: 0, cost_per_unit: 0, min_stock: 0 }); setIsNew(true); setModal(true); };
  const openEdit = (i: any) => { setEditing({ ...i }); setIsNew(false); setModal(true); };

  const save = async () => {
    try {
      if (isNew) {
        await supabase.from('ingredients').insert({ name: editing.name, unit: editing.unit, stock: parseFloat(editing.stock) || 0, cost_per_unit: parseFloat(editing.cost_per_unit) || 0, min_stock: parseFloat(editing.min_stock) || 0, default_supplier_id: editing.default_supplier_id || null });
      } else {
        await supabase.from('ingredients').update({ name: editing.name, unit: editing.unit, cost_per_unit: parseFloat(editing.cost_per_unit) || 0, min_stock: parseFloat(editing.min_stock) || 0 }).eq('id', editing.id);
      }
      setModal(false); await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const unitLabels: Record<string, string> = { gr: 'Gramos', kg: 'Kilos', ml: 'Mililitros', lt: 'Litros', unidad: 'Unidad' };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.searchRow}>
        <TextInput style={s.searchInp} placeholder="🔍 Buscar ingrediente..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} />
        <TouchableOpacity style={s.addBtn} onPress={openNew}><Text style={s.addBtnT}>+ Nuevo</Text></TouchableOpacity>
      </View>
      <Text style={s.count}>{filtered.length} ingredientes</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80 }}>
        {filtered.map(i => {
          const lowStock = i.min_stock > 0 && i.stock <= i.min_stock;
          return (
            <TouchableOpacity key={i.id} style={[s.row, lowStock && { borderColor: COLORS.error + '60' }]} onPress={() => openEdit(i)}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{i.name}</Text>
                <Text style={s.rowSub}>Costo: {fmt(i.cost_per_unit)}/{i.unit} • Proveedor: {i.supplier?.name || 'N/A'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.stockVal, lowStock && { color: COLORS.error }]}>{i.stock.toLocaleString('es-CL')} {i.unit}</Text>
                {lowStock && <Text style={{ fontSize: 10, color: COLORS.error }}>⚠️ Stock bajo</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={modal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}><View style={s.md}>
          <Text style={s.mdT}>{isNew ? '🧅 Nuevo Ingrediente' : '✏️ Editar Ingrediente'}</Text>
          <Text style={s.lb}>Nombre</Text>
          <TextInput style={s.inp} value={editing.name} onChangeText={t => setEditing((e: any) => ({ ...e, name: t }))} placeholder="Ej: Salmón fresco" placeholderTextColor={COLORS.textMuted} />
          <Text style={s.lb}>Unidad de medida</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(unitLabels).map(([k, v]) => (
              <TouchableOpacity key={k} onPress={() => setEditing((e: any) => ({ ...e, unit: k }))} style={[s.chip, editing.unit === k && s.chipA]}>
                <Text style={[s.chipT, editing.unit === k && { color: '#fff' }]}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.lb}>Costo por {editing.unit || 'unidad'}</Text>
          <TextInput style={s.inp} value={String(editing.cost_per_unit || '')} onChangeText={t => setEditing((e: any) => ({ ...e, cost_per_unit: t }))} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.textMuted} />
          {isNew && (<>
            <Text style={s.lb}>Stock inicial</Text>
            <TextInput style={s.inp} value={String(editing.stock || '')} onChangeText={t => setEditing((e: any) => ({ ...e, stock: t }))} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.textMuted} />
          </>)}
          <Text style={s.lb}>Stock mínimo (alerta)</Text>
          <TextInput style={s.inp} value={String(editing.min_stock || '')} onChangeText={t => setEditing((e: any) => ({ ...e, min_stock: t }))} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.textMuted} />
          <View style={s.mBs}>
            <TouchableOpacity style={s.bC} onPress={() => setModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={s.bOk} onPress={save}><Text style={s.bOkT}>Guardar</Text></TouchableOpacity>
          </View>
        </View></ScrollView></View>
      </Modal>
    </View>
  );
}

// === PROVEEDORES ===
function SuppliersView() {
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>({});
  const [isNew, setIsNew] = useState(false);

  useEffect(() => { load(); }, []);
  const load = async () => { const { data } = await supabase.from('suppliers').select('*').eq('active', true).order('name'); if (data) setItems(data); };

  const openNew = () => { setEditing({ name: '', rut: '', phone: '', email: '', contact_name: '', bank_name: '', bank_account: '' }); setIsNew(true); setModal(true); };
  const openEdit = (i: any) => { setEditing({ ...i }); setIsNew(false); setModal(true); };

  const save = async () => {
    try {
      if (isNew) { await supabase.from('suppliers').insert({ name: editing.name, rut: editing.rut, phone: editing.phone, email: editing.email, contact_name: editing.contact_name, bank_name: editing.bank_name, bank_account: editing.bank_account }); }
      else { await supabase.from('suppliers').update({ name: editing.name, rut: editing.rut, phone: editing.phone, email: editing.email, contact_name: editing.contact_name, bank_name: editing.bank_name, bank_account: editing.bank_account }).eq('id', editing.id); }
      setModal(false); await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.searchRow}>
        <Text style={[s.count, { flex: 1 }]}>{items.length} proveedores</Text>
        <TouchableOpacity style={s.addBtn} onPress={openNew}><Text style={s.addBtnT}>+ Nuevo</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80 }}>
        {items.map(i => (
          <TouchableOpacity key={i.id} style={s.row} onPress={() => openEdit(i)}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowName}>{i.name}</Text>
              <Text style={s.rowSub}>{i.rut || 'Sin RUT'} • {i.phone || 'Sin teléfono'}</Text>
              {i.bank_name && <Text style={s.rowSub}>🏦 {i.bank_name} — {i.bank_account}</Text>}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={modal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}><View style={s.md}>
          <Text style={s.mdT}>{isNew ? '🚛 Nuevo Proveedor' : '✏️ Editar Proveedor'}</Text>
          {[['Nombre*', 'name', 'Ej: Distribuidora Mar'], ['RUT', 'rut', '12.345.678-9'], ['Teléfono', 'phone', '+56 9 1234 5678'], ['Email', 'email', 'contacto@proveedor.cl'], ['Contacto', 'contact_name', 'Nombre de contacto'], ['Banco', 'bank_name', 'Banco Estado'], ['N° Cuenta', 'bank_account', '1234567890']].map(([label, key, ph]) => (
            <React.Fragment key={key as string}>
              <Text style={s.lb}>{label}</Text>
              <TextInput style={s.inp} value={editing[key as string] || ''} onChangeText={t => setEditing((e: any) => ({ ...e, [key as string]: t }))} placeholder={ph as string} placeholderTextColor={COLORS.textMuted} />
            </React.Fragment>
          ))}
          <View style={s.mBs}>
            <TouchableOpacity style={s.bC} onPress={() => setModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={s.bOk} onPress={save}><Text style={s.bOkT}>Guardar</Text></TouchableOpacity>
          </View>
        </View></ScrollView></View>
      </Modal>
    </View>
  );
}

// === RECETAS + FOOD COST ===
function RecipesView() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [recipeModal, setRecipeModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recipeItems, setRecipeItems] = useState<{ ingredient_id: string; ingredient_name: string; quantity: string; unit: string; cost: number }[]>([]);
  const [addIngModal, setAddIngModal] = useState(false);
  const [ingSearch, setIngSearch] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => {
    const { data: p } = await supabase.from('products').select('*').eq('active', true).order('name');
    const { data: i } = await supabase.from('ingredients').select('*').eq('active', true).order('name');
    const { data: r } = await supabase.from('recipes').select('*, recipe_items(*, ingredient:ingredient_id(name, unit, cost_per_unit))').order('created_at');
    if (p) setProducts(p);
    if (i) setIngredients(i);
    if (r) setRecipes(r);
  };

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const getRecipe = (productId: string) => recipes.find((r: any) => r.product_id === productId);

  const openRecipe = (product: Product) => {
    setSelectedProduct(product);
    const existing = getRecipe(product.id);
    if (existing && existing.recipe_items) {
      setRecipeItems(existing.recipe_items.map((ri: any) => ({
        ingredient_id: ri.ingredient_id,
        ingredient_name: ri.ingredient?.name || '',
        quantity: String(ri.quantity),
        unit: ri.ingredient?.unit || 'gr',
        cost: ri.ingredient?.cost_per_unit || 0,
      })));
    } else {
      setRecipeItems([]);
    }
    setRecipeModal(true);
  };

  const addIngredient = (ing: any) => {
    if (recipeItems.find(ri => ri.ingredient_id === ing.id)) {
      Alert.alert('Ya existe', 'Este ingrediente ya está en la receta');
      return;
    }
    setRecipeItems(prev => [...prev, { ingredient_id: ing.id, ingredient_name: ing.name, quantity: '', unit: ing.unit, cost: ing.cost_per_unit }]);
    setAddIngModal(false);
  };

  const removeIngredient = (idx: number) => { setRecipeItems(prev => prev.filter((_, i) => i !== idx)); };
  const updateQty = (idx: number, qty: string) => { setRecipeItems(prev => prev.map((ri, i) => i === idx ? { ...ri, quantity: qty } : ri)); };

  // Cálculos food cost
  const recipeCost = recipeItems.reduce((s, ri) => s + (parseFloat(ri.quantity) || 0) * ri.cost, 0);
  const suggestedNeto = recipeCost > 0 ? recipeCost / 0.30 : 0;
  const suggestedIVA = suggestedNeto * 1.19;
  const currentPrice = selectedProduct?.price || 0;
  const currentFC = currentPrice > 0 ? (recipeCost / (currentPrice / 1.19)) * 100 : 0;

  const saveRecipe = async () => {
    if (!selectedProduct) return;
    try {
      const existing = getRecipe(selectedProduct.id);
      let recipeId: string;

      if (existing) {
        recipeId = existing.id;
        await supabase.from('recipe_items').delete().eq('recipe_id', recipeId);
      } else {
        const { data, error } = await supabase.from('recipes').insert({ product_id: selectedProduct.id }).select().single();
        if (error) throw error;
        recipeId = data.id;
      }

      if (recipeItems.length > 0) {
        const items = recipeItems.filter(ri => parseFloat(ri.quantity) > 0).map(ri => ({
          recipe_id: recipeId,
          ingredient_id: ri.ingredient_id,
          quantity: parseFloat(ri.quantity),
        }));
        if (items.length > 0) {
          const { error } = await supabase.from('recipe_items').insert(items);
          if (error) throw error;
        }
      }

      setRecipeModal(false);
      Alert.alert('✅ Receta guardada', `Costo: ${fmt(recipeCost)} • FC: ${currentFC.toFixed(1)}%`);
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.searchRow}>
        <TextInput style={s.searchInp} placeholder="🔍 Buscar producto..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80 }}>
        {filtered.map(p => {
          const r = getRecipe(p.id);
          const hasRecipe = r && r.recipe_items && r.recipe_items.length > 0;
          const cost = hasRecipe ? r.recipe_items.reduce((s: number, ri: any) => s + ri.quantity * (ri.ingredient?.cost_per_unit || 0), 0) : 0;
          const fc = p.price > 0 ? (cost / (p.price / 1.19)) * 100 : 0;
          return (
            <TouchableOpacity key={p.id} style={s.row} onPress={() => openRecipe(p)}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{p.name}</Text>
                <Text style={s.rowSub}>Precio: {fmt(p.price)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {hasRecipe ? (<>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.success }}>Costo: {fmt(cost)}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: fc > 35 ? COLORS.error : fc > 30 ? COLORS.warning : COLORS.success }}>FC: {fc.toFixed(1)}%</Text>
                </>) : (
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>Sin receta</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Modal receta */}
      <Modal visible={recipeModal} animationType="slide">
        <View style={s.c}>
          <View style={s.hdr}>
            <TouchableOpacity onPress={() => setRecipeModal(false)}><Text style={s.back}>✕ Cerrar</Text></TouchableOpacity>
            <Text style={s.hdrT}>📋 {selectedProduct?.name}</Text>
            <TouchableOpacity onPress={saveRecipe}><Text style={{ color: COLORS.success, fontSize: 15, fontWeight: '700' }}>💾 Guardar</Text></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
            {/* Food cost card */}
            <View style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 10, textTransform: 'uppercase' }}>Food Cost Calculator</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: COLORS.textSecondary }}>Costo receta:</Text>
                <Text style={{ fontWeight: '800', color: COLORS.text }}>{fmt(recipeCost)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: COLORS.textSecondary }}>Precio actual:</Text>
                <Text style={{ fontWeight: '700', color: COLORS.text }}>{fmt(currentPrice)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: COLORS.textSecondary }}>Food Cost actual:</Text>
                <Text style={{ fontWeight: '800', color: currentFC > 35 ? COLORS.error : currentFC > 30 ? COLORS.warning : COLORS.success }}>{currentFC.toFixed(1)}%</Text>
              </View>
              <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 10 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: COLORS.textSecondary }}>Precio sugerido (FC 30%):</Text>
                <Text style={{ fontWeight: '800', color: COLORS.primary, fontSize: 18 }}>{fmt(suggestedIVA)}</Text>
              </View>
              <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Neto: {fmt(suggestedNeto)} + IVA 19% = {fmt(suggestedIVA)}</Text>
            </View>

            {/* Ingredientes de la receta */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase' }}>Ingredientes ({recipeItems.length})</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => { setIngSearch(''); setAddIngModal(true); }}><Text style={s.addBtnT}>+ Agregar</Text></TouchableOpacity>
            </View>

            {recipeItems.map((ri, idx) => (
              <View key={idx} style={[s.row, { gap: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{ri.ingredient_name}</Text>
                  <Text style={s.rowSub}>Costo: {fmt(ri.cost)}/{ri.unit} → {fmt((parseFloat(ri.quantity) || 0) * ri.cost)}</Text>
                </View>
                <TextInput
                  style={[s.inp, { width: 80, textAlign: 'center', fontSize: 16, fontWeight: '700' }]}
                  value={ri.quantity}
                  onChangeText={t => updateQty(idx, t)}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                />
                <Text style={{ fontSize: 12, color: COLORS.textMuted, width: 30 }}>{ri.unit}</Text>
                <TouchableOpacity onPress={() => removeIngredient(idx)}><Text style={{ fontSize: 16, color: COLORS.error }}>✕</Text></TouchableOpacity>
              </View>
            ))}

            {recipeItems.length === 0 && <Text style={{ textAlign: 'center', color: COLORS.textMuted, marginTop: 30 }}>Agrega ingredientes para calcular el food cost</Text>}
          </ScrollView>
        </View>

        {/* Sub-modal: seleccionar ingrediente */}
        <Modal visible={addIngModal} transparent animationType="fade">
          <View style={s.ov}><View style={[s.md, { maxHeight: '80%' }]}>
            <Text style={s.mdT}>Seleccionar Ingrediente</Text>
            <TextInput style={[s.inp, { marginTop: 12 }]} placeholder="🔍 Buscar..." placeholderTextColor={COLORS.textMuted} value={ingSearch} onChangeText={setIngSearch} autoFocus />
            <ScrollView style={{ maxHeight: 350, marginTop: 10 }}>
              {ingredients.filter(i => !ingSearch || i.name.toLowerCase().includes(ingSearch.toLowerCase())).map(i => (
                <TouchableOpacity key={i.id} style={s.row} onPress={() => addIngredient(i)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowName}>{i.name}</Text>
                    <Text style={s.rowSub}>{fmt(i.cost_per_unit)}/{i.unit} • Stock: {i.stock} {i.unit}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[s.bC, { marginTop: 12 }]} onPress={() => setAddIngModal(false)}><Text style={s.bCT}>Cerrar</Text></TouchableOpacity>
          </View></View>
        </Modal>
      </Modal>
    </View>
  );
}

// === COMPRAS ===
function PurchasesView() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [inv, setInv] = useState<any>({});
  const [invItems, setInvItems] = useState<{ ingredient_id: string; name: string; quantity: string; unit_price: string; unit: string }[]>([]);
  const [addItemModal, setAddItemModal] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => {
    const { data: i } = await supabase.from('purchase_invoices').select('*, supplier:supplier_id(name), purchase_items(*, ingredient:ingredient_id(name, unit))').order('date', { ascending: false }).limit(50);
    const { data: ing } = await supabase.from('ingredients').select('*').eq('active', true).order('name');
    const { data: sup } = await supabase.from('suppliers').select('*').eq('active', true).order('name');
    if (i) setInvoices(i);
    if (ing) setIngredients(ing);
    if (sup) setSuppliers(sup);
  };

  const openNew = () => {
    setInv({ supplier_id: suppliers[0]?.id || '', invoice_number: '', date: new Date().toISOString().split('T')[0], payment_method: 'transferencia', notes: '' });
    setInvItems([]);
    setModal(true);
  };

  const addItem = (ing: any) => {
    setInvItems(prev => [...prev, { ingredient_id: ing.id, name: ing.name, quantity: '', unit_price: String(ing.cost_per_unit || ''), unit: ing.unit }]);
    setAddItemModal(false);
  };

  const invTotal = invItems.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);

  const saveInvoice = async () => {
    if (!user || invItems.length === 0) { Alert.alert('Error', 'Agrega al menos un item'); return; }
    try {
      const neto = Math.round(invTotal / 1.19);
      const iva = invTotal - neto;
      const { data: invData, error: invErr } = await supabase.from('purchase_invoices').insert({
        supplier_id: inv.supplier_id || null,
        invoice_number: inv.invoice_number,
        date: inv.date,
        payment_method: inv.payment_method,
        subtotal: neto, tax: iva, total: Math.round(invTotal),
        notes: inv.notes,
        created_by: user.id,
      }).select().single();
      if (invErr) throw invErr;

      const items = invItems.filter(i => parseFloat(i.quantity) > 0).map(i => ({
        invoice_id: invData.id,
        ingredient_id: i.ingredient_id,
        quantity: parseFloat(i.quantity),
        unit_price: parseFloat(i.unit_price),
        total_price: parseFloat(i.quantity) * parseFloat(i.unit_price),
      }));
      const { error: itemsErr } = await supabase.from('purchase_items').insert(items);
      if (itemsErr) throw itemsErr;

      setModal(false);
      Alert.alert('✅ Factura registrada', `Total: ${fmt(invTotal)}\nStock actualizado automáticamente`);
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.searchRow}>
        <Text style={[s.count, { flex: 1 }]}>{invoices.length} facturas</Text>
        <TouchableOpacity style={s.addBtn} onPress={openNew}><Text style={s.addBtnT}>+ Nueva Compra</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80 }}>
        {invoices.map(i => (
          <View key={i.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowName}>{i.supplier?.name || 'Sin proveedor'} — #{i.invoice_number || 'S/N'}</Text>
              <Text style={s.rowSub}>{i.date} • {i.payment_method} • {i.purchase_items?.length || 0} items</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.primary }}>{fmt(i.total)}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Modal nueva compra */}
      <Modal visible={modal} animationType="slide">
        <View style={s.c}>
          <View style={s.hdr}>
            <TouchableOpacity onPress={() => setModal(false)}><Text style={[s.back, { color: COLORS.error }]}>✕ Cancelar</Text></TouchableOpacity>
            <Text style={s.hdrT}>🧾 Nueva Compra</Text>
            <TouchableOpacity onPress={saveInvoice}><Text style={{ color: COLORS.success, fontSize: 15, fontWeight: '700' }}>💾 Guardar</Text></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
            <Text style={s.lb}>Proveedor</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }}>
              {suppliers.map(sup => (
                <TouchableOpacity key={sup.id} style={[s.chip, inv.supplier_id === sup.id && s.chipA]} onPress={() => setInv((e: any) => ({ ...e, supplier_id: sup.id }))}>
                  <Text style={[s.chipT, inv.supplier_id === sup.id && { color: '#fff' }]}>{sup.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Text style={s.lb}>N° Factura</Text><TextInput style={s.inp} value={inv.invoice_number} onChangeText={t => setInv((e: any) => ({ ...e, invoice_number: t }))} placeholder="F-001" placeholderTextColor={COLORS.textMuted} /></View>
              <View style={{ flex: 1 }}><Text style={s.lb}>Fecha</Text><TextInput style={s.inp} value={inv.date} onChangeText={t => setInv((e: any) => ({ ...e, date: t }))} placeholder="2026-03-23" placeholderTextColor={COLORS.textMuted} /></View>
            </View>

            <Text style={s.lb}>Método de pago</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {['efectivo', 'debito', 'credito', 'transferencia', 'credito_proveedor'].map(m => (
                <TouchableOpacity key={m} style={[s.chip, inv.payment_method === m && s.chipA]} onPress={() => setInv((e: any) => ({ ...e, payment_method: m }))}>
                  <Text style={[s.chipT, inv.payment_method === m && { color: '#fff' }]}>{m === 'credito_proveedor' ? 'Crédito Prov.' : m.charAt(0).toUpperCase() + m.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase' }}>Items ({invItems.length})</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => { setItemSearch(''); setAddItemModal(true); }}><Text style={s.addBtnT}>+ Item</Text></TouchableOpacity>
            </View>

            {invItems.map((item, idx) => (
              <View key={idx} style={[s.row, { gap: 6 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{item.name}</Text>
                  <Text style={s.rowSub}>Total: {fmt((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0))}</Text>
                </View>
                <TextInput style={[s.inp, { width: 60, textAlign: 'center', fontSize: 14 }]} value={item.quantity} onChangeText={t => setInvItems(p => p.map((i, ix) => ix === idx ? { ...i, quantity: t } : i))} keyboardType="numeric" placeholder="Cant" placeholderTextColor={COLORS.textMuted} />
                <Text style={{ fontSize: 11, color: COLORS.textMuted, width: 24 }}>{item.unit}</Text>
                <TextInput style={[s.inp, { width: 80, textAlign: 'center', fontSize: 14 }]} value={item.unit_price} onChangeText={t => setInvItems(p => p.map((i, ix) => ix === idx ? { ...i, unit_price: t } : i))} keyboardType="numeric" placeholder="$/u" placeholderTextColor={COLORS.textMuted} />
                <TouchableOpacity onPress={() => setInvItems(p => p.filter((_, i) => i !== idx))}><Text style={{ fontSize: 16, color: COLORS.error }}>✕</Text></TouchableOpacity>
              </View>
            ))}

            {invTotal > 0 && (
              <View style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginTop: 16, borderWidth: 1, borderColor: COLORS.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}><Text style={{ color: COLORS.textSecondary }}>Neto</Text><Text style={{ fontWeight: '600', color: COLORS.text }}>{fmt(invTotal / 1.19)}</Text></View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}><Text style={{ color: COLORS.textSecondary }}>IVA 19%</Text><Text style={{ fontWeight: '600', color: COLORS.text }}>{fmt(invTotal - invTotal / 1.19)}</Text></View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: COLORS.primary, paddingTop: 8, marginTop: 4 }}><Text style={{ fontWeight: '800', color: COLORS.text, fontSize: 16 }}>Total</Text><Text style={{ fontWeight: '800', color: COLORS.primary, fontSize: 18 }}>{fmt(invTotal)}</Text></View>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Sub-modal seleccionar ingrediente */}
        <Modal visible={addItemModal} transparent animationType="fade">
          <View style={s.ov}><View style={[s.md, { maxHeight: '80%' }]}>
            <Text style={s.mdT}>Agregar Ingrediente</Text>
            <TextInput style={[s.inp, { marginTop: 12 }]} placeholder="🔍 Buscar..." placeholderTextColor={COLORS.textMuted} value={itemSearch} onChangeText={setItemSearch} autoFocus />
            <ScrollView style={{ maxHeight: 350, marginTop: 10 }}>
              {ingredients.filter(i => !itemSearch || i.name.toLowerCase().includes(itemSearch.toLowerCase())).map(i => (
                <TouchableOpacity key={i.id} style={s.row} onPress={() => addItem(i)}>
                  <Text style={s.rowName}>{i.name}</Text>
                  <Text style={s.rowSub}>{fmt(i.cost_per_unit)}/{i.unit}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[s.bC, { marginTop: 12 }]} onPress={() => setAddItemModal(false)}><Text style={s.bCT}>Cerrar</Text></TouchableOpacity>
          </View></View>
        </Modal>
      </Modal>
    </View>
  );
}

// === STYLES ===
const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  hdrT: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  back: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },
  menuCard: { width: '47%' as any, backgroundColor: COLORS.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  menuCardT: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  menuCardD: { fontSize: 11, color: COLORS.textSecondary },
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  searchInp: { flex: 1, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.text },
  addBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.primary },
  addBtnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
  count: { paddingHorizontal: 16, fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginVertical: 3, borderWidth: 1, borderColor: COLORS.border },
  rowName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  rowSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  stockVal: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  ov: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' },
  md: { width: SW * 0.92, maxWidth: 480, backgroundColor: COLORS.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border },
  mdT: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  lb: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginTop: 14 },
  inp: { backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, marginRight: 6 },
  chipA: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipT: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  mBs: { flexDirection: 'row', gap: 12, marginTop: 20 },
  bC: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  bCT: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },
  bOk: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  bOkT: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
