import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Dimensions } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

export default function PedidosScreen() {
  const [winW, setWinW] = useState(Dimensions.get('window').width);
  useEffect(() => { const sub = Dimensions.addEventListener('change', ({ window }) => setWinW(window.width)); return () => sub?.remove(); }, []);
  const isMobile = winW < 700;

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [selectedSup, setSelectedSup] = useState<any>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const [{ data: s }, { data: i }] = await Promise.all([
      supabase.from('suppliers').select('*').eq('active', true).order('name'),
      supabase.from('ingredients').select('*').eq('active', true).order('name'),
    ]);
    if (s) setSuppliers(s);
    if (i) setIngredients(i);
  }, []);

  useEffect(() => { load(); }, [load]);

  const supIngredients = selectedSup
    ? ingredients.filter(i => i.default_supplier_id === selectedSup.id)
    : [];

  const filtered = supIngredients.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));

  const setQty = (id: string, val: string) => {
    setQuantities(prev => ({ ...prev, [id]: val }));
  };

  const totalItems = Object.entries(quantities).filter(([id, q]) => parseFloat(q) > 0 && supIngredients.some(i => i.id === id)).length;
  const totalCost = Object.entries(quantities).reduce((acc, [id, q]) => {
    const qty = parseFloat(q) || 0;
    const ing = ingredients.find(i => i.id === id);
    return acc + (ing ? ing.cost_per_unit * qty : 0);
  }, 0);

  const generateOrder = () => {
    const lines = supIngredients
      .filter(i => parseFloat(quantities[i.id] || '0') > 0)
      .map(i => {
        const qty = parseFloat(quantities[i.id] || '0');
        return `${i.name}: ${qty} ${i.unit} (${fmt(i.cost_per_unit * qty)})`;
      });
    if (lines.length === 0) {
      typeof window !== 'undefined' && window.alert('Agrega cantidades primero');
      return;
    }
    const text = `PEDIDO — ${selectedSup.name}\n${new Date().toLocaleDateString('es-CL')}\n\n${lines.join('\n')}\n\nTOTAL ESTIMADO: ${fmt(totalCost)}`;
    if (typeof window !== 'undefined') {
      navigator.clipboard?.writeText(text).then(() => window.alert('Pedido copiado al portapapeles')).catch(() => window.alert(text));
    }
  };

  const fillMinStock = () => {
    const newQty: Record<string, string> = { ...quantities };
    supIngredients.forEach(i => {
      if (i.stock_min > 0 && i.stock_current < i.stock_min) {
        const needed = i.stock_min - i.stock_current;
        newQty[i.id] = String(Math.ceil(needed));
      }
    });
    setQuantities(newQty);
  };

  const clearAll = () => setQuantities({});

  return (
    <View style={st.wrap}>
      {/* Sidebar proveedores */}
      {isMobile ? (
        <View style={{ backgroundColor: '#3C3C3C', padding: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 8 }}>Pedidos a Proveedores</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {suppliers.map(s => {
              const isActive = selectedSup?.id === s.id;
              const ingCount = ingredients.filter(i => i.default_supplier_id === s.id).length;
              return (
                <TouchableOpacity key={s.id} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: isActive ? COLORS.primary : '#4A4A4A', marginRight: 6 }} onPress={() => { setSelectedSup(s); setSearch(''); }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isActive ? '#fff' : '#CCC' }} numberOfLines={1}>{s.name}</Text>
                  <Text style={{ fontSize: 10, color: isActive ? '#ffffffaa' : '#888' }}>{ingCount} items</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <View style={st.side}>
          <View style={st.sideHdr}>
            <Text style={st.sideTitle}>Pedidos</Text>
          </View>
          <ScrollView>
            {suppliers.map(s => {
              const isActive = selectedSup?.id === s.id;
              const ingCount = ingredients.filter(i => i.default_supplier_id === s.id).length;
              const lowCount = ingredients.filter(i => i.default_supplier_id === s.id && i.stock_min > 0 && i.stock_current <= i.stock_min).length;
              return (
                <TouchableOpacity key={s.id} style={[st.sideItem, isActive && st.sideItemActive]} onPress={() => { setSelectedSup(s); setSearch(''); }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.sideItemT, isActive && st.sideItemTA]}>{s.name}</Text>
                    <Text style={{ fontSize: 10, color: isActive ? '#ffffffaa' : '#888' }}>
                      {ingCount} ingredientes{lowCount > 0 ? ` · ${lowCount} bajo stock` : ''}
                    </Text>
                  </View>
                  {lowCount > 0 && !isActive && (
                    <View style={{ backgroundColor: '#E53935', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{lowCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Contenido */}
      <View style={{ flex: 1 }}>
        {selectedSup ? (
          <>
            {/* Header */}
            <View style={{ padding: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: isMobile ? 16 : 20, fontWeight: '800', color: COLORS.text }}>{selectedSup.name}</Text>
                  {selectedSup.phone && <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{selectedSup.phone}{selectedSup.email ? ' · ' + selectedSup.email : ''}</Text>}
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={{ backgroundColor: '#42A5F5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }} onPress={fillMinStock}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>Llenar mínimos</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ backgroundColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }} onPress={clearAll}>
                    <Text style={{ color: COLORS.textSecondary, fontWeight: '700', fontSize: 11 }}>Limpiar</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Resumen */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, backgroundColor: COLORS.background, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted }}>INGREDIENTES</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>{supIngredients.length}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: COLORS.background, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted }}>EN PEDIDO</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: totalItems > 0 ? COLORS.primary : COLORS.text }}>{totalItems}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: COLORS.background, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted }}>TOTAL EST.</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: totalCost > 0 ? COLORS.primary : COLORS.text }}>{fmt(totalCost)}</Text>
                </View>
              </View>
            </View>

            {/* Buscar */}
            <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: COLORS.textMuted }}>🔍</Text>
                <TextInput style={{ flex: 1, fontSize: 13, color: COLORS.text, marginLeft: 6 }} placeholder="Buscar ingrediente..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} />
              </View>
            </View>

            {/* Tabla */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FAFAFA', borderBottomWidth: 2, borderBottomColor: COLORS.border }}>
              <Text style={[st.th, { flex: 1 }]}>Ingrediente</Text>
              {!isMobile && <Text style={[st.th, { width: 60, textAlign: 'center' }]}>Unidad</Text>}
              <Text style={[st.th, { width: isMobile ? 50 : 70, textAlign: 'right' }]}>Stock</Text>
              {!isMobile && <Text style={[st.th, { width: 50, textAlign: 'right' }]}>Mín.</Text>}
              <Text style={[st.th, { width: isMobile ? 60 : 80, textAlign: 'right' }]}>Costo</Text>
              <Text style={[st.th, { width: isMobile ? 70 : 90, textAlign: 'center' }]}>Cantidad</Text>
              {!isMobile && <Text style={[st.th, { width: 80, textAlign: 'right' }]}>Subtotal</Text>}
            </View>
            <ScrollView>
              {filtered.map((i, idx) => {
                const isLow = i.stock_min > 0 && i.stock_current <= i.stock_min;
                const qty = parseFloat(quantities[i.id] || '0') || 0;
                const sub = qty * (i.cost_per_unit || 0);
                return (
                  <View key={i.id} style={[st.row, idx % 2 === 0 && { backgroundColor: COLORS.card + '40' }, qty > 0 && { backgroundColor: '#05966910' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }} numberOfLines={1}>{i.name}</Text>
                      {isMobile && <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{i.unit}{i.stock_min > 0 ? ` · mín ${i.stock_min}` : ''}</Text>}
                    </View>
                    {!isMobile && <Text style={{ width: 60, fontSize: 11, textAlign: 'center', color: COLORS.textSecondary }}>{i.unit}</Text>}
                    <Text style={{ width: isMobile ? 50 : 70, fontSize: 12, fontWeight: '600', textAlign: 'right', color: isLow ? '#E53935' : COLORS.text }}>
                      {Math.round(i.stock_current)}
                    </Text>
                    {!isMobile && (
                      <Text style={{ width: 50, fontSize: 11, textAlign: 'right', color: i.stock_min > 0 ? COLORS.textSecondary : COLORS.textMuted }}>
                        {i.stock_min > 0 ? Math.round(i.stock_min) : '-'}
                      </Text>
                    )}
                    <Text style={{ width: isMobile ? 60 : 80, fontSize: 12, textAlign: 'right', fontWeight: '600', color: COLORS.primary }}>
                      {fmt(i.cost_per_unit)}
                    </Text>
                    <View style={{ width: isMobile ? 70 : 90, alignItems: 'center' }}>
                      <TextInput
                        style={[st.qtyInput, qty > 0 && { borderColor: COLORS.primary, backgroundColor: '#05966910' }]}
                        value={quantities[i.id] || ''}
                        onChangeText={v => setQty(i.id, v)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>
                    {!isMobile && (
                      <Text style={{ width: 80, fontSize: 12, fontWeight: '700', textAlign: 'right', color: sub > 0 ? COLORS.text : COLORS.textMuted }}>
                        {sub > 0 ? fmt(sub) : '-'}
                      </Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            {/* Footer con botón generar */}
            {totalItems > 0 && (
              <View style={{ flexDirection: 'row', padding: 12, backgroundColor: COLORS.card, borderTopWidth: 2, borderTopColor: COLORS.primary, alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>{totalItems} items · Total estimado:</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.primary }}>{fmt(totalCost)}</Text>
                </View>
                <TouchableOpacity style={{ backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }} onPress={generateOrder}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>📋 Copiar Pedido</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 40 }}>📦</Text>
            <Text style={{ color: COLORS.textMuted, marginTop: 8, fontSize: 14 }}>Selecciona un proveedor para armar el pedido</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.background },
  side: { width: 240, backgroundColor: '#3C3C3C' },
  sideHdr: { padding: 14 },
  sideTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  sideItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#4A4A4A', flexDirection: 'row', alignItems: 'center' },
  sideItemActive: { backgroundColor: COLORS.primary },
  sideItemT: { fontSize: 13, color: '#CCC' },
  sideItemTA: { color: '#fff', fontWeight: '700' },
  th: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  row: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' },
  qtyInput: { backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 14, fontWeight: '700', color: COLORS.text, textAlign: 'center', width: 60 },
});
