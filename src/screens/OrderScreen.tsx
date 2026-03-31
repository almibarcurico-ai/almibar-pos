// src/screens/OrderScreen.tsx
// v9 - Fudo-style: inline ADICIONAR panel with search dropdown

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { printOrder, generateBoleta, sendToPrinter, PRINTER_CONFIG } from '../lib/printService';
import { useAuth } from '../contexts/AuthContext';
import { TableWithOrder, Category, Product, OrderItem, Order } from '../types';
import { COLORS } from '../theme';

const { width } = Dimensions.get('window');

// Click sound for POS
let _audioCtx: any = null;
function playClickPOS() {
  try {
    if (typeof window === 'undefined') return;
    if (!_audioCtx) _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain); gain.connect(_audioCtx.destination);
    osc.frequency.value = 600; osc.type = 'sine';
    gain.gain.setValueAtTime(0.012, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.03);
    osc.start(_audioCtx.currentTime); osc.stop(_audioCtx.currentTime + 0.03);
  } catch (e) {}
}

interface ModOption { id: string; name: string; price_adjust: number; }
interface ModGroup { id: string; name: string; type: string; required: boolean; max_select: number; options: ModOption[]; }
interface CartItem { id: string; product: Product; quantity: number; notes: string; modifiers: ModOption[]; }
interface Props { table: TableWithOrder; onBack: () => void; }

export default function OrderScreen({ table, onBack }: Props) {
  const { user } = useAuth();

  // Intercept browser back button
  useEffect(() => {
    const handlePop = (e: PopStateEvent) => { e.preventDefault(); onBack(); };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [onBack]);

  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [waiterName, setWaiterName] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editQty, setEditQty] = useState(1);
  const [preCuentaModal, setPreCuentaModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [printers, setPrinters] = useState<any[]>([]);
  const [categoryPrinters, setCategoryPrinters] = useState<any[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>('efectivo');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [tipPercent, setTipPercent] = useState(10);
  const [tipCustom, setTipCustom] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [payMode, setPayMode] = useState<'full'|'partial'>('full');
  const [paySelectedModal, setPaySelectedModal] = useState(false);
  // Discount
  const [discountType, setDiscountType] = useState<'none'|'percent'|'fixed'>('none');
  const [discountValue, setDiscountValue] = useState('');
  // Multi-method payment - Fudo style
  const [tipEntries, setTipEntries] = useState<{method:string;amount:string}[]>([]);
  const [payEntries, setPayEntries] = useState<{method:string;amount:string}[]>([]);

  const loadPrinters = async () => {
    const { data: p } = await supabase.from('printers').select('*').eq('active', true);
    const { data: cp } = await supabase.from('category_printer').select('*');
    if (p) setPrinters(p);
    if (cp) setCategoryPrinters(cp);
  };

  useEffect(() => { loadPrinters(); }, []);

  useEffect(() => { loadAll(); const c = setupRT(); return c; }, []);
  const loadAll = async () => { await Promise.all([loadOrder(), loadMenu()]); setLoading(false); };
  const loadOrder = async () => {
    if (!table.current_order_id) return;
    const { data: o } = await supabase.from('orders').select('*').eq('id', table.current_order_id).single();
    if (o) { setOrder(o); const { data: w } = await supabase.from('users').select('name').eq('id', o.waiter_id).single(); if (w) setWaiterName(w.name); }
    const { data: items } = await supabase.from('order_items').select('*, product:product_id(*), creator:created_by(name, role)').eq('order_id', table.current_order_id).order('created_at');
    if (items) setOrderItems(items);
  };
  const loadMenu = async () => {
    const { data: c } = await supabase.from('categories').select('*').eq('active', true).order('sort_order');
    const { data: p } = await supabase.from('products').select('*').eq('active', true).order('sort_order');
    if (c) setCategories(c); if (p) setProducts(p);
    // Load modifier groups per product
    const { data: pmg } = await supabase.from('product_modifier_groups').select('product_id, group_id');
    const { data: mg } = await supabase.from('modifier_groups').select('*').eq('active', true).order('sort_order');
    const { data: mo } = await supabase.from('modifier_options').select('*').eq('active', true).order('sort_order');
    if (pmg && mg && mo) {
      const map: Record<string, ModGroup[]> = {};
      pmg.forEach((link: any) => {
        const group = mg.find((g: any) => g.id === link.group_id);
        if (!group) return;
        const opts = mo.filter((o: any) => o.group_id === group.id).map((o: any) => ({ id: o.id, name: o.name, price_adjust: o.price_adjust }));
        if (!map[link.product_id]) map[link.product_id] = [];
        map[link.product_id].push({ id: group.id, name: group.name, type: group.type, required: group.required, max_select: group.max_select, options: opts });
      });
      setProductModGroups(map);
    }
  };
  const setupRT = () => {
    const ch = supabase.channel(`ord-${table.current_order_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${table.current_order_id}` }, () => loadOrder())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${table.current_order_id}` }, () => loadOrder())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  };

  const fmt = (p: number) => '$' + p.toLocaleString('es-CL');
  const pending = orderItems.filter(i => !i.printed);
  const sent = orderItems.filter(i => i.printed);
  const cartTotal = cart.reduce((s, c) => s + (c.product.price + (c.modifiers || []).reduce((a: number, m: any) => a + m.price_adjust, 0)) * c.quantity, 0);
  const searchResults = searchQuery.length >= 1 ? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 8) : [];
  const recentProducts = products.slice(0, 6);
  const [productModGroups, setProductModGroups] = useState<Record<string, ModGroup[]>>({});
  const [modPickerProduct, setModPickerProduct] = useState<Product | null>(null);
  const [modPickerSelections, setModPickerSelections] = useState<Record<string, ModOption[]>>({});

  // Enviar producto directo a cocina (sin carrito)
  const sendItemDirect = async (product: Product, modifiers: ModOption[] = [], notes: string = '') => {
    if (!order || !user) return;
    try {
      const modAdjust = modifiers.reduce((s, m) => s + m.price_adjust, 0);
      const modNames = modifiers.length > 0 ? modifiers.map(m => m.name).join(', ') : '';
      const item = { order_id: order.id, product_id: product.id, quantity: 1, unit_price: product.price + modAdjust, total_price: (product.price + modAdjust) * 1, notes: [notes, modNames].filter(Boolean).join(' | ') || null, status: 'pendiente', printed: false, created_by: user.id };
      const { data: inserted, error } = await supabase.from('order_items').insert(item).select('id').single();
      if (error) throw error;
      if (modifiers.length > 0 && inserted) {
        await supabase.from('order_item_modifiers').insert(modifiers.map(m => ({ order_item_id: inserted.id, option_id: m.id, option_name: m.name, price_adjust: m.price_adjust })));
      }
      const { error: re } = await supabase.rpc('send_order_and_deduct_stock', { p_item_ids: [inserted.id] });
      if (re) throw re;
      playClickPOS(); await loadOrder();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const addToCart = (product: Product) => {
    playClickPOS();
    const groups = productModGroups[product.id];
    if (groups && groups.length > 0) {
      setModPickerProduct(product);
      setModPickerSelections({});
      setSearchQuery(''); setShowDropdown(false);
      return;
    }
    // Enviar directo sin carrito
    sendItemDirect(product);
    setSearchQuery(''); setShowDropdown(false);
  };

  const confirmModifiers = () => {
    if (!modPickerProduct) return;
    const groups = productModGroups[modPickerProduct.id] || [];
    for (const g of groups) {
      if (g.required && !(modPickerSelections[g.id]?.length > 0)) {
        const ok = typeof window !== 'undefined' ? window.confirm('Debes elegir: ' + g.name) : true;
        return;
      }
    }
    const allMods = Object.values(modPickerSelections).flat();
    sendItemDirect(modPickerProduct, allMods);
    setModPickerProduct(null);
  };

  const toggleModOption = (groupId: string, option: ModOption, type: string) => {
    setModPickerSelections(prev => {
      const current = prev[groupId] || [];
      if (type === 'single') return { ...prev, [groupId]: [option] };
      const exists = current.find(o => o.id === option.id);
      if (exists) return { ...prev, [groupId]: current.filter(o => o.id !== option.id) };
      return { ...prev, [groupId]: [...current, option] };
    });
  };
  const removeFromCart = (id: string) => setCart(prev => prev.filter(c => c.id !== id));
  const updateCartQty = (id: string, d: number) => setCart(prev => prev.map(c => c.id !== id ? c : { ...c, quantity: Math.max(1, c.quantity + d) }));
  const openEditCartItem = (ci: CartItem) => { setEditingCartItem(ci); setEditQty(ci.quantity); setEditNotes(ci.notes); };
  const confirmEditCartItem = () => { if (editingCartItem) setCart(prev => prev.map(c => c.id === editingCartItem.id ? { ...c, quantity: editQty, notes: editNotes } : c)); setEditingCartItem(null); };

  const sendCartToKitchen = async () => {
    if (!order || !user || cart.length === 0) return;
    try {
      const items = cart.map(c => {
        const modAdjust = c.modifiers.reduce((s, m) => s + m.price_adjust, 0);
        const modNames = c.modifiers.length > 0 ? c.modifiers.map(m => m.name).join(', ') : '';
        return { order_id: order.id, product_id: c.product.id, quantity: c.quantity, unit_price: c.product.price + modAdjust, total_price: (c.product.price + modAdjust) * c.quantity, notes: [c.notes, modNames].filter(Boolean).join(' | ') || null, status: 'pendiente', printed: false, created_by: user.id };
      });
      const { data: inserted, error } = await supabase.from('order_items').insert(items).select('id');
      if (error) throw error;
      const ids = (inserted || []).map((i: any) => i.id);
      // Save modifier details
      for (let i = 0; i < cart.length; i++) {
        if (cart[i].modifiers.length > 0 && inserted && inserted[i]) {
          await supabase.from('order_item_modifiers').insert(cart[i].modifiers.map(m => ({ order_item_id: inserted[i].id, option_id: m.id, option_name: m.name, price_adjust: m.price_adjust })));
        }
      }
      if (ids.length > 0) { const { error: re } = await supabase.rpc('send_order_and_deduct_stock', { p_item_ids: ids }); if (re) throw re; }
      // Print to kitchen/bar
      try {
        await printOrder({
          table: table.number, waiter: user.name, orderNumber: order.order_number,
          items: cart.map(ci => ({ name: ci.product.name, qty: ci.quantity, category_id: ci.product.category_id, modifiers: ci.modifiers.map(m => m.name), notes: ci.notes || undefined })),
          printers, categoryPrinters,
        });
      } catch (e) { console.log('Print error:', e); }
      setCart([]); playClickPOS(); await loadOrder();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const cancelCart = () => { if (cart.length === 0) return; Alert.alert('Cancelar', '¿Descartar?', [{ text: 'No' }, { text: 'Sí', style: 'destructive', onPress: () => setCart([]) }]); };
  const sendOrder = async () => {
    if (pending.length === 0) return;
    const { error } = await supabase.rpc('send_order_and_deduct_stock', { p_item_ids: pending.map(i => i.id) });
    if (error) { Alert.alert('Error', error.message); return; }
    playClickPOS(); await loadOrder();
  };
  const removeItem = async (item: OrderItem) => {
    if (!user || !order) return;
    if (user.role === 'garzon' && item.printed) { Alert.alert('No permitido'); return; }
    await supabase.from('order_items').delete().eq('id', item.id); await loadOrder();
  };

  // Payment
  const paidItems = orderItems.filter(i => i.paid); const unpaidItems = orderItems.filter(i => !i.paid);
  const paidTotal = paidItems.reduce((a, i) => a + i.total_price, 0);
  const unpaidSubtotal = unpaidItems.reduce((a, i) => a + i.total_price, 0);
  const discountAmount = discountType === 'percent' ? Math.round(unpaidSubtotal * (parseInt(discountValue) || 0) / 100) : discountType === 'fixed' ? (parseInt(discountValue) || 0) : 0;
  const unpaidTotal = Math.max(0, unpaidSubtotal - discountAmount);
  const selectedItems = unpaidItems.filter(i => selectedItemIds.has(i.id));
  const selectedTotal = selectedItems.reduce((a, i) => a + i.total_price, 0);
  const payableTotal = payMode === 'partial' && selectedItems.length > 0 ? selectedTotal : unpaidTotal;
  const tipAmount = tipCustom ? parseInt(tipCustom) || 0 : Math.round(payableTotal * tipPercent / 100);
  const toggleItem = (id: string) => setSelectedItemIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setSelectedItemIds(new Set(unpaidItems.map(i => i.id)));
  const deselectAll = () => setSelectedItemIds(new Set());
  const resetPayState = () => { setReceivedAmount(''); setTipPercent(10); setTipCustom(''); setSelectedItemIds(new Set()); setPayMode('full'); setTipEntries([]); setPayEntries([]); setDiscountType('none'); setDiscountValue(''); };

  const paySelected = async () => {
    if (!order || !user || selectedItems.length === 0) return;
    await supabase.from('payments').insert({ order_id: order.id, method: paymentMethod, amount: selectedTotal, tip_amount: tipAmount, created_by: user.id });
    await supabase.from('order_items').update({ paid: true }).in('id', selectedItems.map(i => i.id));
    if (unpaidItems.length === selectedItems.length) {
      await supabase.from('orders').update({ status: 'cerrada', closed_at: new Date().toISOString(), payment_method: paymentMethod, tip_amount: tipAmount }).eq('id', order.id);
      await supabase.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', table.id);
      // Update client stats if assigned
      if (order?.client_id) await supabase.rpc('update_client_stats', { p_client_id: order.client_id });
      setPaySelectedModal(false); Alert.alert('✅ Mesa cerrada'); onBack();
    } else { setPaySelectedModal(false); setPreCuentaModal(false); Alert.alert('✅ Pago parcial'); resetPayState(); await loadOrder(); }
  };
  const closeTable = async () => {
    if (!order || !user) return;
    let finalPayEntries = [...payEntries];
    const pTotal = finalPayEntries.reduce((a, e) => a + (parseInt(e.amount) || 0), 0);

    // Determine main payment method (biggest amount)
    const mainMethod = finalPayEntries.length > 0
      ? finalPayEntries.reduce((a, b) => (parseInt(a.amount) || 0) >= (parseInt(b.amount) || 0) ? a : b).method
      : 'efectivo';

    // Tips ALWAYS follow the main payment method
    const tipTotalFromEntries = tipEntries.reduce((a, e) => a + (parseInt(e.amount) || 0), 0);
    const excess = pTotal > unpaidTotal + tipTotalFromEntries ? pTotal - unpaidTotal - tipTotalFromEntries : 0;
    const tipTotalFinal = tipTotalFromEntries + excess;
    const finalTipEntries = tipTotalFinal > 0 ? [{ method: mainMethod, amount: String(tipTotalFinal) }] : [];

    const payTotalFinal = finalPayEntries.reduce((a, e) => a + (parseInt(e.amount) || 0), 0);

    if (payTotalFinal < unpaidTotal) { Alert.alert('Error', `El pago (${fmt(payTotalFinal)}) no cubre el consumo (${fmt(unpaidTotal)})`); return; }

    for (const pe of finalPayEntries) {
      const amt = parseInt(pe.amount) || 0;
      if (amt > 0) await supabase.from('payments').insert({ order_id: order.id, method: pe.method, amount: amt, tip_amount: 0, created_by: user.id });
    }
    for (const te of finalTipEntries) {
      const amt = parseInt(te.amount) || 0;
      if (amt > 0) await supabase.from('payments').insert({ order_id: order.id, method: te.method, amount: 0, tip_amount: amt, created_by: user.id });
    }

    await supabase.from('order_items').update({ paid: true }).eq('order_id', order.id).eq('paid', false);
    await supabase.from('orders').update({ status: 'cerrada', closed_at: new Date().toISOString(), payment_method: mainMethod, tip_amount: tipTotalFinal, discount_type: discountType, discount_value: discountAmount, total: unpaidTotal }).eq('id', order.id);
    await supabase.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', table.id);

    // Imprimir boleta en Caja al cerrar mesa
    try {
      const allPayments = finalPayEntries.filter(e => (parseInt(e.amount) || 0) > 0).map(e => ({ method: e.method, amount: parseInt(e.amount) || 0 }));
      await fetch('http://localhost:3333/precuenta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: table.number, waiter: user?.name || '', items: unpaidItems.map(i => ({ name: i.product?.name || '', qty: i.quantity, price: i.unit_price, total: i.total_price })), subtotal: unpaidTotal, tip: tipTotalFinal, total: unpaidTotal + tipTotalFinal, payments: allPayments, orderNumber: order?.order_number }),
      });
    } catch (e) { console.error('Error imprimiendo boleta:', e); }

    setCloseModal(false); resetPayState();
    // Update client stats if assigned
    if (order?.client_id) await supabase.rpc('update_client_stats', { p_client_id: order.client_id });
    Alert.alert('Mesa cerrada', `Consumo: ${fmt(unpaidTotal)}${tipTotalFinal > 0 ? `\nPropina: ${fmt(tipTotalFinal)}` : ''}`);
    onBack();
  };

  // Fudo-style helpers
  const addTipEntry = () => setTipEntries(prev => [...prev, { method: 'efectivo', amount: String(Math.round(unpaidTotal * 0.1)) }]);
  const removeTipEntry = (i: number) => setTipEntries(prev => prev.filter((_, idx) => idx !== i));
  const updateTipEntry = (i: number, field: string, val: string) => setTipEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
  const addPayEntry = () => setPayEntries(prev => { const paid = prev.reduce((a, e) => a + (parseInt(e.amount) || 0), 0); const remaining = Math.max(0, unpaidTotal + tipTotal - paid); return [...prev, { method: 'efectivo', amount: String(remaining) }]; });
  const removePayEntry = (i: number) => setPayEntries(prev => prev.filter((_, idx) => idx !== i));
  const updatePayEntry = (i: number, field: string, val: string) => setPayEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
  const tipTotal = tipEntries.reduce((a, e) => a + (parseInt(e.amount) || 0), 0);
  const payTotal = payEntries.reduce((a, e) => a + (parseInt(e.amount) || 0), 0);
  const grandTotal = unpaidTotal + tipTotal;
  const totalPaid = payTotal + tipTotal;
  const vuelto = totalPaid - grandTotal;

  if (loading) return <View style={[s.c, { alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: COLORS.textSecondary }}>Cargando...</Text></View>;

  return (
    <View style={s.c}>
      {/* HEADER */}
      <View style={s.hdr}>
        <TouchableOpacity onPress={onBack}><Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>← Mesas</Text></TouchableOpacity>
        <Text style={s.hT}>MESA {table.number}</Text>
        <TouchableOpacity onPress={() => setPreCuentaModal(true)}><Text style={{ fontSize: 18 }}>🧾</Text></TouchableOpacity>
      </View>
      <View style={s.subH}><Text style={{ fontSize: 12, color: COLORS.textSecondary }}>👤 {waiterName || user?.name} • {order?.opened_at ? new Date(order.opened_at).toLocaleString('es-CL') : ''}</Text></View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* ADICIONAR */}
        <View style={s.addSec}>
          <Text style={s.addT}>ADICIONAR</Text>
          <View style={s.sRow}>
            <View style={s.plusB}><Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>+</Text></View>
            <View style={{ flex: 1, zIndex: 10 }}>
              <TextInput style={s.sInp} placeholder="Buscar producto..." placeholderTextColor={COLORS.textMuted} value={searchQuery} onChangeText={t => { setSearchQuery(t); setShowDropdown(t.length >= 1); }} onFocus={() => { if (searchQuery.length >= 1) setShowDropdown(true); }} />
              {showDropdown && searchResults.length > 0 && (
                <View style={s.dd}>{searchResults.map(p => (
                  <TouchableOpacity key={p.id} style={s.ddI} onPress={() => addToCart(p)}>
                    <Text style={{ fontSize: 14, color: COLORS.primary, flex: 1 }}>- {p.name}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{fmt(p.price)}</Text>
                  </TouchableOpacity>
                ))}</View>
              )}
            </View>
          </View>
          {cart.length === 0 && !showDropdown && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>{recentProducts.map(p => (
              <TouchableOpacity key={p.id} style={s.qChip} onPress={() => addToCart(p)}><Text style={s.qChipT} numberOfLines={1}>{p.name}</Text></TouchableOpacity>
            ))}</ScrollView>
          )}
          {cart.length > 0 && !showDropdown && (
            <View style={s.cList}>
              {cart.map(ci => (
                <View key={ci.id} style={s.cRow}>
                  <TouchableOpacity style={s.qBtn} onPress={() => { if (ci.quantity === 1) removeFromCart(ci.id); else updateCartQty(ci.id, -1); }}><Text style={s.qBtnT}>−</Text></TouchableOpacity>
                  <Text style={s.cQty}>{ci.quantity}</Text>
                  <TouchableOpacity style={s.qBtn} onPress={() => updateCartQty(ci.id, 1)}><Text style={s.qBtnT}>+</Text></TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cName} numberOfLines={1}>{ci.product.name}</Text>
                    {ci.modifiers && ci.modifiers.length > 0 && (
                      <Text style={{ fontSize: 10, color: COLORS.primary, marginTop: 1 }} numberOfLines={1}>
                        {ci.modifiers.map(m => m.name).join(', ')}
                      </Text>
                    )}
                    {ci.notes ? (
                      <Text style={{ fontSize: 10, color: COLORS.warning, marginTop: 1, fontStyle: 'italic' }} numberOfLines={1}>
                        💬 {ci.notes}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={s.cPrice}>{fmt((ci.product.price + (ci.modifiers || []).reduce((s: number, m: any) => s + m.price_adjust, 0)) * ci.quantity)}</Text>
                  <TouchableOpacity onPress={() => openEditCartItem(ci)} style={{ padding: 6, backgroundColor: ci.notes ? COLORS.warning + '30' : COLORS.border, borderRadius: 6 }}><Text style={{ fontSize: 14 }}>💬</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => removeFromCart(ci.id)} style={{ padding: 4 }}><Text style={{ fontSize: 14 }}>✕</Text></TouchableOpacity>
                </View>
              ))}
              <View style={s.cTotR}><Text style={s.cTotL}>Enviando...</Text></View>
            </View>
          )}
        </View>

        {/* PENDING */}
        {pending.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <SecH color={COLORS.warning} title={`Pendientes (${pending.length})`} />
            </View>
            {pending.map(i => <IR key={i.id} item={i} onRm={removeItem} fmt={fmt} canRm orderCreatedBy={order?.created_by} />)}
          </View>
        )}

        {/* SENT */}
        {sent.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <SecH color={COLORS.success} title={`Enviados (${sent.length})`} />
            {sent.map(i => <IR key={i.id} item={i} onRm={removeItem} fmt={fmt} canRm={user?.role !== 'garzon'} orderCreatedBy={order?.created_by} />)}
          </View>
        )}
      </ScrollView>

      {/* FOOTER */}
      <View style={s.foot}>
        <View><Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Total:</Text><Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.primary }}>{fmt(order?.total || 0)}</Text></View>
        {(user?.role === 'cajero' || user?.role === 'admin') && orderItems.length > 0 && (
          <TouchableOpacity style={s.clBtn} onPress={() => { const tip10 = Math.round(unpaidTotal * 0.1); setPayEntries([{ method: 'efectivo', amount: String(unpaidTotal + tip10) }]); setTipEntries([{ method: 'efectivo', amount: String(tip10) }]); setCloseModal(true); }}><Text style={s.clBtnT}>Cerrar mesa {table.number}</Text></TouchableOpacity>
        )}
        {orderItems.length === 0 && (
          <TouchableOpacity style={[s.clBtn, { backgroundColor: '#334155' }]} onPress={async () => {
            const ok = typeof window !== 'undefined' ? window.confirm('¿Liberar mesa ' + table.number + '?') : true;
            if (!ok) return;
            try {
              if (order?.id) {
              await supabase.from('orders').update({ status: 'cerrada', closed_at: new Date().toISOString() }).eq('id', order.id);
              if (order?.client_id) await supabase.rpc('update_client_stats', { p_client_id: order.client_id });
            }
              await supabase.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', table.id);
              onBack();
            } catch (e: any) { console.log('Error liberando mesa:', e); }
          }}><Text style={s.clBtnT}>Liberar mesa {table.number}</Text></TouchableOpacity>
        )}
      </View>

      {/* MODIFIER PICKER */}
      <Modal visible={!!modPickerProduct} transparent animationType="fade">
        <View style={s.ov}><View style={[s.md, { maxWidth: 420 }]}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 4 }}>
            {modPickerProduct?.name}
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 16 }}>
            Selecciona las opciones
          </Text>
          <ScrollView style={{ maxHeight: 400 }}>
            {modPickerProduct && (productModGroups[modPickerProduct.id] || []).map(group => (
              <View key={group.id} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>
                    {group.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>
                    {group.required ? 'Obligatorio' : 'Opcional'} · {group.type === 'single' ? 'Elige 1' : 'Hasta ' + group.max_select}
                  </Text>
                </View>
                {group.options.map(opt => {
                  const isSelected = (modPickerSelections[group.id] || []).some(o => o.id === opt.id);
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={{
                        flexDirection: 'row', alignItems: 'center', padding: 12,
                        borderWidth: 1.5, borderRadius: 10, marginBottom: 6,
                        borderColor: isSelected ? COLORS.primary : COLORS.border,
                        backgroundColor: isSelected ? COLORS.primary + '10' : COLORS.card,
                      }}
                      onPress={() => toggleModOption(group.id, opt, group.type)}
                    >
                      <View style={{
                        width: 22, height: 22, borderRadius: group.type === 'single' ? 11 : 4,
                        borderWidth: 2, borderColor: isSelected ? COLORS.primary : COLORS.textMuted,
                        backgroundColor: isSelected ? COLORS.primary : 'transparent',
                        alignItems: 'center', justifyContent: 'center', marginRight: 10,
                      }}>
                        {isSelected && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                      </View>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text }}>{opt.name}</Text>
                      {opt.price_adjust !== 0 && (
                        <Text style={{ fontSize: 12, fontWeight: '600', color: opt.price_adjust > 0 ? COLORS.warning : COLORS.success }}>
                          {opt.price_adjust > 0 ? '+' : ''}{('$' + opt.price_adjust.toLocaleString('es-CL'))}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity style={s.bC} onPress={() => setModPickerProduct(null)}>
              <Text style={s.bCT}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.bOk} onPress={confirmModifiers}>
              <Text style={s.bOkT}>Agregar</Text>
            </TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* EDIT CART ITEM */}
      <Modal visible={!!editingCartItem} transparent animationType="fade">
        <View style={s.ov}><View style={s.md}>
          <Text style={s.mdT}>{editingCartItem?.product.name}</Text>
          <Text style={{ fontSize: 18, color: COLORS.primary, textAlign: 'center', marginTop: 4, fontWeight: '700' }}>{fmt(editingCartItem?.product.price || 0)}</Text>
          <Text style={s.lb}>Cantidad</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <TouchableOpacity style={s.qBig} onPress={() => setEditQty(Math.max(1, editQty - 1))}><Text style={s.qBigT}>−</Text></TouchableOpacity>
            <Text style={{ fontSize: 28, fontWeight: '800', color: COLORS.text }}>{editQty}</Text>
            <TouchableOpacity style={s.qBig} onPress={() => setEditQty(editQty + 1)}><Text style={s.qBigT}>+</Text></TouchableOpacity>
          </View>
          <Text style={s.lb}>Nota</Text>
          <TextInput style={s.inp} placeholder="sin cebolla, extra picante..." placeholderTextColor={COLORS.textMuted} value={editNotes} onChangeText={setEditNotes} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {['Sin cebolla', 'Extra picante', 'Sin sal', 'Doble queso', 'Sin hielo', 'Con limón'].map(n => (
              <TouchableOpacity key={n} onPress={() => setEditNotes(prev => prev ? `${prev}, ${n.toLowerCase()}` : n.toLowerCase())} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }}><Text style={{ fontSize: 11, color: COLORS.textSecondary }}>{n}</Text></TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <TouchableOpacity style={[s.bC, { borderColor: COLORS.error }]} onPress={() => { if (editingCartItem) removeFromCart(editingCartItem.id); setEditingCartItem(null); }}><Text style={{ color: COLORS.error, fontWeight: '600', fontSize: 15 }}>🗑 Eliminar</Text></TouchableOpacity>
            <TouchableOpacity style={s.bOk} onPress={confirmEditCartItem}><Text style={s.bOkT}>✅ Guardar</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* PRE-CUENTA */}
      <Modal visible={preCuentaModal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}><View style={[s.md, { maxWidth: 520, width: width * 0.95 }]}>
          <Text style={s.mdT}>🧾 Pre-Cuenta</Text>
          <Text style={{ fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 4 }}>Mesa {table.number} — ALMÍBAR • {waiterName}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <TouchableOpacity onPress={() => { setPayMode('full'); deselectAll(); }} style={[s.modeBtn, payMode === 'full' && s.modeBtnA]}><Text style={[s.modeBtnT, payMode === 'full' && s.modeBtnTA]}>💳 Pagar Todo</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { setPayMode('partial'); deselectAll(); }} style={[s.modeBtn, payMode === 'partial' && s.modeBtnA]}><Text style={[s.modeBtnT, payMode === 'partial' && s.modeBtnTA]}>✂️ Selección</Text></TouchableOpacity>
          </View>
          {payMode === 'partial' && <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}><TouchableOpacity onPress={selectAll}><Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '600' }}>Seleccionar todo</Text></TouchableOpacity><TouchableOpacity onPress={deselectAll}><Text style={{ fontSize: 12, color: COLORS.textMuted }}>Deseleccionar</Text></TouchableOpacity></View>}
          <View style={s.div} />
          {paidItems.length > 0 && (<><Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.success, marginBottom: 6 }}>✅ PAGADOS</Text>{paidItems.map(i => <View key={i.id} style={{ flexDirection: 'row', paddingVertical: 3, opacity: 0.5 }}><Text style={{ width: 30, fontSize: 13, fontWeight: '700', color: COLORS.textMuted }}>{i.quantity}x</Text><Text style={{ flex: 1, fontSize: 13, color: COLORS.textMuted, textDecorationLine: 'line-through' }}>{i.product?.name}</Text><Text style={{ fontSize: 13, color: COLORS.textMuted }}>{fmt(i.total_price)}</Text></View>)}<View style={[s.div, { marginVertical: 8 }]} /></>)}
          {unpaidItems.map(i => <TouchableOpacity key={i.id} onPress={() => payMode === 'partial' ? toggleItem(i.id) : null} style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, borderRadius: 6, backgroundColor: selectedItemIds.has(i.id) ? COLORS.primary + '15' : 'transparent' }}>{payMode === 'partial' && <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: selectedItemIds.has(i.id) ? COLORS.primary : COLORS.border, backgroundColor: selectedItemIds.has(i.id) ? COLORS.primary : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>{selectedItemIds.has(i.id) && <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>✓</Text>}</View>}<Text style={{ width: 28, fontSize: 13, fontWeight: '700', color: COLORS.textSecondary }}>{i.quantity}x</Text><Text style={{ flex: 1, fontSize: 13, color: COLORS.text }}>{i.product?.name}</Text><Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{fmt(i.total_price)}</Text></TouchableOpacity>)}
          <View style={s.div} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}><Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>TOTAL</Text><Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary }}>{fmt(order?.total || 0)}</Text></View>
          <Text style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 8 }}>Propina sugerida 10%: {fmt(Math.round(payableTotal * 0.1))}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <TouchableOpacity style={s.bC} onPress={() => { setPreCuentaModal(false); resetPayState(); }}><Text style={s.bCT}>✕ Cerrar</Text></TouchableOpacity>
            <TouchableOpacity style={[s.bOk, { backgroundColor: COLORS.warning }]} onPress={async () => { try { await fetch('http://localhost:3333/precuenta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: table.number, waiter: user?.name || '', items: unpaidItems.map(i => ({ name: i.product?.name || '', qty: i.quantity, price: i.unit_price, total: i.total_price })), subtotal: unpaidTotal, tip: Math.round(unpaidTotal * 0.1), total: unpaidTotal + Math.round(unpaidTotal * 0.1), payments: [], orderNumber: order?.order_number }) }); await supabase.from('tables').update({ status: 'cuenta' }).eq('id', table.id); playClickPOS(); setPreCuentaModal(false); onBack(); } catch (e: any) { Alert.alert('Error', e.message); } }}><Text style={s.bOkT}>🖨 Imprimir</Text></TouchableOpacity>
            {(user?.role === 'cajero' || user?.role === 'admin') && unpaidItems.length > 0 && <TouchableOpacity style={[s.bOk, { backgroundColor: COLORS.success }]} onPress={() => { setPreCuentaModal(false); if (payMode === 'partial' && selectedItems.length > 0) { setPaySelectedModal(true); } else { const tip10 = Math.round(unpaidTotal * 0.1); setPayEntries([{ method: 'efectivo', amount: String(unpaidTotal + tip10) }]); setTipEntries([{ method: 'efectivo', amount: String(tip10) }]); setCloseModal(true); } }}><Text style={s.bOkT}>💳 Pagar</Text></TouchableOpacity>}
          </View>
        </View></ScrollView></View>
      </Modal>

      {/* PAGO PARCIAL */}
      <Modal visible={paySelectedModal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}><View style={[s.md, { maxWidth: 480, width: width * 0.92 }]}>
          <Text style={s.mdT}>💳 Pago Parcial</Text>
          <View style={{ marginTop: 12, backgroundColor: COLORS.background, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.border }}>
            {selectedItems.map(i => <View key={i.id} style={{ flexDirection: 'row', paddingVertical: 2 }}><Text style={{ width: 28, fontSize: 12, fontWeight: '700', color: COLORS.textSecondary }}>{i.quantity}x</Text><Text style={{ flex: 1, fontSize: 12, color: COLORS.text }}>{i.product?.name}</Text><Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.text }}>{fmt(i.total_price)}</Text></View>)}
            <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 8, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 16, fontWeight: '800' }}>Subtotal</Text><Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.primary }}>{fmt(selectedTotal)}</Text></View>
          </View>
          <Text style={s.lb}>Propina</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{[0, 5, 10, 15, 20].map(p => <TouchableOpacity key={p} onPress={() => { setTipPercent(p); setTipCustom(''); }} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: !tipCustom && tipPercent === p ? COLORS.primary + '30' : COLORS.background, borderWidth: 1, borderColor: !tipCustom && tipPercent === p ? COLORS.primary : COLORS.border }}><Text style={{ fontSize: 12, fontWeight: '600', color: !tipCustom && tipPercent === p ? COLORS.primary : COLORS.text }}>{p === 0 ? 'Sin' : `${p}%`}</Text></TouchableOpacity>)}</View>
          <Text style={s.lb}>Medio de pago</Text>
          <View style={s.payG}>{['efectivo', 'debito', 'credito', 'transferencia'].map(m => <TouchableOpacity key={m} style={[s.payO, paymentMethod === m && s.payOA]} onPress={() => setPaymentMethod(m)}><Text style={{ fontSize: 18 }}>{m === 'efectivo' ? '💵' : m === 'transferencia' ? '📱' : '💳'}</Text><Text style={[s.payL, paymentMethod === m && { color: COLORS.primary }]}>{m.charAt(0).toUpperCase() + m.slice(1)}</Text></TouchableOpacity>)}</View>
          {paymentMethod === 'efectivo' && (<><Text style={s.lb}>Monto recibido</Text><TextInput style={[s.inp, { fontSize: 22, textAlign: 'center', fontWeight: '800' }]} placeholder="$0" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" value={receivedAmount} onChangeText={setReceivedAmount} />{receivedAmount && parseInt(receivedAmount) > 0 && (() => { const d = parseInt(receivedAmount) - (selectedTotal + tipAmount); return <View style={{ marginTop: 10, backgroundColor: d >= 0 ? COLORS.success + '15' : COLORS.error + '15', borderRadius: 10, padding: 14, alignItems: 'center' }}><Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Vuelto</Text><Text style={{ fontSize: 28, fontWeight: '800', color: d >= 0 ? COLORS.success : COLORS.error }}>{fmt(d)}</Text></View>; })()}</>)}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <TouchableOpacity style={s.bC} onPress={() => { setPaySelectedModal(false); resetPayState(); setPreCuentaModal(true); }}><Text style={s.bCT}>← Volver</Text></TouchableOpacity>
            <TouchableOpacity style={[s.bOk, { backgroundColor: COLORS.success }]} onPress={paySelected}><Text style={s.bOkT}>✅ Pagar {fmt(selectedTotal)}</Text></TouchableOpacity>
          </View>
        </View></ScrollView></View>
      </Modal>

      {/* CERRAR MESA - Fudo style */}
      <Modal visible={closeModal} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}><View style={[s.md, { maxWidth: 520, width: width * 0.95 }]}>
          <Text style={[s.mdT, { fontSize: 18 }]}>CERRAR MESA {table.number}</Text>

          {/* ADICIONES - items list */}
          <View style={{ marginTop: 12, backgroundColor: COLORS.background, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>ADICIONES</Text>
            {unpaidItems.map(i => (
              <View key={i.id} style={{ flexDirection: 'row', paddingVertical: 4, borderLeftWidth: 3, borderLeftColor: COLORS.warning, paddingLeft: 10 }}>
                <Text style={{ width: 24, fontSize: 13, fontWeight: '700', color: COLORS.textSecondary }}>{i.quantity}</Text>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text }}>{i.product?.name}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{fmt(i.total_price)}</Text>
              </View>
            ))}
            <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 8, paddingTop: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Subtotal</Text><Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>{fmt(unpaidSubtotal)}</Text></View>
              {discountAmount > 0 && <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}><Text style={{ fontSize: 14, color: COLORS.success }}>Descuento {discountType === 'percent' ? `(${discountValue}%)` : ''}</Text><Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.success }}>-{fmt(discountAmount)}</Text></View>}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}><Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Propina</Text><Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.warning }}>{fmt(tipTotal)}</Text></View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 2, borderTopColor: COLORS.primary }}><Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>Total:</Text><Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.primary }}>{fmt(grandTotal)}</Text></View>
            </View>
          </View>

          {/* DESCUENTO section */}
          <View style={{ marginTop: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>DESCUENTO</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {([['none','Sin'],['percent','%'],['fixed','$']] as const).map(([t, label]) => (
                  <TouchableOpacity key={t} onPress={() => { setDiscountType(t); if (t === 'none') setDiscountValue(''); }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: discountType === t ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: discountType === t ? COLORS.primary : COLORS.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: discountType === t ? '#fff' : COLORS.text }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {discountType !== 'none' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' as const }}>
                  <Text style={{ paddingHorizontal: 10, fontSize: 14, color: COLORS.textSecondary }}>{discountType === 'percent' ? '%' : '$'}</Text>
                  <TextInput style={{ flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text, paddingVertical: 10, paddingRight: 10 }} value={discountValue} onChangeText={setDiscountValue} keyboardType="number-pad" placeholder={discountType === 'percent' ? '10' : '5000'} placeholderTextColor={COLORS.textMuted} />
                </View>
                {discountAmount > 0 && <Text style={{ fontSize: 13, color: COLORS.success, fontWeight: '700' }}>-{fmt(discountAmount)}</Text>}
              </View>
            )}
          </View>

          {/* PROPINA section */}
          <View style={{ marginTop: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>PROPINA</Text>
              <TouchableOpacity onPress={addTipEntry} style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>+</Text></TouchableOpacity>
            </View>
            {tipEntries.map((te, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' }}>
                  <TouchableOpacity onPress={() => { const methods = ['efectivo','debito','credito','transferencia']; const next = methods[(methods.indexOf(te.method) + 1) % methods.length]; updateTipEntry(i, 'method', next); }} style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: COLORS.card, borderRightWidth: 1, borderRightColor: COLORS.border }}>
                    <Text style={{ fontSize: 12, color: COLORS.text, minWidth: 80 }}>{te.method === 'efectivo' ? '💵 Efectivo' : te.method === 'debito' ? '💳 Débito' : te.method === 'credito' ? '💳 Crédito' : '📱 Transf.'}</Text>
                  </TouchableOpacity>
                  <Text style={{ paddingHorizontal: 8, fontSize: 14, color: COLORS.textSecondary }}>$</Text>
                  <TextInput style={{ flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text, paddingVertical: 10, paddingRight: 10 }} value={te.amount} onChangeText={v => updateTipEntry(i, 'amount', v)} keyboardType="number-pad" />
                </View>
                <TouchableOpacity onPress={() => removeTipEntry(i)}><Text style={{ fontSize: 16, color: COLORS.error }}>✕</Text></TouchableOpacity>
              </View>
            ))}
          </View>

          {/* PAGO section */}
          <View style={{ marginTop: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>PAGO</Text>
              <TouchableOpacity onPress={addPayEntry} style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>+</Text></TouchableOpacity>
            </View>
            {payEntries.map((pe, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' }}>
                  <TouchableOpacity onPress={() => { const methods = ['efectivo','debito','credito','transferencia']; const next = methods[(methods.indexOf(pe.method) + 1) % methods.length]; updatePayEntry(i, 'method', next); }} style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: COLORS.card, borderRightWidth: 1, borderRightColor: COLORS.border }}>
                    <Text style={{ fontSize: 12, color: COLORS.text, minWidth: 80 }}>{pe.method === 'efectivo' ? '💵 Efectivo' : pe.method === 'debito' ? '💳 Débito' : pe.method === 'credito' ? '💳 Crédito' : '📱 Transf.'}</Text>
                  </TouchableOpacity>
                  <Text style={{ paddingHorizontal: 8, fontSize: 14, color: COLORS.textSecondary }}>$</Text>
                  <TextInput style={{ flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text, paddingVertical: 10, paddingRight: 10 }} value={pe.amount} onChangeText={v => updatePayEntry(i, 'amount', v)} keyboardType="number-pad" />
                </View>
                <TouchableOpacity onPress={() => removePayEntry(i)}><Text style={{ fontSize: 16, color: COLORS.error }}>✕</Text></TouchableOpacity>
              </View>
            ))}
          </View>

          {/* VUELTO / AUTO-PROPINA */}
          {(() => {
            const needed = unpaidTotal + tipTotal;
            const change = payTotal - needed;
            const hasCash = payEntries.some(e => e.method === 'efectivo');

            return (<>
              {/* Cash payments: show vuelto */}
              {payEntries.length > 0 && hasCash && (
                <View style={{ marginTop: 16, backgroundColor: change >= 0 ? COLORS.success + '15' : COLORS.warning + '15', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: change >= 0 ? COLORS.success + '40' : COLORS.warning + '40' }}>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Vuelto:</Text>
                  <Text style={{ fontSize: 32, fontWeight: '800', color: change >= 0 ? COLORS.success : COLORS.warning }}>{fmt(change)}</Text>
                  {change > 0 && (
                    <TouchableOpacity onPress={() => {
                      const payMethod = payEntries[payEntries.length - 1].method;
                      const sameEntry = tipEntries.find(e => e.method === payMethod);
                      if (sameEntry) {
                        const idx = tipEntries.indexOf(sameEntry);
                        updateTipEntry(idx, 'amount', String((parseInt(sameEntry.amount) || 0) + change));
                      } else {
                        setTipEntries(prev => [...prev, { method: payMethod, amount: String(change) }]);
                      }
                    }} style={{ marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.warning + '25', borderWidth: 1, borderColor: COLORS.warning + '50' }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.warning }}>🤝 Sumar {fmt(change)} a propina</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {/* Non-cash: excess auto goes to propina at close time */}
              {payEntries.length > 0 && !hasCash && change > 0 && (
                <View style={{ marginTop: 16, backgroundColor: COLORS.success + '15', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.success + '40' }}>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Excedente de {fmt(change)}</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.success, marginTop: 4 }}>🤝 Se sumará automáticamente a propina</Text>
                </View>
              )}
              {/* All good */}
              {payEntries.length > 0 && !hasCash && change === 0 && (
                <View style={{ marginTop: 16, backgroundColor: COLORS.success + '15', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.success + '40' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.success }}>✅ Pago cuadrado</Text>
                </View>
              )}
            </>);
          })()}

          {payTotal < unpaidTotal && <Text style={{ fontSize: 12, color: COLORS.error, textAlign: 'center', marginTop: 6 }}>El pago no cubre el consumo (faltan {fmt(unpaidTotal - payTotal)})</Text>}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <TouchableOpacity style={s.bC} onPress={() => { setCloseModal(false); resetPayState(); }}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={[s.bOk, { backgroundColor: COLORS.success, opacity: payTotal < unpaidTotal ? 0.5 : 1 }]} onPress={closeTable} disabled={payTotal < unpaidTotal}><Text style={s.bOkT}>Cerrar mesa {table.number}</Text></TouchableOpacity>
          </View>
        </View></ScrollView></View>
      </Modal>
    </View>
  );
}

function SecH({ color, title }: { color: string; title: string }) { return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} /><Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase' }}>{title}</Text></View>; }
const CREATOR_COLORS: Record<string, string> = {
  admin: '#9C27B0',
  cajero: '#2196F3',
  garzon: '#4CAF50',
  cliente: '#FF9800',
  socio: '#E91E63',
};

function getCreatorColor(item: any, orderCreatedBy?: string): { color: string; label: string } {
  const creator = (item as any).creator;
  const role = creator?.role || 'garzon';
  const name = creator?.name || '';
  const isOrderOwner = item.created_by === orderCreatedBy;

  if (role === 'admin') return { color: CREATOR_COLORS.admin, label: name };
  if (role === 'cajero') return { color: CREATOR_COLORS.cajero, label: name };
  if (!isOrderOwner && role === 'garzon') return { color: '#FF5722', label: name }; // otro garzón
  return { color: CREATOR_COLORS.garzon, label: name };
}

function IR({ item, onRm, fmt, canRm, orderCreatedBy }: { item: OrderItem; onRm: (i: OrderItem) => void; fmt: (n: number) => string; canRm: boolean; orderCreatedBy?: string }) {
  const sc = !item.printed ? COLORS.warning : item.status === 'listo' ? COLORS.success : COLORS.info;
  const sl = !item.printed ? 'NUEVO' : item.status === 'preparando' ? 'PREPARANDO' : item.status === 'listo' ? 'LISTO' : 'ENVIADO';
  const cr = getCreatorColor(item, orderCreatedBy);
  return <View style={[s.ir, { borderLeftWidth: 3, borderLeftColor: cr.color }]}><View style={{ flex: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.primary, minWidth: 28 }}>{item.quantity}x</Text><Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text, flex: 1 }}>{item.product?.name}</Text></View>{item.notes ? <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 3 }}>📝 {item.notes}</Text> : null}<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}><View style={{ alignSelf: 'flex-start', backgroundColor: sc + '25', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 10, fontWeight: '700', color: sc }}>{sl}</Text></View><Text style={{ fontSize: 9, fontWeight: '600', color: cr.color }}>● {cr.label}</Text></View></View><View style={{ alignItems: 'flex-end', gap: 6 }}><Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>{fmt(item.total_price)}</Text>{canRm && <TouchableOpacity onPress={() => onRm(item)}><Text style={{ fontSize: 14 }}>🗑</Text></TouchableOpacity>}</View></View>;
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: COLORS.primary },
  hT: { fontSize: 20, fontWeight: '800', color: '#fff' },
  subH: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  addSec: { backgroundColor: COLORS.card, margin: 12, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, zIndex: 10, overflow: 'visible' as any },
  addT: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1, marginBottom: 10 },
  sRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  plusB: { width: 40, height: 40, borderRadius: 8, backgroundColor: COLORS.warning, alignItems: 'center', justifyContent: 'center' },
  sInp: { backgroundColor: COLORS.background, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text },
  dd: { position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, zIndex: 999 },
  ddI: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  qChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, marginRight: 6 },
  qChipT: { fontSize: 12, color: COLORS.textSecondary, maxWidth: 120 },
  cList: { marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 },
  cRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 6 },
  qBtn: { width: 28, height: 28, borderRadius: 4, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  qBtnT: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  cQty: { fontSize: 15, fontWeight: '700', color: COLORS.text, minWidth: 20, textAlign: 'center' },
  cName: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  cPrice: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginHorizontal: 6 },
  cTotR: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, marginTop: 4 },
  cTotL: { fontSize: 14, color: COLORS.textSecondary },
  cTotV: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  cBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  canBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  canBtnT: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  conBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: COLORS.warning, alignItems: 'center' },
  conBtnT: { fontSize: 14, fontWeight: '700', color: '#fff' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: COLORS.card, borderTopWidth: 2, borderTopColor: COLORS.border },
  clBtn: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: COLORS.primary, borderRadius: 10 },
  clBtnT: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ir: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginVertical: 3, borderWidth: 1, borderColor: COLORS.border },
  ov: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' },
  md: { width: width * 0.9, maxWidth: 450, backgroundColor: COLORS.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border },
  mdT: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  lb: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginTop: 16 },
  inp: { backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text },
  div: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  bC: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  bCT: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },
  bOk: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  bOkT: { color: '#fff', fontWeight: '700', fontSize: 15 },
  qBig: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  qBigT: { fontSize: 22, fontWeight: '600', color: COLORS.text },
  payG: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  payO: { width: '47%' as any, paddingVertical: 16, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.background, borderWidth: 2, borderColor: COLORS.border },
  payOA: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  payL: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginTop: 4 },
  modeBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: COLORS.background, borderWidth: 2, borderColor: COLORS.border },
  modeBtnA: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  modeBtnT: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  modeBtnTA: { color: COLORS.primary },
});
