// src/screens/OrderScreen.tsx
// v9 - Fudo-style: inline ADICIONAR panel with search dropdown

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { printOrder, generateAnulacion, generateBoleta, sendToPrinter, PRINTER_CONFIG } from '../lib/printService';
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
interface ModGroup { id: string; name: string; type: string; required: boolean; min_select: number; max_select: number; options: ModOption[]; }
interface CartItem { id: string; product: Product; quantity: number; notes: string; modifiers: ModOption[]; client_slot?: number; }
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
  const esMiercoles = new Date().getDay() === 3;
  const [discountType, setDiscountType] = useState<'none'|'percent'|'fixed'>(esMiercoles ? 'percent' : 'none');
  const [discountValue, setDiscountValue] = useState(esMiercoles ? '40' : '');
  // Multi-method payment - Fudo style
  const [tipEntries, setTipEntries] = useState<{method:string;amount:string}[]>([]);
  const [payEntries, setPayEntries] = useState<{method:string;amount:string}[]>([]);
  // Client slots & table management
  const [activeClientSlot, setActiveClientSlot] = useState<number>(1);
  const [guestNames, setGuestNames] = useState<string[]>([]);
  const [editGuestsModal, setEditGuestsModal] = useState(false);
  const [tableActionModal, setTableActionModal] = useState<string>(''); // 'move'|'merge'|'split'|''
  const [availableTables, setAvailableTables] = useState<any[]>([]);
  const [splitItems, setSplitItems] = useState<Set<string>>(new Set());

  // Promo flash: productos con precio reducido
  const [promoProducts, setPromoProducts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadAll(); loadPromo(); const c = setupRT(); return c;
  }, []);

  const PROMO_FLASH_PRODUCTS: Record<string, number> = {
    'db577525-cdd9-438d-a394-0e1ce02bb3f7': 1000,  // Shot Tequila → $1.000
    'f3315d09-716d-48a4-a3f5-e6a5a0b3fc7b': 2500,  // Mojito Cubano → $2.500
    '8279c385-2158-4895-a4bf-ab607602c835': 2500,  // Schop Patagonia → $2.500
  };

  const loadPromo = async () => {
    const { data } = await supabase.from('promo_banners').select('active').eq('title', 'PROMO FLASH').limit(1);
    if (data?.[0]?.active) setPromoProducts(PROMO_FLASH_PRODUCTS);
    else setPromoProducts({});
  };

  const loadAll = async () => {
    await Promise.all([loadOrder(), loadMenu(), loadPrinters()]);
    setLoading(false);
  };

  const loadPrinters = async () => {
    const [{ data: p }, { data: cp }] = await Promise.all([
      supabase.from('printers').select('*').eq('active', true),
      supabase.from('category_printer').select('*'),
    ]);
    if (p) setPrinters(p);
    if (cp) setCategoryPrinters(cp);
  };

  const loadOrder = async () => {
    if (!table.current_order_id) return;
    const [{ data: o }, { data: items }] = await Promise.all([
      supabase.from('orders').select('*').eq('id', table.current_order_id).single(),
      supabase.from('order_items').select('*, product:product_id(*), item_modifiers:order_item_modifiers(id, option_name), creator:created_by(name)').eq('order_id', table.current_order_id).order('created_at'),
    ]);
    if (o) {
      setOrder(o);
      setGuestNames(o.guest_names || []);
      const { data: w } = await supabase.from('users').select('name').eq('id', o.waiter_id).single();
      if (w) setWaiterName(w.name);
    }
    if (items) setOrderItems(items);
  };

  const loadMenu = async () => {
    const [{ data: c }, { data: p }, { data: pmg }, { data: mg }, { data: mo }] = await Promise.all([
      supabase.from('categories').select('*').eq('active', true).order('sort_order'),
      supabase.from('products').select('*').eq('active', true).order('sort_order'),
      supabase.from('product_modifier_groups').select('product_id, group_id'),
      supabase.from('modifier_groups').select('*').eq('active', true).order('sort_order'),
      supabase.from('modifier_options').select('*').eq('active', true).order('sort_order'),
    ]);
    if (c) setCategories(c);
    if (p) {
      const HH_CAT = 'd0000000-0000-0000-0000-000000000041';
      const COMBO_CAT = 'd0000000-0000-0000-0000-000000000040';
      const now = new Date();
      const hora = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' });
      const dow = now.getDay();
      const esMiercoles = dow === 3;
      // HH siempre visible, nunca bloquear categoría
      const bloqueadas: string[] = [];
      setProducts(p.filter((pr: any) => !bloqueadas.includes(pr.category_id)));
    }
    if (pmg && mg && mo) {
      const map: Record<string, ModGroup[]> = {};
      pmg.forEach((link: any) => {
        const group = mg.find((g: any) => g.id === link.group_id);
        if (!group) return;
        const opts = mo.filter((o: any) => o.group_id === group.id).map((o: any) => ({ id: o.id, name: o.name, price_adjust: o.price_adjust }));
        if (!map[link.product_id]) map[link.product_id] = [];
        map[link.product_id].push({ id: group.id, name: group.name, type: group.type, required: group.required, min_select: group.min_select || 0, max_select: group.max_select, options: opts });
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
  const [pendingModItem, setPendingModItem] = useState<any>(null); // order_item with pending modifiers

  const HH_CAT_ID = 'd0000000-0000-0000-0000-000000000041';
  const isHHAllowed = () => {
    const now = new Date();
    const h = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' });
    const dow = now.getDay();
    return dow >= 1 && dow <= 6 && h >= '17:00' && h < '21:00';
  };

  const addToCart = (product: Product) => {
    // Bloquear productos HH fuera de horario
    if (product.category_id === HH_CAT_ID && !isHHAllowed()) {
      Alert.alert('⏰ Fuera de horario', 'Happy Hour disponible de Lunes a Sábado entre 17:00 y 21:00');
      return;
    }
    playClickPOS();
    const groups = productModGroups[product.id];
    if (groups && groups.length > 0) {
      setModPickerProduct(product);
      setModPickerSelections({});
      setSearchQuery(''); setShowDropdown(false);
      return;
    }
    // Aplicar precio promo si existe
    const promoPrice = promoProducts[product.id];
    const effectiveProduct = promoPrice != null ? { ...product, price: promoPrice } : product;
    const isPromo = promoPrice != null;
    const promoNote = isPromo ? '[PROMO]' : '';
    const existing = cart.find(c => c.product.id === product.id && c.notes === promoNote && c.modifiers.length === 0 && (!guestNames.length || c.client_slot === activeClientSlot));
    if (existing) setCart(prev => prev.map(c => c.id === existing.id ? { ...c, quantity: c.quantity + 1 } : c));
    else setCart(prev => [...prev, { id: `c-${Date.now()}-${Math.random()}`, product: effectiveProduct, quantity: 1, notes: promoNote, modifiers: [], client_slot: activeClientSlot }]);
    setSearchQuery(''); setShowDropdown(false);
  };

  const confirmModifiers = () => {
    if (!modPickerProduct) return;
    const groups = productModGroups[modPickerProduct.id] || [];
    for (const g of groups) {
      const sel = modPickerSelections[g.id]?.length || 0;
      const minRequired = g.min_select || (g.required ? 1 : 0);
      if (sel < minRequired) {
        if (typeof window !== 'undefined') window.alert(`Debes elegir al menos ${minRequired} en: ${g.name}`);
        return;
      }
    }
    const allMods = Object.values(modPickerSelections).flat();
    const modKey = allMods.map(m => m.id).sort().join(',');
    const existing = cart.find(c => c.product.id === modPickerProduct.id && c.modifiers.map(m => m.id).sort().join(',') === modKey);
    if (existing) setCart(prev => prev.map(c => c.id === existing.id ? { ...c, quantity: c.quantity + 1 } : c));
    else setCart(prev => [...prev, { id: `c-${Date.now()}-${Math.random()}`, product: modPickerProduct, quantity: 1, notes: '', modifiers: allMods, client_slot: activeClientSlot }]);
    setModPickerProduct(null);
  };

  const toggleModOption = (groupId: string, option: ModOption, type: string, maxSelect?: number, allowRepeat?: boolean) => {
    setModPickerSelections(prev => {
      const current = prev[groupId] || [];
      if (type === 'single') return { ...prev, [groupId]: [option] };
      if (allowRepeat) {
        // Allow multiple of same option (e.g. 3x2 Schop: 2 Hoppy + 1 Torres)
        if (maxSelect && current.length >= maxSelect) return prev;
        return { ...prev, [groupId]: [...current, option] };
      }
      const exists = current.find(o => o.id === option.id);
      if (exists) return { ...prev, [groupId]: current.filter(o => o.id !== option.id) };
      if (maxSelect && current.length >= maxSelect) return prev;
      return { ...prev, [groupId]: [...current, option] };
    });
  };
  const removeModOption = (groupId: string, index: number) => {
    setModPickerSelections(prev => {
      const current = [...(prev[groupId] || [])];
      current.splice(index, 1);
      return { ...prev, [groupId]: current };
    });
  };
  const removeFromCart = (id: string) => setCart(prev => prev.filter(c => c.id !== id));
  const updateCartQty = (id: string, d: number) => setCart(prev => prev.map(c => c.id !== id ? c : { ...c, quantity: Math.max(1, c.quantity + d) }));
  const openEditCartItem = (ci: CartItem) => { setEditingCartItem(ci); setEditQty(ci.quantity); setEditNotes(ci.notes); };
  const confirmEditCartItem = () => { if (editingCartItem) setCart(prev => prev.map(c => c.id === editingCartItem.id ? { ...c, quantity: editQty, notes: editNotes } : c)); setEditingCartItem(null); };

  // Open picker to add pending modifiers to an existing order_item
  const openPendingMods = (item: any) => {
    if (!item.mod_group_id || !item.product) return;
    const groups = productModGroups[item.product.id] || [];
    const group = groups.find((g: ModGroup) => g.id === item.mod_group_id);
    if (!group) return;
    const usedCount = (item.item_modifiers || []).length;
    const remaining = item.mod_max_select - usedCount;
    if (remaining <= 0) return;
    setPendingModItem({ ...item, _remaining: remaining, _group: group });
    setModPickerSelections({});
  };

  const confirmPendingMods = async () => {
    if (!pendingModItem || !user) return;
    const group = pendingModItem._group;
    const selections = modPickerSelections[group.id] || [];
    if (selections.length === 0) return;
    // Save new modifiers to existing order_item
    await supabase.from('order_item_modifiers').insert(selections.map((m: ModOption) => ({ order_item_id: pendingModItem.id, option_id: m.id, option_name: m.name, price_adjust: m.price_adjust })));
    // Print comanda for the new modifiers only
    try {
      await printOrder({
        table: table.number, waiter: user.name, orderNumber: order?.order_number,
        items: [{ name: pendingModItem.product.name, qty: 1, category_id: pendingModItem.product.category_id, modifiers: selections.map((m: ModOption) => m.name), notes: undefined }],
        printers, categoryPrinters,
      });
    } catch (e) { console.log('Print error:', e); }
    setPendingModItem(null); setModPickerSelections({});
    playClickPOS(); await loadOrder();
  };

  const loadAvailableTables = async (mode: string) => {
    if (mode === 'merge') {
      // Juntar: todas las mesas libres y ocupadas (para juntar con ocupadas)
      const { data } = await supabase.from('tables').select('*, order:current_order_id(id, total, order_number)').eq('active', true).in('status', ['libre', 'ocupada', 'cuenta']);
      setAvailableTables(data || []);
    } else {
      // Cambiar y separar: solo mesas libres
      const { data } = await supabase.from('tables').select('*').eq('active', true).eq('status', 'libre');
      setAvailableTables(data || []);
    }
  };

  const moveToTable = async (target: any) => {
    if (!order) return;
    await supabase.from('orders').update({ table_id: target.id }).eq('id', order.id);
    await supabase.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', table.id);
    await supabase.from('tables').update({ status: 'ocupada', current_order_id: order.id }).eq('id', target.id);
    if (typeof window !== 'undefined') window.alert('Mesa cambiada a #' + target.number);
    onBack();
  };

  const mergeFrom = async (source: any) => {
    if (!source.current_order_id || !order) return;
    await supabase.from('order_items').update({ order_id: order.id }).eq('order_id', source.current_order_id);
    await supabase.from('payments').update({ order_id: order.id }).eq('order_id', source.current_order_id);
    await supabase.from('orders').update({ status: 'anulada', closed_at: new Date().toISOString(), total: 0, subtotal: 0, notes: 'Fusionada con mesa ' + table.number }).eq('id', source.current_order_id);
    await supabase.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', source.id);
    setTableActionModal('');
    await loadOrder();
    if (typeof window !== 'undefined') window.alert('Mesa ' + source.number + ' fusionada');
  };

  const splitToTable = async (target: any) => {
    if (!order || splitItems.size === 0) return;
    const { data: newOrder } = await supabase.from('orders').insert({ table_id: target.id, type: 'mesa', status: 'abierta', waiter_id: user!.id, notes: 'Separada de mesa ' + table.number, personas: 1, tipo_venta: 'mesa' }).select().single();
    if (!newOrder) return;
    await supabase.from('order_items').update({ order_id: newOrder.id }).in('id', Array.from(splitItems));
    await supabase.from('tables').update({ status: 'ocupada', current_order_id: newOrder.id }).eq('id', target.id);
    setTableActionModal(''); setSplitItems(new Set());
    await loadOrder();
    if (typeof window !== 'undefined') window.alert('Items movidos a mesa ' + target.number);
  };

  const groupItemsForPrint = (items: any[]) => {
    const map = new Map<string, { name: string; qty: number; price: number; total: number }>();
    items.forEach((i: any) => {
      const key = (i.product?.name || i.name || '') + '|' + (i.unit_price || i.price || 0);
      if (map.has(key)) {
        const e = map.get(key)!;
        e.qty += i.quantity || i.qty || 1;
        e.total += i.total_price || i.total || 0;
      } else {
        map.set(key, { name: i.product?.name || i.name || '', qty: i.quantity || i.qty || 1, price: i.unit_price || i.price || 0, total: i.total_price || i.total || 0 });
      }
    });
    return Array.from(map.values());
  };

  const printByClient = async () => {
    if (!order) return;
    const cajaIp = PRINTER_CONFIG.caja?.ip || PRINTER_CONFIG.barra?.ip;
    const cajaPort = PRINTER_CONFIG.caja?.port || PRINTER_CONFIG.barra?.port || 9100;
    if (!cajaIp) return;
    const slots = guestNames.length > 1 ? guestNames : [''];
    for (let gi = 0; gi < slots.length; gi++) {
      const slot = gi + 1;
      const clientItems = guestNames.length > 1
        ? unpaidItems.filter(i => (i as any).client_slot === slot)
        : unpaidItems;
      if (clientItems.length === 0) continue;
      const clientSubtotal = clientItems.reduce((a: number, i: any) => a + i.total_price, 0);
      const clientDiscount = discountType === 'percent'
        ? Math.round(clientItems.filter((i: any) => !(i.notes || '').includes('[PROMO]')).reduce((a: number, i: any) => a + i.total_price, 0) * (parseInt(discountValue) || 0) / 100)
        : 0;
      const clientTotal = Math.max(0, clientSubtotal - clientDiscount);
      const ticket = generateBoleta({
        table: table.number,
        waiter: waiterName || '',
        items: groupItemsForPrint(clientItems),
        subtotal: clientSubtotal,
        discount: clientDiscount,
        discountLabel: discountType === 'percent' ? `Dcto (${discountValue}%)` : undefined,
        tip: Math.round(clientTotal * 0.1),
        total: clientTotal,
        payments: [],
        orderNumber: order.order_number,
      });
      // Add client name header
      const header = `\n--- ${slots[gi] || 'Cliente ' + slot} ---\n`;
      await sendToPrinter(cajaIp, cajaPort, ticket.replace('ALMIBAR\n', `ALMIBAR\n${slots[gi] ? slots[gi].toUpperCase() : 'CLIENTE ' + slot}\n`), 'caja');
    }
    if (order) await supabase.from('orders').update({ discount_type: discountType, discount_value: discountAmount, subtotal: unpaidSubtotal, total: unpaidTotal }).eq('id', order.id);
    await supabase.from('tables').update({ status: 'cuenta' }).eq('id', table.id);
    playClickPOS();
    setPreCuentaModal(false);
    onBack();
  };

  const saveGuestNames = async (names: string[]) => {
    if (!order) return;
    await supabase.from('orders').update({ guest_names: names, personas: names.length }).eq('id', order.id);
    setGuestNames(names);
    setEditGuestsModal(false);
  };

  const sendCartToKitchen = async () => {
    if (!order || !user || cart.length === 0) return;
    try {
      const items = cart.map(c => {
        const modAdjust = c.modifiers.reduce((s, m) => s + m.price_adjust, 0);
        const groups = productModGroups[c.product.id] || [];
        const repeatGroup = groups.find(g => g.type === 'multi' && g.max_select > g.options.length);
        return { order_id: order.id, product_id: c.product.id, quantity: c.quantity, unit_price: c.product.price + modAdjust, total_price: (c.product.price + modAdjust) * c.quantity, notes: c.notes || null, status: 'pendiente', printed: false, created_by: user.id, mod_max_select: repeatGroup ? repeatGroup.max_select : 0, mod_group_id: repeatGroup ? repeatGroup.id : null, client_slot: guestNames.length > 1 ? c.client_slot || activeClientSlot : null };
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
  const [editClientModal, setEditClientModal] = useState(false);
  const [editClientName, setEditClientName] = useState('');
  const [editClientSuggestions, setEditClientSuggestions] = useState<any[]>([]);
  const [editSelectedClient, setEditSelectedClient] = useState<any>(null);

  const editarCliente = () => {
    const currentName = order?.notes?.match(/Cliente:\s*([^|]+)/)?.[1]?.trim() || '';
    setEditClientName(currentName);
    setEditClientSuggestions([]);
    setEditSelectedClient(null);
    setEditClientModal(true);
  };

  const searchEditClient = async (text: string) => {
    setEditClientName(text);
    setEditSelectedClient(null);
    if (text.length < 2) { setEditClientSuggestions([]); return; }
    const { data } = await supabase.from('clients').select('id, name, phone, total_visits, member_number').or('name.ilike.%' + text + '%,phone.ilike.%' + text + '%').eq('active', true).limit(5);
    if (data) setEditClientSuggestions(data);
  };

  const guardarEditCliente = async () => {
    if (!order || !editClientName.trim()) return;
    const newNotes = 'Cliente: ' + editClientName.trim();
    const updates: any = { notes: newNotes };
    if (editSelectedClient) updates.client_id = editSelectedClient.id;
    await supabase.from('orders').update(updates).eq('id', order.id);
    setEditClientModal(false);
    await loadOrder();
  };

  const removeItem = async (item: OrderItem) => {
    if (!user || !order) return;
    if (user.role === 'garzon' && item.printed) { Alert.alert('No permitido'); return; }

    // Si el item ya fue impreso, pedir motivo y registrar anulación
    if (item.printed) {
      Alert.prompt ? Alert.prompt(
        'Anular producto',
        `¿Por qué se anula "${(item.product as any)?.name || 'producto'}"?`,
        async (motivo: string) => {
          if (!motivo || !motivo.trim()) return;
          await ejecutarAnulacion(item, motivo.trim());
        },
        'plain-text', '', 'Motivo de anulación'
      ) : (() => {
        const motivo = prompt(`Motivo de anulación de "${(item.product as any)?.name || 'producto'}":`);
        if (!motivo || !motivo.trim()) return;
        ejecutarAnulacion(item, motivo.trim());
      })();
      return;
    }

    // Item no impreso: borrar directo
    await supabase.from('order_items').delete().eq('id', item.id); await loadOrder();
  };

  const ejecutarAnulacion = async (item: OrderItem, motivo: string) => {
    const productName = (item.product as any)?.name || 'Producto';
    // 1. Registrar en order_logs
    await supabase.from('order_logs').insert({
      order_id: order!.id,
      action: 'item_anulado',
      details: {
        product_name: productName,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        motivo,
        anulado_por: user!.name,
      },
      user_id: user!.id,
    });

    // 2. Imprimir anulación en la impresora de la categoría del producto
    try {
      const catId = (item.product as any)?.category_id;
      if (catId) {
        const { data: cp } = await supabase.from('category_printer').select('printer_id').eq('category_id', catId).limit(1);
        if (cp && cp[0]) {
          const { data: printer } = await supabase.from('printers').select('*').eq('id', cp[0].printer_id).eq('active', true).single();
          if (printer && printer.ip_address) {
            const ticket = generateAnulacion({
              table: table.number || table.name || '?',
              waiter: user!.name,
              item: { name: productName, qty: item.quantity, price: item.unit_price },
              motivo,
              station: printer.name,
            });
            await sendToPrinter(printer.ip_address, printer.port || 9100, ticket, printer.name);
          }
        }
      }
    } catch (e) { console.log('Error imprimiendo anulación:', e); }

    // 3. Borrar el item
    await supabase.from('order_items').delete().eq('id', item.id);
    await loadOrder();
    Alert.alert('Anulado', `${productName} anulado. Motivo: ${motivo}`);
  };

  // Payment
  const paidItems = orderItems.filter(i => i.paid); const unpaidItems = orderItems.filter(i => !i.paid);
  const paidTotal = paidItems.reduce((a, i) => a + i.total_price, 0);
  const unpaidSubtotal = unpaidItems.reduce((a, i) => a + i.total_price, 0);
  // Excluir items promo del descuento
  const unpaidDiscountable = unpaidItems.filter(i => !(i.notes || '').includes('[PROMO]')).reduce((a, i) => a + i.total_price, 0);
  const discountAmount = discountType === 'percent' ? Math.round(unpaidDiscountable * (parseInt(discountValue) || 0) / 100) : discountType === 'fixed' ? (parseInt(discountValue) || 0) : 0;
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

    // Tips from tip entries + excess from overpayment
    const tipTotalFromEntries = tipEntries.reduce((a, e) => a + (parseInt(e.amount) || 0), 0);
    const excess = pTotal > unpaidTotal + tipTotalFromEntries ? pTotal - unpaidTotal - tipTotalFromEntries : 0;
    const tipTotalFinal = tipTotalFromEntries + excess;

    if (pTotal < unpaidTotal) { Alert.alert('Error', `El pago (${fmt(pTotal)}) no cubre el consumo (${fmt(unpaidTotal)})`); return; }

    // Insertar UN solo registro de pago por método con amount = parte del bill + tip incluida
    // amount = lo que realmente entra (bill portion + tip si aplica)
    // tip_amount = cuánto de ese amount es propina (metadata)
    if (finalPayEntries.length === 1) {
      // Pago simple: un solo método
      const pe = finalPayEntries[0];
      const amt = parseInt(pe.amount) || 0;
      await supabase.from('payments').insert({
        order_id: order.id, method: pe.method,
        amount: amt,  // lo que realmente entra (puede incluir excedente)
        tip_amount: tipTotalFinal,  // propina incluida en amount
        created_by: user.id
      });
    } else {
      // Pago split: múltiples métodos
      // Cada método recibe su parte proporcional de la propina
      for (const pe of finalPayEntries) {
        const amt = parseInt(pe.amount) || 0;
        if (amt <= 0) continue;
        // Propina proporcional al peso del pago
        const tipShare = pTotal > 0 ? Math.round(tipTotalFinal * amt / pTotal) : 0;
        await supabase.from('payments').insert({
          order_id: order.id, method: pe.method,
          amount: amt,
          tip_amount: tipShare,
          created_by: user.id
        });
      }
    }

    await supabase.from('order_items').update({ paid: true }).eq('order_id', order.id).eq('paid', false);
    await supabase.from('orders').update({ status: 'cerrada', closed_at: new Date().toISOString(), payment_method: mainMethod, tip_amount: tipTotalFinal, discount_type: discountType, discount_value: discountAmount, total: unpaidTotal }).eq('id', order.id);
    await supabase.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', table.id);
    setCloseModal(false); resetPayState();
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
      <View style={s.subH}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>👤 {waiterName || user?.name} • {order?.opened_at ? new Date(order.opened_at).toLocaleString('es-CL') : ''}</Text>
          <TouchableOpacity onPress={editarCliente} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: COLORS.primary + '15', borderWidth: 1, borderColor: COLORS.primary + '30' }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.primary }}>{order?.notes?.match(/Cliente:\s*([^|]+)/)?.[1]?.trim() || 'Asignar cliente'} ✏️</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          <TouchableOpacity onPress={() => { loadAvailableTables('move'); setTableActionModal('move'); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Cambiar mesa</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { loadAvailableTables('merge'); setTableActionModal('merge'); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Juntar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { loadAvailableTables('split'); setTableActionModal('split'); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Separar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' }}>
        {guestNames.length > 1 ? (
          <>
            {guestNames.map((name, i) => (
              <TouchableOpacity key={i} onPress={() => setActiveClientSlot(i + 1)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: activeClientSlot === i + 1 ? COLORS.primary : COLORS.background, borderWidth: 1, borderColor: activeClientSlot === i + 1 ? COLORS.primary : COLORS.border, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: activeClientSlot === i + 1 ? '#fff' : COLORS.text }}>{i + 1}. {name || 'Cliente ' + (i + 1)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setEditGuestsModal(true)} style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14 }}>✏️</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity onPress={() => { setGuestNames(guestNames.length === 0 ? [order?.notes?.match(/Cliente:\s*([^|]+)/)?.[1]?.trim() || '', ''] : [...guestNames, '']); setEditGuestsModal(true); }}
            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>👥 Agregar socios</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* ADICIONAR */}
        <View style={s.addSec}>
          <Text style={s.addT}>ADICIONAR</Text>
          <View style={s.sRow}>
            <View style={s.plusB}><Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>+</Text></View>
            <View style={{ flex: 1, zIndex: 10 }}>
              <TextInput style={s.sInp} placeholder="Buscar producto..." placeholderTextColor={COLORS.textMuted} value={searchQuery} onChangeText={t => { setSearchQuery(t); setShowDropdown(t.length >= 1); }} onFocus={() => { if (searchQuery.length >= 1) setShowDropdown(true); }} />
              {showDropdown && searchResults.length > 0 && (
                <View style={s.dd}>{searchResults.map(p => {
                  const pp = promoProducts[p.id];
                  return (
                  <TouchableOpacity key={p.id} style={s.ddI} onPress={() => addToCart(p)}>
                    <Text style={{ fontSize: 14, color: COLORS.primary, flex: 1 }}>- {p.name}{pp != null ? ' ⚡' : ''}</Text>
                    {pp != null ? (
                      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: COLORS.textMuted, textDecorationLine: 'line-through' }}>{fmt(p.price)}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.warning }}>{fmt(pp)}</Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{fmt(p.price)}</Text>
                    )}
                  </TouchableOpacity>
                  );
                })}</View>
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
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {guestNames.length > 1 && <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary, marginRight: 4 }}>C{ci.client_slot || activeClientSlot}</Text>}
                      <Text style={s.cName} numberOfLines={1}>{ci.product.name}</Text>
                    </View>
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
              <View style={s.cTotR}><Text style={s.cTotL}>Total a confirmar:</Text><Text style={s.cTotV}>{fmt(cartTotal)}</Text></View>
              <View style={s.cBtns}>
                <TouchableOpacity style={s.canBtn} onPress={cancelCart}><Text style={s.canBtnT}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={s.conBtn} onPress={sendCartToKitchen}><Text style={s.conBtnT}>Confirmar</Text></TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* PENDING */}
        {pending.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <SecH color={COLORS.warning} title={`Pendientes (${pending.length})`} />
              <TouchableOpacity style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.success, borderRadius: 8 }} onPress={sendOrder}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>📤 Enviar</Text></TouchableOpacity>
            </View>
            {pending.map(i => <IR key={i.id} item={i} onRm={removeItem} fmt={fmt} canRm />)}
          </View>
        )}

        {/* SENT */}
        {sent.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <SecH color={COLORS.success} title={`Enviados (${sent.length})`} />
            {sent.map(i => <IR key={i.id} item={i} onRm={removeItem} fmt={fmt} canRm={user?.role !== 'garzon'} onPendingMod={openPendingMods} />)}
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
                    {group.required ? 'Obligatorio' : 'Opcional'} · {group.type === 'single' ? 'Elige 1' : group.min_select === group.max_select ? `Elige ${group.max_select}` : group.min_select > 0 ? `Min ${group.min_select} · Max ${group.max_select}` : 'Hasta ' + group.max_select}
                  </Text>
                </View>
                {(() => {
                  const allowRepeat = group.type === 'multi' && group.max_select > group.options.length;
                  const selections = modPickerSelections[group.id] || [];
                  const totalSelected = selections.length;
                  if (allowRepeat) {
                    // Counter mode: +/- buttons for each option
                    return group.options.map(opt => {
                      const count = selections.filter(o => o.id === opt.id).length;
                      return (
                        <View key={opt.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1.5, borderRadius: 10, marginBottom: 6, borderColor: count > 0 ? COLORS.primary : COLORS.border, backgroundColor: count > 0 ? COLORS.primary + '10' : COLORS.card }}>
                          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text }}>{opt.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <TouchableOpacity onPress={() => { if (count > 0) removeModOption(group.id, selections.findIndex(o => o.id === opt.id)); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: count > 0 ? COLORS.primary : COLORS.border, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>−</Text>
                            </TouchableOpacity>
                            <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text, minWidth: 20, textAlign: 'center' }}>{count}</Text>
                            <TouchableOpacity onPress={() => toggleModOption(group.id, opt, group.type, group.max_select, true)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: totalSelected < group.max_select ? COLORS.primary : COLORS.border, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    });
                  }
                  // Normal checkbox/radio mode
                  return group.options.map(opt => {
                    const isSelected = selections.some(o => o.id === opt.id);
                    return (
                      <TouchableOpacity key={opt.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1.5, borderRadius: 10, marginBottom: 6, borderColor: isSelected ? COLORS.primary : COLORS.border, backgroundColor: isSelected ? COLORS.primary + '10' : COLORS.card }} onPress={() => toggleModOption(group.id, opt, group.type, group.max_select)}>
                        <View style={{ width: 22, height: 22, borderRadius: group.type === 'single' ? 11 : 4, borderWidth: 2, borderColor: isSelected ? COLORS.primary : COLORS.textMuted, backgroundColor: isSelected ? COLORS.primary : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
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
                  });
                })()}
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

      {/* Modal: Add pending modifiers to existing order item */}
      <Modal visible={!!pendingModItem} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 20, width: '90%', maxWidth: 420 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 4 }}>
            {pendingModItem?.product?.name}
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 16 }}>
            🍺 {pendingModItem?._remaining} pendiente{(pendingModItem?._remaining || 0) > 1 ? 's' : ''} — elige cuántas quieres ahora
          </Text>
          {pendingModItem?._group && (() => {
            const group = pendingModItem._group;
            const selections = modPickerSelections[group.id] || [];
            const totalSel = selections.length;
            const maxNow = pendingModItem._remaining;
            return group.options.map((opt: ModOption) => {
              const count = selections.filter((o: ModOption) => o.id === opt.id).length;
              return (
                <View key={opt.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1.5, borderRadius: 10, marginBottom: 6, borderColor: count > 0 ? COLORS.primary : COLORS.border, backgroundColor: count > 0 ? COLORS.primary + '10' : COLORS.card }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text }}>{opt.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <TouchableOpacity onPress={() => { if (count > 0) removeModOption(group.id, selections.findIndex((o: ModOption) => o.id === opt.id)); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: count > 0 ? COLORS.primary : COLORS.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>−</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text, minWidth: 20, textAlign: 'center' }}>{count}</Text>
                    <TouchableOpacity onPress={() => { if (totalSel < maxNow) toggleModOption(group.id, opt, group.type, maxNow, true); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: totalSel < maxNow ? COLORS.primary : COLORS.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            });
          })()}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity style={s.bC} onPress={() => { setPendingModItem(null); setModPickerSelections({}); }}>
              <Text style={s.bCT}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.bOk} onPress={confirmPendingMods}>
              <Text style={s.bOkT}>Enviar a cocina</Text>
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
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <TouchableOpacity onPress={() => { setPayMode('full'); deselectAll(); }} style={[s.modeBtn, payMode === 'full' && s.modeBtnA]}><Text style={[s.modeBtnT, payMode === 'full' && s.modeBtnTA]}>💳 Pagar Todo</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { setPayMode('partial'); deselectAll(); }} style={[s.modeBtn, payMode === 'partial' && s.modeBtnA]}><Text style={[s.modeBtnT, payMode === 'partial' && s.modeBtnTA]}>✂️ Selección</Text></TouchableOpacity>
            {guestNames.length > 1 && (
              <TouchableOpacity onPress={() => { setPayMode('by_client' as any); deselectAll(); }} style={[s.modeBtn, payMode === ('by_client' as any) && s.modeBtnA]}><Text style={[s.modeBtnT, payMode === ('by_client' as any) && s.modeBtnTA]}>👥 Por Cliente</Text></TouchableOpacity>
            )}
          </View>
          {payMode === 'partial' && <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}><TouchableOpacity onPress={selectAll}><Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '600' }}>Seleccionar todo</Text></TouchableOpacity><TouchableOpacity onPress={deselectAll}><Text style={{ fontSize: 12, color: COLORS.textMuted }}>Deseleccionar</Text></TouchableOpacity></View>}
          {payMode === ('by_client' as any) && guestNames.length > 1 && (
            <View style={{ marginTop: 12 }}>
              {guestNames.map((gName, gi) => {
                const slot = gi + 1;
                const clientItems = unpaidItems.filter(i => (i as any).client_slot === slot);
                const clientTotal = clientItems.reduce((a, i) => a + i.total_price, 0);
                if (clientItems.length === 0) return null;
                return (
                  <View key={gi} style={{ backgroundColor: COLORS.background, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary }}>{slot}. {gName || 'Cliente ' + slot}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.text }}>{fmt(clientTotal)}</Text>
                    </View>
                    {clientItems.map(ci => (
                      <View key={ci.id} style={{ flexDirection: 'row', paddingVertical: 2 }}>
                        <Text style={{ width: 28, fontSize: 12, fontWeight: '700', color: COLORS.textSecondary }}>{ci.quantity}x</Text>
                        <Text style={{ flex: 1, fontSize: 12, color: COLORS.text }}>{ci.product?.name}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.text }}>{fmt(ci.total_price)}</Text>
                      </View>
                    ))}
                    <TouchableOpacity onPress={() => {
                      setSelectedItemIds(new Set(clientItems.map(i => i.id)));
                      setPayMode('partial');
                      setPreCuentaModal(false);
                      setPaySelectedModal(true);
                    }} style={{ marginTop: 8, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.success, alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Pagar {fmt(clientTotal)}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {(() => {
                const unassigned = unpaidItems.filter(i => !guestNames.some((_, gi) => (i as any).client_slot === gi + 1));
                if (unassigned.length === 0) return null;
                const unassignedTotal = unassigned.reduce((a, i) => a + i.total_price, 0);
                return (
                  <View style={{ backgroundColor: COLORS.background, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textMuted }}>Sin asignar</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.text }}>{fmt(unassignedTotal)}</Text>
                    </View>
                    {unassigned.map(ci => (
                      <View key={ci.id} style={{ flexDirection: 'row', paddingVertical: 2 }}>
                        <Text style={{ width: 28, fontSize: 12, fontWeight: '700', color: COLORS.textSecondary }}>{ci.quantity}x</Text>
                        <Text style={{ flex: 1, fontSize: 12, color: COLORS.text }}>{ci.product?.name}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.text }}>{fmt(ci.total_price)}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </View>
          )}
          <View style={s.div} />
          {paidItems.length > 0 && (<><Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.success, marginBottom: 6 }}>✅ PAGADOS</Text>{paidItems.map(i => <View key={i.id} style={{ flexDirection: 'row', paddingVertical: 3, opacity: 0.5 }}><Text style={{ width: 30, fontSize: 13, fontWeight: '700', color: COLORS.textMuted }}>{i.quantity}x</Text><Text style={{ flex: 1, fontSize: 13, color: COLORS.textMuted, textDecorationLine: 'line-through' }}>{i.product?.name}</Text><Text style={{ fontSize: 13, color: COLORS.textMuted }}>{fmt(i.total_price)}</Text></View>)}<View style={[s.div, { marginVertical: 8 }]} /></>)}
          {unpaidItems.map(i => <TouchableOpacity key={i.id} onPress={() => payMode === 'partial' ? toggleItem(i.id) : null} style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, borderRadius: 6, backgroundColor: selectedItemIds.has(i.id) ? COLORS.primary + '15' : 'transparent' }}>{payMode === 'partial' && <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: selectedItemIds.has(i.id) ? COLORS.primary : COLORS.border, backgroundColor: selectedItemIds.has(i.id) ? COLORS.primary : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>{selectedItemIds.has(i.id) && <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>✓</Text>}</View>}<Text style={{ width: 28, fontSize: 13, fontWeight: '700', color: COLORS.textSecondary }}>{i.quantity}x</Text><Text style={{ flex: 1, fontSize: 13, color: COLORS.text }}>{i.product?.name}</Text><Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{fmt(i.total_price)}</Text></TouchableOpacity>)}
          <View style={s.div} />
          {/* Descuento */}
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>DESCUENTO</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {[0, 10, 15, 20, 30, 40].map(p => (
                <TouchableOpacity key={p} onPress={() => { if (p === 0) { setDiscountType('none'); setDiscountValue(''); } else { setDiscountType('percent'); setDiscountValue(String(p)); } }}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: discountType === 'percent' && discountValue === String(p) ? COLORS.success : p === 0 && discountType === 'none' ? COLORS.success : COLORS.background, borderWidth: 1, borderColor: discountType === 'percent' && discountValue === String(p) ? COLORS.success : p === 0 && discountType === 'none' ? COLORS.success : COLORS.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: (discountType === 'percent' && discountValue === String(p)) || (p === 0 && discountType === 'none') ? '#fff' : COLORS.text }}>{p === 0 ? 'Sin dcto' : `${p}%`}</Text>
                </TouchableOpacity>
              ))}
              <TextInput style={{ width: 80, borderWidth: 1, borderColor: discountType === 'fixed' ? COLORS.success : COLORS.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, color: COLORS.text, backgroundColor: COLORS.background, textAlign: 'center' }}
                placeholder="$ fijo" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad"
                value={discountType === 'fixed' ? discountValue : ''}
                onChangeText={v => { setDiscountType('fixed'); setDiscountValue(v); }}
                onFocus={() => setDiscountType('fixed')} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}><Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Subtotal</Text><Text style={{ fontSize: 14, color: COLORS.textSecondary }}>{fmt(unpaidSubtotal)}</Text></View>
          {discountAmount > 0 && <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, backgroundColor: '#f0fdf4', borderRadius: 6, paddingHorizontal: 8, marginVertical: 4 }}><Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.success }}>Descuento {discountType === 'percent' ? `(${discountValue}%)` : ''} {esMiercoles ? '· Miércoles' : ''}</Text><Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.success }}>-{fmt(discountAmount)}</Text></View>}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}><Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>TOTAL</Text><Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary }}>{fmt(unpaidTotal)}</Text></View>
          <Text style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 8 }}>Propina sugerida 10%: {fmt(Math.round(unpaidSubtotal * 0.1))}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <TouchableOpacity style={s.bC} onPress={() => { setPreCuentaModal(false); resetPayState(); }}><Text style={s.bCT}>✕ Cerrar</Text></TouchableOpacity>
            <TouchableOpacity style={[s.bOk, { backgroundColor: COLORS.warning }]} onPress={async () => { try { if (order) await supabase.from('orders').update({ discount_type: discountType, discount_value: discountAmount, subtotal: unpaidSubtotal, total: unpaidTotal }).eq('id', order.id); await supabase.from('tables').update({ status: 'cuenta' }).eq('id', table.id); const cajaIp = PRINTER_CONFIG.caja?.ip || PRINTER_CONFIG.barra?.ip; const cajaPort = PRINTER_CONFIG.caja?.port || PRINTER_CONFIG.barra?.port || 9100; if (cajaIp) { const printItems = payMode === 'partial' && selectedItems.length > 0 ? selectedItems : unpaidItems; const printSubtotal = printItems.reduce((a: number, i: any) => a + i.total_price, 0); const printDiscount = discountType === 'percent' ? Math.round(printItems.filter((i: any) => !(i.notes || '').includes('[PROMO]')).reduce((a: number, i: any) => a + i.total_price, 0) * (parseInt(discountValue) || 0) / 100) : discountType === 'fixed' ? (parseInt(discountValue) || 0) : 0; const printTotal = Math.max(0, printSubtotal - printDiscount); const ticket = generateBoleta({ table: table.number, waiter: waiterName || '', items: groupItemsForPrint(printItems), subtotal: printSubtotal, discount: printDiscount, discountLabel: discountType === 'percent' ? `Dcto (${discountValue}%)` : undefined, tip: Math.round(printTotal * 0.1), total: printTotal, payments: [], orderNumber: order?.order_number }); await sendToPrinter(cajaIp, cajaPort, ticket, 'caja'); } playClickPOS(); setPreCuentaModal(false); onBack(); } catch (e: any) { if (typeof window !== 'undefined') window.alert('Error: ' + e.message); } }}><Text style={s.bOkT}>🖨 {payMode === 'partial' && selectedItems.length > 0 ? `Imprimir (${selectedItems.length})` : 'Imprimir'}</Text></TouchableOpacity>
            {guestNames.length > 1 && <TouchableOpacity style={[s.bOk, { backgroundColor: COLORS.info }]} onPress={printByClient}><Text style={s.bOkT}>🖨 Por socio</Text></TouchableOpacity>}
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

      {/* TABLE ACTION MODAL */}
      <Modal visible={tableActionModal !== ''} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 20, width: '90%', maxWidth: 500, maxHeight: '70%' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 4 }}>
            {tableActionModal === 'move' ? 'Cambiar mesa' : tableActionModal === 'merge' ? 'Juntar con otra mesa' : 'Separar mesa'}
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
            {tableActionModal === 'move' ? 'Selecciona la mesa libre destino' : tableActionModal === 'merge' ? 'Selecciona la mesa ocupada a fusionar aquí' : 'Selecciona los productos a mover y la mesa destino'}
          </Text>

          {tableActionModal === 'split' && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>Productos a separar:</Text>
              <ScrollView style={{ maxHeight: 180, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8 }}>
                {orderItems.filter(i => !i.paid).map(i => (
                  <TouchableOpacity key={i.id} onPress={() => setSplitItems(prev => { const n = new Set(prev); n.has(i.id) ? n.delete(i.id) : n.add(i.id); return n; })}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: splitItems.has(i.id) ? COLORS.primary + '10' : 'transparent' }}>
                    <Text style={{ fontSize: 16, marginRight: 8 }}>{splitItems.has(i.id) ? '☑️' : '⬜'}</Text>
                    <Text style={{ flex: 1, fontSize: 13, color: COLORS.text }}>{i.quantity}x {i.product?.name}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textMuted }}>${i.total_price.toLocaleString('es-CL')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {splitItems.size > 0 && <Text style={{ fontSize: 11, color: COLORS.primary, marginTop: 4, fontWeight: '600' }}>{splitItems.size} producto{splitItems.size > 1 ? 's' : ''} seleccionado{splitItems.size > 1 ? 's' : ''}</Text>}
            </View>
          )}

          <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>
            {tableActionModal === 'move' ? 'Mesas libres:' : tableActionModal === 'merge' ? 'Mesas:' : 'Mesa destino (libre):'}
          </Text>
          <ScrollView style={{ maxHeight: 200 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {availableTables.filter(t => t.id !== table.id).filter(t => {
                if (tableActionModal === 'move') return t.status === 'libre';
                if (tableActionModal === 'split') return t.status === 'libre';
                return true; // merge: show all
              }).map(t => (
                <TouchableOpacity key={t.id} onPress={() => {
                  if (tableActionModal === 'move') moveToTable(t);
                  else if (tableActionModal === 'merge') { if (t.status !== 'libre') mergeFrom(t); }
                  else if (tableActionModal === 'split' && splitItems.size > 0) splitToTable(t);
                }} style={{ width: 80, height: 65, borderRadius: 8, backgroundColor: t.status === 'ocupada' || t.status === 'cuenta' ? COLORS.primary + '20' : COLORS.background, borderWidth: 2, borderColor: t.status === 'ocupada' || t.status === 'cuenta' ? COLORS.primary : COLORS.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text }}>{t.number}</Text>
                  <Text style={{ fontSize: 8, color: t.status === 'libre' ? COLORS.success : COLORS.primary, fontWeight: '600' }}>{t.status === 'libre' ? 'LIBRE' : 'OCUPADA'}</Text>
                  {t.order && <Text style={{ fontSize: 9, color: COLORS.textMuted }}>${(t.order.total || 0).toLocaleString('es-CL')}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <TouchableOpacity onPress={() => { setTableActionModal(''); setSplitItems(new Set()); }} style={{ marginTop: 12, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 24, borderRadius: 8, backgroundColor: COLORS.background }}>
            <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>Cancelar</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>

      {/* EDIT GUESTS MODAL */}
      <Modal visible={editGuestsModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 20, width: '90%', maxWidth: 400 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 16 }}>Comensales</Text>
          {guestNames.map((name, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary, width: 24 }}>{i + 1}.</Text>
              <TextInput style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.background }}
                value={name} placeholder={'Cliente ' + (i + 1)} placeholderTextColor={COLORS.textMuted}
                onChangeText={v => setGuestNames(prev => prev.map((n, j) => j === i ? v : n))} />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {guestNames.length < 5 && (
              <TouchableOpacity onPress={() => setGuestNames(prev => [...prev, ''])} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>+ Agregar</Text>
              </TouchableOpacity>
            )}
            {guestNames.length > 1 && (
              <TouchableOpacity onPress={() => setGuestNames(prev => prev.slice(0, -1))} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }}>
                <Text style={{ color: COLORS.textSecondary, fontWeight: '700' }}>- Quitar</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <TouchableOpacity onPress={() => setEditGuestsModal(false)} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.background, alignItems: 'center' }}>
              <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => saveGuestNames(guestNames)} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* EDITAR CLIENTE */}
      <Modal visible={editClientModal} transparent animationType="fade">
        <View style={s.ov}><View style={s.md}>
          <Text style={s.mdT}>Asignar Cliente</Text>
          <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4, marginBottom: 12 }}>Busca por nombre o teléfono del socio</Text>
          <TextInput
            style={{ backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text, marginBottom: 8 }}
            placeholder="Buscar socio o escribir nombre..."
            placeholderTextColor={COLORS.textMuted}
            value={editClientName}
            onChangeText={searchEditClient}
            autoFocus
          />
          {editClientSuggestions.length > 0 && (
            <View style={{ backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10, maxHeight: 200, overflow: 'hidden' }}>
              {editClientSuggestions.map((c: any) => (
                <TouchableOpacity key={c.id} onPress={() => { setEditSelectedClient(c); setEditClientName(c.name); setEditClientSuggestions([]); }}
                  style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.primary }}>#{c.member_number}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{c.name}</Text>
                    <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{c.phone || ''} {c.total_visits ? '· ' + c.total_visits + ' visitas' : ''}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {editSelectedClient && (
            <View style={{ backgroundColor: COLORS.primary + '10', borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: COLORS.primary + '30' }}>
              <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '600' }}>Socio #{editSelectedClient.member_number} · {editSelectedClient.name}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <TouchableOpacity style={s.bC} onPress={() => setEditClientModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={s.bOk} onPress={guardarEditCliente}><Text style={s.bOkT}>Guardar</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

function SecH({ color, title }: { color: string; title: string }) { return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} /><Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase' }}>{title}</Text></View>; }
function IR({ item, onRm, fmt, canRm, onPendingMod }: { item: any; onRm: (i: OrderItem) => void; fmt: (n: number) => string; canRm: boolean; onPendingMod?: (i: any) => void }) {
  const sc = !item.printed ? COLORS.warning : item.status === 'listo' ? COLORS.success : COLORS.info;
  const sl = !item.printed ? 'NUEVO' : item.status === 'preparando' ? 'PREPARANDO' : item.status === 'listo' ? 'LISTO' : 'ENVIADO';
  const usedMods = (item.item_modifiers || []).length;
  const maxMods = item.mod_max_select || 0;
  const pendingCount = maxMods > 0 ? maxMods - usedMods : 0;
  const modNames = (item.item_modifiers || []).map((m: any) => m.option_name).join(', ');
  const creatorName = item.creator?.name || (item.created_by === 'a0000000-0000-0000-0000-000000000099' ? 'App' : '');
  const hora = item.created_at ? new Date(item.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' }) : '';
  return <View style={s.ir}><View style={{ flex: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.primary, minWidth: 28 }}>{item.quantity}x</Text><Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text, flex: 1 }}>{item.product?.name}</Text></View>{modNames ? <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>{modNames}</Text> : null}{item.notes ? <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>📝 {item.notes}</Text> : null}<View style={{ flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'center' }}><View style={{ alignSelf: 'flex-start', backgroundColor: sc + '25', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 10, fontWeight: '700', color: sc }}>{sl}</Text></View>{pendingCount > 0 && <TouchableOpacity onPress={() => onPendingMod?.(item)} style={{ alignSelf: 'flex-start', backgroundColor: COLORS.warning + '25', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.warning }}>🍺 {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}</Text></TouchableOpacity>}<Text style={{ fontSize: 10, color: COLORS.textMuted }}>{creatorName}{creatorName && hora ? ' · ' : ''}{hora}</Text></View></View><View style={{ alignItems: 'flex-end', gap: 6 }}><Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>{fmt(item.total_price)}</Text>{canRm && <TouchableOpacity onPress={() => onRm(item)}><Text style={{ fontSize: 14 }}>🗑</Text></TouchableOpacity>}</View></View>;
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
