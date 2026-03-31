import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Switch } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';

interface Group { id: string; name: string; type: string; required: boolean; min_select: number; max_select: number; sort_order: number; active: boolean; }
interface Option { id: string; group_id: string; name: string; price_adjust: number; ingredient_id: string|null; product_id: string|null; sort_order: number; active: boolean; }
interface Product { id: string; name: string; }
interface Ingredient { id: string; name: string; unit: string; }

const fmt = (n: number) => n > 0 ? '+$' + n.toLocaleString('es-CL') : n < 0 ? '-$' + Math.abs(n).toLocaleString('es-CL') : '$0';

export default function ModifiersScreen() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [linkedProducts, setLinkedProducts] = useState<Record<string, string[]>>({});
  const [selectedGroup, setSelectedGroup] = useState<Group|null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddOption, setShowAddOption] = useState(false);
  const [showLinkProduct, setShowLinkProduct] = useState(false);

  // Form states
  const [gName, setGName] = useState('');
  const [gType, setGType] = useState('single');
  const [gRequired, setGRequired] = useState(true);
  const [gMax, setGMax] = useState('1');
  const [oName, setOName] = useState('');
  const [oPrice, setOPrice] = useState('0');
  const [oIngredientId, setOIngredientId] = useState<string|null>(null);
  const [oProductId, setOProductId] = useState<string|null>(null);
  const [oLinkSearch, setOLinkSearch] = useState('');
  const [oLinkType, setOLinkType] = useState<'none'|'ingredient'|'product'>('none');
  const [productSearch, setProductSearch] = useState('');

  const load = useCallback(async () => {
    const [gRes, oRes, pRes, iRes, lRes] = await Promise.all([
      supabase.from('modifier_groups').select('*').order('sort_order'),
      supabase.from('modifier_options').select('*').order('sort_order'),
      supabase.from('products').select('id, name').eq('active', true).order('name'),
      supabase.from('ingredients').select('id, name, unit').eq('active', true).order('name'),
      supabase.from('product_modifier_groups').select('*'),
    ]);
    if (gRes.data) setGroups(gRes.data);
    if (oRes.data) setOptions(oRes.data);
    if (pRes.data) setProducts(pRes.data);
    if (iRes.data) setIngredients(iRes.data);
    if (lRes.data) {
      const map: Record<string, string[]> = {};
      lRes.data.forEach((l: any) => {
        if (!map[l.group_id]) map[l.group_id] = [];
        map[l.group_id].push(l.product_id);
      });
      setLinkedProducts(map);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groupOptions = selectedGroup ? options.filter(o => o.group_id === selectedGroup.id) : [];
  const groupLinked = selectedGroup ? (linkedProducts[selectedGroup.id] || []) : [];

  const addGroup = async () => {
    if (!gName.trim()) return;
    await supabase.from('modifier_groups').insert({
      name: gName.trim(), type: gType, required: gRequired,
      min_select: gRequired ? 1 : 0, max_select: parseInt(gMax) || 1,
      sort_order: groups.length + 1,
    });
    setGName(''); setShowAddGroup(false); load();
  };

  const deleteGroup = (g: Group) => {
    const ok = typeof window !== 'undefined' ? window.confirm('¿Eliminar grupo "' + g.name + '" y todas sus opciones?') : true;
    if (!ok) return;
    supabase.from('modifier_groups').delete().eq('id', g.id).then(() => {
      if (selectedGroup?.id === g.id) setSelectedGroup(null);
      load();
    });
  };

  const addOption = async () => {
    if (!oName.trim() || !selectedGroup) return;
    await supabase.from('modifier_options').insert({
      group_id: selectedGroup.id, name: oName.trim(),
      price_adjust: parseInt(oPrice) || 0,
      ingredient_id: oLinkType === 'ingredient' ? oIngredientId : null,
      product_id: oLinkType === 'product' ? oProductId : null,
      sort_order: groupOptions.length + 1,
    });
    setOName(''); setOPrice('0'); setOLinkType('none'); setOIngredientId(null); setOProductId(null); setOLinkSearch(''); setShowAddOption(false); load();
  };

  const deleteOption = async (o: Option) => {
    await supabase.from('modifier_options').delete().eq('id', o.id);
    load();
  };

  const toggleProduct = async (productId: string) => {
    if (!selectedGroup) return;
    const isLinked = groupLinked.includes(productId);
    if (isLinked) {
      await supabase.from('product_modifier_groups').delete()
        .eq('product_id', productId).eq('group_id', selectedGroup.id);
    } else {
      await supabase.from('product_modifier_groups').insert({
        product_id: productId, group_id: selectedGroup.id,
      });
    }
    load();
  };

  const filteredProducts = products.filter(p =>
    !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const S = {
    container: { flex: 1, backgroundColor: COLORS.background } as any,
    header: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
    title: { fontSize: 20, fontWeight: '700' as const, color: COLORS.text },
    body: { flex: 1, flexDirection: 'row' as const },
    panel: { flex: 1, borderRightWidth: 1, borderRightColor: COLORS.border },
    panelTitle: { fontSize: 14, fontWeight: '700' as const, color: COLORS.textSecondary, padding: 12, textTransform: 'uppercase' as const, letterSpacing: 1 },
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8 },
    rowActive: { backgroundColor: COLORS.primary + '15' },
    rowName: { fontSize: 14, fontWeight: '600' as const, color: COLORS.text, flex: 1 },
    rowSub: { fontSize: 11, color: COLORS.textMuted },
    badge: { fontSize: 10, fontWeight: '700' as const, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' as const },
    btn: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
    btnT: { color: '#fff', fontWeight: '700' as const, fontSize: 13 },
    btnSm: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: COLORS.border },
    btnDanger: { backgroundColor: COLORS.error },
    input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text },
    form: { padding: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8 },
    label: { fontSize: 12, fontWeight: '600' as const, color: COLORS.textSecondary },
    formRow: { flexDirection: 'row' as const, gap: 8, alignItems: 'center' as const, flexWrap: 'wrap' as const },
  };

  return (
    <View style={S.container}>
      <View style={S.header}>
        <Text style={S.title}>Modificadores</Text>
        <TouchableOpacity style={S.btn} onPress={() => setShowAddGroup(!showAddGroup)}>
          <Text style={S.btnT}>{showAddGroup ? '✕' : '+ Grupo'}</Text>
        </TouchableOpacity>
      </View>

      {showAddGroup && (
        <View style={S.form}>
          <TextInput style={S.input} placeholder="Nombre del grupo (ej: Sabor Mojito)" placeholderTextColor={COLORS.textMuted} value={gName} onChangeText={setGName} />
          <View style={S.formRow}>
            <TouchableOpacity style={[S.btnSm, gType === 'single' && { backgroundColor: COLORS.primary }]} onPress={() => setGType('single')}>
              <Text style={{ color: gType === 'single' ? '#fff' : COLORS.text, fontSize: 12, fontWeight: '600' }}>Elegir 1</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[S.btnSm, gType === 'multi' && { backgroundColor: COLORS.primary }]} onPress={() => setGType('multi')}>
              <Text style={{ color: gType === 'multi' ? '#fff' : COLORS.text, fontSize: 12, fontWeight: '600' }}>Elegir varios</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={S.label}>Obligatorio</Text>
              <Switch value={gRequired} onValueChange={setGRequired} />
            </View>
            {gType === 'multi' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={S.label}>Máx:</Text>
                <TextInput style={[S.input, { width: 50, paddingVertical: 4, textAlign: 'center' }]} value={gMax} onChangeText={setGMax} keyboardType="number-pad" />
              </View>
            )}
          </View>
          <TouchableOpacity style={S.btn} onPress={addGroup}>
            <Text style={S.btnT}>Crear Grupo</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={S.body}>
        {/* Groups list */}
        <ScrollView style={S.panel}>
          <Text style={S.panelTitle}>Grupos</Text>
          {groups.map(g => (
            <TouchableOpacity key={g.id} style={[S.row, selectedGroup?.id === g.id && S.rowActive]} onPress={() => { setSelectedGroup(g); setShowAddOption(false); setShowLinkProduct(false); }}>
              <View style={{ flex: 1 }}>
                <Text style={S.rowName}>{g.name}</Text>
                <Text style={S.rowSub}>
                  {g.type === 'single' ? 'Elegir 1' : 'Elegir hasta ' + g.max_select} · {g.required ? 'Obligatorio' : 'Opcional'} · {options.filter(o => o.group_id === g.id).length} opciones · {(linkedProducts[g.id] || []).length} productos
                </Text>
              </View>
              <TouchableOpacity onPress={() => deleteGroup(g)}>
                <Text style={{ color: COLORS.error, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
          {groups.length === 0 && <Text style={{ color: COLORS.textMuted, textAlign: 'center', padding: 40 }}>Crea tu primer grupo de modificadores</Text>}
        </ScrollView>

        {/* Options + Products */}
        <ScrollView style={[S.panel, { borderRightWidth: 0 }]}>
          {selectedGroup ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 12 }}>
                <Text style={S.panelTitle}>Opciones de "{selectedGroup.name}"</Text>
                <TouchableOpacity style={S.btn} onPress={() => { setShowAddOption(!showAddOption); setShowLinkProduct(false); }}>
                  <Text style={S.btnT}>{showAddOption ? '✕' : '+ Opción'}</Text>
                </TouchableOpacity>
              </View>

              {showAddOption && (
                <View style={S.form}>
                  <TextInput style={S.input} placeholder="Nombre (ej: Maracuyá)" placeholderTextColor={COLORS.textMuted} value={oName} onChangeText={setOName} />
                  <View style={S.formRow}>
                    <Text style={S.label}>Ajuste precio $:</Text>
                    <TextInput style={[S.input, { width: 80, textAlign: 'center' }]} value={oPrice} onChangeText={setOPrice} keyboardType="number-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} />
                  </View>
                  <View style={S.formRow}>
                    <Text style={S.label}>Vincular a:</Text>
                    {(['none', 'ingredient', 'product'] as const).map(t => (
                      <TouchableOpacity key={t} style={[S.btnSm, oLinkType === t && { backgroundColor: COLORS.primary }]} onPress={() => { setOLinkType(t); setOIngredientId(null); setOProductId(null); setOLinkSearch(''); }}>
                        <Text style={{ color: oLinkType === t ? '#fff' : COLORS.text, fontSize: 11, fontWeight: '600' }}>{t === 'none' ? 'Ninguno' : t === 'ingredient' ? 'Ingrediente' : 'Producto'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {oLinkType !== 'none' && (
                    <View>
                      <TextInput style={S.input} placeholder={'Buscar ' + (oLinkType === 'ingredient' ? 'ingrediente' : 'producto') + '...'} placeholderTextColor={COLORS.textMuted} value={oLinkSearch} onChangeText={setOLinkSearch} />
                      <ScrollView style={{ maxHeight: 120 }}>
                        {(oLinkType === 'ingredient'
                          ? ingredients.filter(i => !oLinkSearch || i.name.toLowerCase().includes(oLinkSearch.toLowerCase()))
                          : products.filter(p => !oLinkSearch || p.name.toLowerCase().includes(oLinkSearch.toLowerCase()))
                        ).slice(0, 15).map((item: any) => {
                          const selected = oLinkType === 'ingredient' ? oIngredientId === item.id : oProductId === item.id;
                          return (
                            <TouchableOpacity key={item.id} style={[S.row, selected && { backgroundColor: COLORS.success + '15' }]} onPress={() => { oLinkType === 'ingredient' ? setOIngredientId(item.id) : setOProductId(item.id); }}>
                              <Text style={{ fontSize: 14 }}>{selected ? '✅' : '⬜'}</Text>
                              <Text style={S.rowName}>{item.name}{item.unit ? ` (${item.unit})` : ''}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                  <TouchableOpacity style={S.btn} onPress={addOption}>
                    <Text style={S.btnT}>Agregar Opción</Text>
                  </TouchableOpacity>
                </View>
              )}

              {groupOptions.map(o => {
                const linkedIng = o.ingredient_id ? ingredients.find(i => i.id === o.ingredient_id) : null;
                const linkedProd = o.product_id ? products.find(p => p.id === o.product_id) : null;
                return (
                  <View key={o.id} style={S.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={S.rowName}>{o.name}</Text>
                      {linkedIng && <Text style={S.rowSub}>📦 {linkedIng.name} ({linkedIng.unit})</Text>}
                      {linkedProd && <Text style={S.rowSub}>🍽️ {linkedProd.name}</Text>}
                    </View>
                    {o.price_adjust !== 0 && (
                      <Text style={[S.badge, { backgroundColor: o.price_adjust > 0 ? COLORS.warning + '20' : COLORS.success + '20', color: o.price_adjust > 0 ? COLORS.warning : COLORS.success }]}>{fmt(o.price_adjust)}</Text>
                    )}
                    <TouchableOpacity onPress={() => deleteOption(o)}>
                      <Text style={{ color: COLORS.error, fontSize: 14 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              {groupOptions.length === 0 && !showAddOption && <Text style={{ color: COLORS.textMuted, textAlign: 'center', padding: 20 }}>Agrega opciones a este grupo</Text>}

              {/* Link products */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 12, marginTop: 8 }}>
                <Text style={S.panelTitle}>Productos vinculados</Text>
                <TouchableOpacity style={S.btn} onPress={() => { setShowLinkProduct(!showLinkProduct); setShowAddOption(false); }}>
                  <Text style={S.btnT}>{showLinkProduct ? '✕' : '+ Vincular'}</Text>
                </TouchableOpacity>
              </View>

              {showLinkProduct && (
                <View style={S.form}>
                  <TextInput style={S.input} placeholder="Buscar producto..." placeholderTextColor={COLORS.textMuted} value={productSearch} onChangeText={setProductSearch} />
                  <ScrollView style={{ maxHeight: 200 }}>
                    {filteredProducts.map(p => {
                      const isLinked = groupLinked.includes(p.id);
                      return (
                        <TouchableOpacity key={p.id} style={[S.row, isLinked && { backgroundColor: COLORS.success + '10' }]} onPress={() => toggleProduct(p.id)}>
                          <Text style={{ fontSize: 16 }}>{isLinked ? '✅' : '⬜'}</Text>
                          <Text style={S.rowName}>{p.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {groupLinked.length > 0 && !showLinkProduct && (
                <View>
                  {groupLinked.map(pid => {
                    const p = products.find(x => x.id === pid);
                    return p ? (
                      <View key={pid} style={S.row}>
                        <Text style={S.rowName}>{p.name}</Text>
                        <TouchableOpacity onPress={() => toggleProduct(pid)}>
                          <Text style={{ color: COLORS.error, fontSize: 12 }}>Desvincular</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null;
                  })}
                </View>
              )}
            </>
          ) : (
            <View style={{ justifyContent: 'center', alignItems: 'center', padding: 60 }}>
              <Text style={{ fontSize: 40 }}>🎛️</Text>
              <Text style={{ color: COLORS.textMuted, marginTop: 8 }}>Selecciona un grupo</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
