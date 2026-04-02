import React, { useState, useEffect, useCallback } from 'react';
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

  const load = useCallback(async () => {
    const [gR, oR, pR, lR] = await Promise.all([
      supabase.from('modifier_groups').select('*').order('sort_order'),
      supabase.from('modifier_options').select('*').order('sort_order'),
      supabase.from('products').select('id, name').eq('active', true).order('name'),
      supabase.from('product_modifier_groups').select('*'),
    ]);
    if (gR.data) setGroups(gR.data);
    if (oR.data) setOptions(oR.data);
    if (pR.data) setProducts(pR.data);
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
    const { data } = await supabase.from('modifier_groups').insert({
      name: gName.trim(), type: gType, required: gRequired,
      min_select: gRequired ? 1 : 0, max_select: parseInt(gMax) || 1,
      sort_order: groups.length + 1,
    }).select('*').single();
    if (data) { setSelected(data); setAddingGroup(false); setGName(''); }
    await load();
  };

  const deleteGroup = async (g: Group) => {
    const ok = typeof window !== 'undefined' ? window.confirm('¿Eliminar "' + g.name + '"?') : true;
    if (!ok) return;
    await supabase.from('modifier_groups').delete().eq('id', g.id);
    if (selected?.id === g.id) setSelected(null);
    await load();
  };

  const addOption = async () => {
    if (!oName.trim() || !selected) return;
    await supabase.from('modifier_options').insert({
      group_id: selected.id, name: oName.trim(),
      price_adjust: parseInt(oPrice) || 0, sort_order: groupOptions.length + 1,
    });
    setOName(''); setOPrice('0');
    await load();
  };

  const deleteOption = async (o: Option) => {
    await supabase.from('modifier_options').delete().eq('id', o.id);
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
        <ScrollView>
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
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 4 }}>{selected.name}</Text>
            <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
              {selected.type === 'single' ? 'Elegir 1' : `Elegir hasta ${selected.max_select}`} · {selected.required ? 'Obligatorio' : 'Opcional'}
            </Text>

            {/* Options */}
            <Text style={st.sectionTitle}>OPCIONES ({groupOptions.length})</Text>
            {groupOptions.map(o => (
              <View key={o.id} style={st.optionRow}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text }}>{o.name}</Text>
                {o.price_adjust !== 0 && <Text style={{ fontSize: 12, fontWeight: '700', color: o.price_adjust > 0 ? COLORS.warning : COLORS.success }}>{fmt(o.price_adjust)}</Text>}
                <TouchableOpacity onPress={() => deleteOption(o)} style={{ marginLeft: 8 }}><Text style={{ color: COLORS.error, fontSize: 14 }}>✕</Text></TouchableOpacity>
              </View>
            ))}

            {/* Add option inline */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 2 }}>Nombre</Text>
                <TextInput style={st.input} placeholder="Ej: Maracuyá" placeholderTextColor={COLORS.textMuted} value={oName} onChangeText={setOName} />
              </View>
              <View style={{ width: 80 }}>
                <Text style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 2 }}>Precio +/-</Text>
                <TextInput style={st.input} value={oPrice} onChangeText={setOPrice} keyboardType="number-pad" />
              </View>
              <TouchableOpacity style={[st.newBtn, { paddingVertical: 10 }]} onPress={addOption}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>+ Agregar</Text>
              </TouchableOpacity>
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
  side: { width: 260, backgroundColor: '#3C3C3C' },
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
