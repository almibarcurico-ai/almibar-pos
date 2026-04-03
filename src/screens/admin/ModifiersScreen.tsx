import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Switch, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';

interface Group { id: string; name: string; type: string; required: boolean; min_select: number; max_select: number; sort_order: number; active: boolean; }
interface Option { id: string; group_id: string; name: string; price_adjust: number; sort_order: number; active: boolean; }

const fmt = (n: number) => n > 0 ? '+$' + n.toLocaleString('es-CL') : n < 0 ? '-$' + Math.abs(n).toLocaleString('es-CL') : '$0';

export default function ModifiersScreen() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [linkedProducts, setLinkedProducts] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<Group | null>(null);
  const [search, setSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

  // Add group
  const [addingGroup, setAddingGroup] = useState(false);
  const [gName, setGName] = useState('');
  const [gType, setGType] = useState('single');
  const [gRequired, setGRequired] = useState(true);
  const [gMax, setGMax] = useState('1');

  // Add option
  const [oName, setOName] = useState('');
  const [oPrice, setOPrice] = useState('0');
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [ingSearch, setIngSearch] = useState('');
  const [localQty, setLocalQty] = useState<Record<string, string>>({});
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    const [gR, oR, pR, lR, iR] = await Promise.all([
      supabase.from('modifier_groups').select('*').order('sort_order'),
      supabase.from('modifier_options').select('*, ingredient:ingredient_id(name, unit, cost_per_unit)').eq('active', true).order('sort_order'),
      supabase.from('products').select('id, name').eq('active', true).order('name'),
      supabase.from('product_modifier_groups').select('*'),
      supabase.from('ingredients').select('id, name, unit, cost_per_unit').eq('active', true).order('name'),
    ]);
    if (gR.data) setGroups(gR.data);
    if (oR.data) setOptions(oR.data);
    if (pR.data) setProducts(pR.data);
    if (iR.data) setIngredients(iR.data);
    if (lR.data) {
      const map: Record<string, string[]> = {};
      lR.data.forEach((l: any) => { if (!map[l.group_id]) map[l.group_id] = []; map[l.group_id].push(l.product_id); });
      setLinkedProducts(map);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groupOptions = selected ? options.filter(o => o.group_id === selected.id) : [];
  const groupLinked = selected ? (linkedProducts[selected.id] || []) : [];

  const addGroup = async () => {
    if (!gName.trim()) return;
    const { data, error } = await supabase.from('modifier_groups').insert({
      name: gName.trim(), type: gType, required: gRequired,
      min_select: gRequired ? 1 : 0, max_select: parseInt(gMax) || 1,
      sort_order: groups.length + 1,
    }).select('*').single();
    if (error) { if (typeof window !== 'undefined') window.alert('Error al crear grupo'); return; }
    setAddingGroup(false); setGName('');
    await load();
    if (data) setSelected(data);
  };

  const deleteGroup = async (g: Group) => {
    const ok = typeof window !== 'undefined' ? window.confirm('¿Eliminar "' + g.name + '"?') : true;
    if (!ok) return;
    await supabase.from('modifier_groups').delete().eq('id', g.id);
    if (selected?.id === g.id) setSelected(null);
    await load();
  };

  const addOptionFromIngredient = async (ing: any) => {
    if (!selected) return;
    await supabase.from('modifier_options').insert({
      group_id: selected.id, name: ing.name,
      ingredient_id: ing.id, quantity: 1, unit: ing.unit,
      price_adjust: parseInt(oPrice) || 0, sort_order: groupOptions.length + 1,
    });
    setIngSearch(''); setOPrice('0');
    await load();
  };

  const addOptionManual = async () => {
    if (!oName.trim() || !selected) return;
    await supabase.from('modifier_options').insert({
      group_id: selected.id, name: oName.trim(),
      price_adjust: parseInt(oPrice) || 0, sort_order: groupOptions.length + 1,
    });
    setOName(''); setOPrice('0');
    await load();
  };

  const updateOptionField = async (optId: string, field: string, value: any) => {
    await supabase.from('modifier_options').update({ [field]: value }).eq('id', optId);
    // Update local state without full reload to prevent focus loss
    setOptions(prev => prev.map(o => o.id === optId ? { ...o, [field]: value } : o));
  };

  const deleteOption = async (o: any) => {
    // First try to check if option was used in orders
    const { count } = await supabase.from('order_item_modifiers').select('id', { count: 'exact', head: true }).eq('option_id', o.id);
    if (count && count > 0) {
      // Used in orders: soft-delete
      await supabase.from('modifier_options').update({ active: false }).eq('id', o.id);
    } else {
      // Never used: hard delete
      await supabase.from('modifier_options').delete().eq('id', o.id);
    }
    await load();
  };

  const toggleProduct = async (productId: string) => {
    if (!selected) return;
    const isLinked = groupLinked.includes(productId);
    if (isLinked) {
      await supabase.from('product_modifier_groups').delete().eq('product_id', productId).eq('group_id', selected.id);
    } else {
      await supabase.from('product_modifier_groups').insert({ product_id: productId, group_id: selected.id });
    }
    await load();
  };

  const filtered = groups.filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={st.wrap}>
      {/* Sidebar */}
      <View style={st.side}>
        <View style={st.sideHdr}>
          <Text style={st.sideTitle}>Modificadores</Text>
          <TouchableOpacity style={st.newBtn} onPress={() => { setAddingGroup(true); setGName(''); setGType('single'); setGRequired(true); setGMax('1'); }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>+ Grupo</Text>
          </TouchableOpacity>
        </View>

        {addingGroup && (
          <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#4A4A4A' }}>
            <TextInput style={st.sideInput} placeholder="Nombre del grupo" placeholderTextColor="#888" value={gName} onChangeText={setGName} autoFocus />
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
              <TouchableOpacity onPress={() => setGType('single')} style={[st.chip, gType === 'single' && st.chipActive]}><Text style={[st.chipT, gType === 'single' && st.chipActiveT]}>Elegir 1</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setGType('multi')} style={[st.chip, gType === 'multi' && st.chipActive]}><Text style={[st.chipT, gType === 'multi' && st.chipActiveT]}>Varios</Text></TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
              <TouchableOpacity style={[st.newBtn, { flex: 1 }]} onPress={addGroup}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 11, textAlign: 'center' }}>Crear</Text></TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 6, alignItems: 'center' }} onPress={() => setAddingGroup(false)}><Text style={{ color: '#999', fontSize: 11 }}>Cancelar</Text></TouchableOpacity>
            </View>
          </View>
        )}

        <TextInput style={st.sideSearch} placeholder="Buscar..." placeholderTextColor="#999" value={search} onChangeText={setSearch} />
        <ScrollView style={{ flex: 1 }}>
          {filtered.map(g => {
            const isActive = selected?.id === g.id;
            const optCount = options.filter(o => o.group_id === g.id).length;
            const prodCount = (linkedProducts[g.id] || []).length;
            return (
              <TouchableOpacity key={g.id} style={[st.sideItem, isActive && st.sideItemActive]} onPress={() => setSelected(g)}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.sideItemT, isActive && st.sideItemTA]}>{g.name}</Text>
                  <Text style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,0.7)' : '#888' }}>
                    {g.type === 'single' ? 'Elegir 1' : `Hasta ${g.max_select}`} · {optCount} opciones · {prodCount} productos
                  </Text>
                </View>
                <TouchableOpacity onPress={() => deleteGroup(g)} style={{ padding: 4 }}><Text style={{ color: isActive ? 'rgba(255,255,255,0.5)' : '#666', fontSize: 12 }}>✕</Text></TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Detail */}
      <View style={st.detail}>
        {selected ? (
          <>
          <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 4 }}>{selected.name}</Text>
            <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
              {selected.type === 'single' ? 'Elegir 1' : `Elegir hasta ${selected.max_select}`} · {selected.required ? 'Obligatorio' : 'Opcional'}
            </Text>

            {/* Options */}
            <Text style={st.sectionTitle}>OPCIONES ({groupOptions.length})</Text>
            {/* Table header */}
            <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: COLORS.border }}>
              <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: COLORS.textMuted }}>OPCIÓN</Text>
              <Text style={{ width: 50, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' }}>CANT.</Text>
              <Text style={{ width: 50, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' }}>UNID.</Text>
              <Text style={{ width: 70, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'right' }}>COSTO</Text>
              <Text style={{ width: 60, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'right' }}>PRECIO</Text>
              <View style={{ width: 24 }} />
            </View>
            {groupOptions.map((o: any) => {
              const ingCost = o.ingredient ? (o.unit === 'ml' && o.ingredient.unit === 'lt' ? o.ingredient.cost_per_unit * (o.quantity || 1) / 1000 : o.unit === 'g' && o.ingredient.unit === 'kg' ? o.ingredient.cost_per_unit * (o.quantity || 1) / 1000 : o.ingredient.cost_per_unit * (o.quantity || 1)) : 0;
              return (
                <View key={o.id} style={st.optionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{o.name}</Text>
                    {o.ingredient && <Text style={{ fontSize: 9, color: COLORS.success }}>🔗 {o.ingredient.name}</Text>}
                    {!o.ingredient_id && <Text style={{ fontSize: 9, color: COLORS.warning }}>⚠ Sin ingrediente</Text>}
                  </View>
                  <TextInput style={{ width: 70, fontSize: 15, textAlign: 'center', backgroundColor: COLORS.background, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 6, paddingHorizontal: 4, color: COLORS.text }} value={localQty[o.id] ?? String(o.quantity || 1)} onChangeText={v => setLocalQty(prev => ({ ...prev, [o.id]: v }))} onBlur={() => { if (localQty[o.id] !== undefined) { const val = parseFloat(localQty[o.id]) || 1; updateOptionField(o.id, 'quantity', val); setLocalQty(prev => { const n = { ...prev }; delete n[o.id]; return n; }); } }} keyboardType="decimal-pad" />
                  <View style={{ width: 55, flexDirection: 'row', gap: 2, justifyContent: 'center' }}>
                    {(o.ingredient?.unit === 'lt' ? ['ml', 'lt'] : o.ingredient?.unit === 'kg' ? ['g', 'kg'] : ['unid']).map((u: string) => (
                      <TouchableOpacity key={u} onPress={() => updateOptionField(o.id, 'unit', u)} style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4, backgroundColor: (o.unit || o.ingredient?.unit) === u ? COLORS.primary : COLORS.background, borderWidth: 1, borderColor: (o.unit || o.ingredient?.unit) === u ? COLORS.primary : COLORS.border }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: (o.unit || o.ingredient?.unit) === u ? '#fff' : COLORS.textMuted }}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={{ width: 70, fontSize: 11, color: COLORS.textSecondary, textAlign: 'right' }}>{ingCost > 0 ? '$' + Math.round(ingCost).toLocaleString('es-CL') : '-'}</Text>
                  <Text style={{ width: 60, fontSize: 11, fontWeight: '700', color: o.price_adjust > 0 ? COLORS.warning : o.price_adjust < 0 ? COLORS.success : COLORS.textMuted, textAlign: 'right' }}>{o.price_adjust !== 0 ? fmt(o.price_adjust) : '$0'}</Text>
                  <TouchableOpacity onPress={() => deleteOption(o)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.error, fontSize: 18, fontWeight: '700' }}>✕</Text></TouchableOpacity>
                </View>
              );
            })}

            {/* Add option from ingredient */}
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 4 }}>Agregar opción desde ingrediente:</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput style={[st.input, { flex: 1 }]} placeholder="🔍 Buscar ingrediente..." placeholderTextColor={COLORS.textMuted} value={ingSearch} onChangeText={setIngSearch} />
                <View style={{ width: 80 }}>
                  <TextInput style={st.input} value={oPrice} onChangeText={setOPrice} keyboardType="number-pad" placeholder="+$0" placeholderTextColor={COLORS.textMuted} />
                </View>
              </View>
              {ingSearch.length >= 2 && (
                <View style={{ backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, maxHeight: 120, marginTop: 4 }}>
                  <ScrollView nestedScrollEnabled>
                    {ingredients.filter(i => i.name.toLowerCase().includes(ingSearch.toLowerCase())).slice(0, 10).map(i => (
                      <TouchableOpacity key={i.id} style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between' }} onPress={() => addOptionFromIngredient(i)}>
                        <Text style={{ fontSize: 12, color: COLORS.text }}>{i.name}</Text>
                        <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{i.unit} · ${i.cost_per_unit}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              {/* Or manual */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <TextInput style={[st.input, { flex: 1 }]} placeholder="O escribir nombre manual..." placeholderTextColor={COLORS.textMuted} value={oName} onChangeText={setOName} />
                <TouchableOpacity style={[st.newBtn, { paddingVertical: 8 }]} onPress={addOptionManual}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>+ Manual</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Linked Products */}
            <Text style={[st.sectionTitle, { marginTop: 24 }]}>PRODUCTOS ASOCIADOS ({groupLinked.length})</Text>
            <TextInput style={[st.input, { marginBottom: 8 }]} placeholder="🔍 Buscar producto para asociar..." placeholderTextColor={COLORS.textMuted} value={productSearch} onChangeText={setProductSearch} />

            {productSearch.length >= 2 && (
              <View style={{ backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, maxHeight: 150, marginBottom: 8 }}>
                <ScrollView nestedScrollEnabled>
                  {products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 15).map(p => {
                    const isLinked = groupLinked.includes(p.id);
                    return (
                      <TouchableOpacity key={p.id} style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', backgroundColor: isLinked ? COLORS.success + '10' : 'transparent' }} onPress={() => toggleProduct(p.id)}>
                        <Text style={{ fontSize: 14, marginRight: 8 }}>{isLinked ? '☑' : '☐'}</Text>
                        <Text style={{ fontSize: 13, color: COLORS.text, flex: 1 }}>{p.name}</Text>
                        {isLinked && <Text style={{ fontSize: 10, color: COLORS.success, fontWeight: '600' }}>Asociado</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Current linked list */}
            {groupLinked.length > 0 && (
              <View>
                {groupLinked.map(pid => {
                  const p = products.find(x => x.id === pid);
                  return p ? (
                    <View key={pid} style={st.optionRow}>
                      <Text style={{ flex: 1, fontSize: 13, color: COLORS.text }}>{p.name}</Text>
                      <TouchableOpacity onPress={() => toggleProduct(pid)}>
                        <Text style={{ color: COLORS.error, fontSize: 11, fontWeight: '600' }}>Desvincular</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null;
                })}
              </View>
            )}
          </ScrollView>
          {/* Scroll buttons */}
          <View style={{ position: 'absolute', right: 16, bottom: 16, gap: 8 }}>
            <TouchableOpacity onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>↑</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => scrollRef.current?.scrollToEnd({ animated: true })} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>↓</Text>
            </TouchableOpacity>
          </View>
        </>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 40 }}>🎛️</Text>
            <Text style={{ color: COLORS.textMuted, marginTop: 8 }}>Selecciona un grupo de modificadores</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.background },
  side: { width: 260, backgroundColor: '#3C3C3C', maxHeight: '100%' },
  sideHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  sideTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  newBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  sideSearch: { backgroundColor: '#4A4A4A', borderRadius: 8, marginHorizontal: 10, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#fff' },
  sideInput: { backgroundColor: '#4A4A4A', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#fff' },
  sideItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#4A4A4A', flexDirection: 'row', alignItems: 'center' },
  sideItemActive: { backgroundColor: COLORS.primary },
  sideItemT: { fontSize: 13, color: '#CCC' },
  sideItemTA: { color: '#fff', fontWeight: '700' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#4A4A4A' },
  chipActive: { backgroundColor: COLORS.primary },
  chipT: { fontSize: 10, color: '#CCC', fontWeight: '600' },
  chipActiveT: { color: '#fff' },
  detail: { flex: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 0.5, marginBottom: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8 },
  input: { backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: COLORS.text },
});
