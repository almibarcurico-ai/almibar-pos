// DeliveryScreen.tsx — Almíbar POS Delivery Module v1
// Kanban board + order detail + counter sales + Fudo-style close
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────
type Source = 'app' | 'mostrador' | 'whatsapp' | 'telefono';
type Status =
  | 'pendiente' | 'aceptado' | 'rechazado'
  | 'en_preparacion' | 'listo' | 'en_camino'
  | 'entregado' | 'cancelado';

interface OrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes: string;
}

interface Payment {
  id: string;
  method: string;
  amount: number;
  is_tip: boolean;
}

interface Tip {
  id: string;
  method: string;
  amount: number;
}

interface DeliveryOrder {
  id: string;
  order_number: number;
  source: Source;
  status: Status;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_notes: string;
  cajero_id: string | null;
  cajero_name: string;
  repartidor_id: string | null;
  repartidor_name: string;
  subtotal: number;
  discount: number;
  total: number;
  tip_total: number;
  delivery_fee: number;
  created_at: string;
  accepted_at: string | null;
  rejected_at: string | null;
  preparation_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  closed_at: string | null;
  reject_reason: string | null;
  external_order_id: string | null;
  notes: string;
  items?: OrderItem[];
  payments?: Payment[];
  tips?: Tip[];
}

interface Product {
  id: string;
  name: string;
  price: number;
  category_id: string;
}

interface User {
  id: string;
  name: string;
  role: string;
}

// ─── Constants ────────────────────────────────────────────────
const METHODS = ['efectivo', 'debito', 'credito', 'transferencia', 'mercadopago'] as const;
const METHOD_LABELS: Record<string, string> = {
  efectivo: '💵 Efectivo',
  debito: '💳 Débito',
  credito: '💳 Crédito',
  transferencia: '🏦 Transfer.',
  mercadopago: '📱 M.Pago',
};
const SOURCE_LABELS: Record<Source, string> = {
  app: '📱 App',
  mostrador: '🏪 Mostrador',
  whatsapp: '💬 WhatsApp',
  telefono: '📞 Teléfono',
};
const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string; icon: string }> = {
  pendiente:       { label: 'Pendiente',       color: '#f59e0b', bg: '#fef3c7', icon: '🔔' },
  aceptado:        { label: 'Aceptado',        color: '#3b82f6', bg: '#dbeafe', icon: '✅' },
  rechazado:       { label: 'Rechazado',       color: '#ef4444', bg: '#fee2e2', icon: '❌' },
  en_preparacion:  { label: 'En Preparación',  color: '#f97316', bg: '#ffedd5', icon: '🔥' },
  listo:           { label: 'Listo',           color: '#8b5cf6', bg: '#ede9fe', icon: '📦' },
  en_camino:       { label: 'En Camino',       color: '#06b6d4', bg: '#cffafe', icon: '🛵' },
  entregado:       { label: 'Entregado',       color: '#10b981', bg: '#d1fae5', icon: '✔️' },
  cancelado:       { label: 'Cancelado',       color: '#6b7280', bg: '#f3f4f6', icon: '🚫' },
};

// Active statuses shown as kanban columns
const KANBAN_STATUSES: Status[] = ['pendiente', 'aceptado', 'en_preparacion', 'listo', 'en_camino'];

// ─── Helper: format CLP ───────────────────────────────────────
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
};
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
};
const elapsed = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

// ─── Audio notification ───────────────────────────────────────
const playNotification = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Three-tone chime
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.4);
    });
  } catch {}
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function DeliveryScreen({ user }: { user: User }) {
  // ─── State ────────────────────────────────────────────────
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDelivered, setShowDelivered] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Audio ref for tracking known order IDs
  const knownIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  // ─── Load data ────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('delivery_orders')
      .select('*')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Check for new pending orders (notification)
      if (!isFirstLoad.current) {
        const newPending = data.filter(
          (o: any) => o.status === 'pendiente' && !knownIds.current.has(o.id)
        );
        if (newPending.length > 0) playNotification();
      }
      isFirstLoad.current = false;

      data.forEach((o: any) => knownIds.current.add(o.id));
      setOrders(data as DeliveryOrder[]);
    }
    setLoading(false);
  }, []);

  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name, price, category_id')
      .eq('active', true)
      .order('category_id')
      .order('name');
    if (data) setProducts(data as Product[]);
  }, []);

  const loadUsers = useCallback(async () => {
    const { data } = await supabase
      .from('users')
      .select('id, name, role')
      .in('role', ['repartidor', 'cajero', 'admin']);
    if (data) setUsers(data as User[]);
  }, []);

  useEffect(() => {
    loadOrders();
    loadProducts();
    loadUsers();
  }, [loadOrders, loadProducts, loadUsers]);

  // ─── Realtime subscription ────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('delivery-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_orders' },
        () => loadOrders()
      )
      .subscribe();

    // Also poll every 15s as backup
    const interval = setInterval(loadOrders, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [loadOrders]);

  // ─── Selected order with items ────────────────────────────
  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) || null,
    [orders, selectedId]
  );

  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [selectedPayments, setSelectedPayments] = useState<Payment[]>([]);
  const [selectedTips, setSelectedTips] = useState<Tip[]>([]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedItems([]);
      setSelectedPayments([]);
      setSelectedTips([]);
      return;
    }
    (async () => {
      const [itemsRes, paysRes, tipsRes] = await Promise.all([
        supabase.from('delivery_order_items').select('*').eq('order_id', selectedId),
        supabase.from('delivery_payments').select('*').eq('order_id', selectedId),
        supabase.from('delivery_tips').select('*').eq('order_id', selectedId),
      ]);
      if (itemsRes.data) setSelectedItems(itemsRes.data as OrderItem[]);
      if (paysRes.data) setSelectedPayments(paysRes.data as Payment[]);
      if (tipsRes.data) setSelectedTips(tipsRes.data as Tip[]);
    })();
  }, [selectedId, orders]);

  // ─── Status transitions ───────────────────────────────────
  const updateStatus = async (orderId: string, newStatus: Status, extra: Record<string, any> = {}) => {
    const timestampField: Record<string, string> = {
      aceptado: 'accepted_at',
      rechazado: 'rejected_at',
      en_preparacion: 'preparation_at',
      listo: 'ready_at',
      en_camino: 'dispatched_at',
      entregado: 'delivered_at',
      cancelado: 'cancelled_at',
    };

    const update: Record<string, any> = {
      status: newStatus,
      ...extra,
    };
    if (timestampField[newStatus]) {
      update[timestampField[newStatus]] = new Date().toISOString();
    }
    if (newStatus === 'aceptado') {
      update.cajero_id = user.id;
      update.cajero_name = user.name;
    }

    await supabase.from('delivery_orders').update(update).eq('id', orderId);
    loadOrders();
  };

  // ─── Assign repartidor ────────────────────────────────────
  const assignRepartidor = async (orderId: string, rep: User) => {
    await supabase.from('delivery_orders').update({
      repartidor_id: rep.id,
      repartidor_name: rep.name,
    }).eq('id', orderId);
    loadOrders();
  };

  // ─── Counts per status ────────────────────────────────────
  const countByStatus = (s: Status) => orders.filter((o) => o.status === s).length;
  const deliveredToday = orders.filter((o) => o.status === 'entregado');
  const cancelledToday = orders.filter((o) => ['rechazado', 'cancelado'].includes(o.status));

  // ─── Styles ───────────────────────────────────────────────
  const S = {
    screen: {
      display: 'flex', flexDirection: 'column' as const, height: '100%',
      background: '#F0F0F0', color: '#e2e8f0', fontFamily: "'Inter', system-ui, sans-serif",
    },
    topBar: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', background: '#FFFFFF', borderBottom: '1px solid #334155',
    },
    topTitle: { fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 },
    topBtns: { display: 'flex', gap: 8 },
    btn: (bg: string, fg = '#fff') => ({
      padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
      fontWeight: 600, fontSize: 13, background: bg, color: fg,
      display: 'flex', alignItems: 'center', gap: 6,
    }),
    btnSm: (bg: string, fg = '#fff') => ({
      padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
      fontWeight: 600, fontSize: 12, background: bg, color: fg,
    }),
    body: {
      display: 'flex', flex: 1, overflow: 'hidden',
    },
    kanban: {
      display: 'flex', flex: 1, overflow: 'auto', gap: 2, padding: 8,
    },
    column: {
      flex: 1, minWidth: 220, maxWidth: 320, display: 'flex', flexDirection: 'column' as const,
      background: '#FFFFFF', borderRadius: 10, overflow: 'hidden',
    },
    colHeader: (color: string) => ({
      padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `2px solid ${color}`, background: '#FFFFFF',
    }),
    colTitle: (color: string) => ({
      fontSize: 13, fontWeight: 700, color, display: 'flex', alignItems: 'center', gap: 6,
    }),
    colCount: (color: string) => ({
      fontSize: 11, fontWeight: 700, color: '#1e293b', background: color,
      borderRadius: 10, padding: '2px 8px', minWidth: 20, textAlign: 'center' as const,
    }),
    colBody: {
      flex: 1, overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column' as const, gap: 6,
    },
    card: (isSelected: boolean, borderColor: string) => ({
      padding: 10, borderRadius: 8, cursor: 'pointer',
      background: isSelected ? '#334155' : '#0f172a',
      border: `1px solid ${isSelected ? borderColor : '#334155'}`,
      transition: 'all 0.15s',
    }),
    cardNum: { fontSize: 15, fontWeight: 700, color: '#f8fafc' },
    cardSrc: (bg: string) => ({
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: bg, color: '#1e293b', display: 'inline-block',
    }),
    cardCustomer: { fontSize: 12, color: '#999999', marginTop: 4 },
    cardTotal: { fontSize: 14, fontWeight: 700, color: '#f8fafc', marginTop: 4 },
    cardTime: { fontSize: 11, color: '#64748b', marginTop: 2 },
    // Detail panel
    detail: {
      width: 420, minWidth: 380, borderLeft: '1px solid #334155',
      display: 'flex', flexDirection: 'column' as const, background: '#FFFFFF',
      overflow: 'auto',
    },
    detailHeader: {
      padding: '16px', borderBottom: '1px solid #334155',
    },
    detailSection: {
      padding: '12px 16px', borderBottom: '1px solid #1e293b',
    },
    itemRow: {
      display: 'flex', justifyContent: 'space-between', padding: '4px 0',
      fontSize: 13, color: '#e2e8f0',
    },
    badge: (bg: string, fg: string) => ({
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
      background: bg, color: fg,
    }),
    // Modal overlay
    overlay: {
      position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    },
    modal: {
      background: '#FFFFFF', borderRadius: 12, padding: 0, width: 560,
      maxHeight: '90vh', overflow: 'auto', border: '1px solid #334155',
    },
    modalHeader: {
      padding: '16px 20px', borderBottom: '1px solid #334155',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    },
    modalBody: { padding: '16px 20px' },
    input: {
      width: '100%', padding: '8px 12px', borderRadius: 6,
      border: '1px solid #475569', background: '#F0F0F0', color: '#e2e8f0',
      fontSize: 13, outline: 'none', boxSizing: 'border-box' as const,
    },
    select: {
      padding: '8px 12px', borderRadius: 6, border: '1px solid #475569',
      background: '#F0F0F0', color: '#e2e8f0', fontSize: 13, outline: 'none',
    },
    label: { fontSize: 12, fontWeight: 600, color: '#999999', marginBottom: 4, display: 'block' },
    row: { display: 'flex', gap: 8, marginBottom: 10 },
    flex1: { flex: 1 },
    // Close modal sections
    sectionTitle: {
      fontSize: 13, fontWeight: 700, color: '#999999', padding: '8px 0',
      textTransform: 'uppercase' as const, letterSpacing: 1,
    },
    payRow: {
      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0',
      borderBottom: '1px solid #1e293b',
    },
  };

  // ═════════════════════════════════════════════════════════════
  // NEW ORDER MODAL (MOSTRADOR / MANUAL)
  // ═════════════════════════════════════════════════════════════
  const NewOrderModal = () => {
    const [source, setSource] = useState<Source>('mostrador');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [notes, setNotes] = useState('');
    const [delivFee, setDelivFee] = useState(0);
    const [cart, setCart] = useState<{ product: Product; qty: number; notes: string }[]>([]);
    const [search, setSearch] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);

    const filtered = products.filter(
      (p) => p.name.toLowerCase().includes(search.toLowerCase())
    );

    const addToCart = (p: Product) => {
      setCart((prev) => {
        const idx = prev.findIndex((c) => c.product.id === p.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
          return next;
        }
        return [...prev, { product: p, qty: 1, notes: '' }];
      });
      setSearch('');
      searchRef.current?.focus();
    };

    const updateQty = (idx: number, delta: number) => {
      setCart((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: Math.max(0, next[idx].qty + delta) };
        return next.filter((c) => c.qty > 0);
      });
    };

    const updateItemNotes = (idx: number, n: string) => {
      setCart((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], notes: n };
        return next;
      });
    };

    const cartTotal = cart.reduce((s, c) => s + c.product.price * c.qty, 0);
    const grandTotal = cartTotal + delivFee;

    const handleCreate = async () => {
      if (cart.length === 0) return;

      // Create order
      const { data: order, error } = await supabase
        .from('delivery_orders')
        .insert({
          source,
          status: source === 'mostrador' ? 'aceptado' : 'pendiente',
          customer_name: name || (source === 'mostrador' ? 'Mostrador' : ''),
          customer_phone: phone,
          customer_address: address,
          customer_notes: notes,
          cajero_id: user.id,
          cajero_name: user.name,
          subtotal: cartTotal,
          total: grandTotal,
          delivery_fee: delivFee,
          accepted_at: source === 'mostrador' ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (error || !order) return;

      // Insert items
      const items = cart.map((c) => ({
        order_id: order.id,
        product_id: c.product.id,
        product_name: c.product.name,
        quantity: c.qty,
        unit_price: c.product.price,
        subtotal: c.product.price * c.qty,
        notes: c.notes,
      }));

      await supabase.from('delivery_order_items').insert(items);
      setShowNewOrder(false);
      setSelectedId(order.id);
      loadOrders();
    };

    return (
      <div style={S.overlay} onClick={() => setShowNewOrder(false)}>
        <div style={{ ...S.modal, width: 620 }} onClick={(e) => e.stopPropagation()}>
          <div style={S.modalHeader}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>🛵 Nuevo Pedido</span>
            <button style={S.btnSm('#999999')} onClick={() => setShowNewOrder(false)}>✕</button>
          </div>
          <div style={S.modalBody}>
            {/* Source selector */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
                <button
                  key={s}
                  style={{
                    ...S.btnSm(source === s ? '#3b82f6' : '#334155'),
                    padding: '6px 12px',
                  }}
                  onClick={() => setSource(s)}
                >
                  {SOURCE_LABELS[s]}
                </button>
              ))}
            </div>

            {/* Customer info */}
            {source !== 'mostrador' && (
              <>
                <div style={S.row}>
                  <div style={S.flex1}>
                    <label style={S.label}>Cliente</label>
                    <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
                  </div>
                  <div style={S.flex1}>
                    <label style={S.label}>Teléfono</label>
                    <input style={S.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+56 9 ..." />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={S.label}>Dirección</label>
                  <input style={S.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, depto..." />
                </div>
                <div style={S.row}>
                  <div style={S.flex1}>
                    <label style={S.label}>Notas</label>
                    <input style={S.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sin cebolla, etc." />
                  </div>
                  <div style={{ width: 120 }}>
                    <label style={S.label}>Despacho $</label>
                    <input
                      style={S.input}
                      type="number"
                      value={delivFee || ''}
                      onChange={(e) => setDelivFee(Number(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Product search & add */}
            <label style={{ ...S.label, marginTop: 8 }}>Agregar productos</label>
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <input
                ref={searchRef}
                style={S.input}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Buscar producto..."
              />
              {search && filtered.length > 0 && (
                <div
                  style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    background: '#F0F0F0', border: '1px solid #475569', borderRadius: 6,
                    maxHeight: 200, overflow: 'auto',
                  }}
                >
                  {filtered.slice(0, 10).map((p) => (
                    <div
                      key={p.id}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                        display: 'flex', justifyContent: 'space-between',
                        borderBottom: '1px solid #1e293b',
                      }}
                      onClick={() => addToCart(p)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#334155')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span>{p.name}</span>
                      <span style={{ color: '#999999' }}>{fmt(p.price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart */}
            <div style={{ maxHeight: 250, overflow: 'auto' }}>
              {cart.map((c, i) => (
                <div key={c.product.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0',
                  borderBottom: '1px solid #334155',
                }}>
                  <button style={S.btnSm('#E0E0E0')} onClick={() => updateQty(i, -1)}>−</button>
                  <span style={{ fontSize: 14, fontWeight: 700, width: 24, textAlign: 'center' }}>{c.qty}</span>
                  <button style={S.btnSm('#E0E0E0')} onClick={() => updateQty(i, 1)}>+</button>
                  <span style={{ flex: 1, fontSize: 13 }}>{c.product.name}</span>
                  <input
                    style={{ ...S.input, width: 100, padding: '4px 8px', fontSize: 11 }}
                    value={c.notes}
                    onChange={(e) => updateItemNotes(i, e.target.value)}
                    placeholder="💬 nota"
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                    {fmt(c.product.price * c.qty)}
                  </span>
                  <button style={S.btnSm('#E53935')} onClick={() => updateQty(i, -c.qty)}>✕</button>
                </div>
              ))}
            </div>

            {/* Totals */}
            {cart.length > 0 && (
              <div style={{ marginTop: 12, padding: '10px', background: '#F0F0F0', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Subtotal</span><span>{fmt(cartTotal)}</span>
                </div>
                {delivFee > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#999999' }}>
                    <span>Despacho</span><span>{fmt(delivFee)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                  <span>TOTAL</span><span>{fmt(grandTotal)}</span>
                </div>
              </div>
            )}

            {/* Create button */}
            <button
              style={{
                ...S.btn(cart.length > 0 ? '#10b981' : '#475569'),
                width: '100%', justifyContent: 'center', marginTop: 12, padding: '12px',
                opacity: cart.length > 0 ? 1 : 0.5,
              }}
              disabled={cart.length === 0}
              onClick={handleCreate}
            >
              {source === 'mostrador' ? '✅ Crear Pedido Mostrador' : '📩 Crear Pedido'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════
  // REJECT MODAL
  // ═════════════════════════════════════════════════════════════
  const RejectModal = () => (
    <div style={S.overlay} onClick={() => setShowRejectModal(false)}>
      <div style={{ ...S.modal, width: 400 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHeader}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>❌ Rechazar Pedido</span>
          <button style={S.btnSm('#999999')} onClick={() => setShowRejectModal(false)}>✕</button>
        </div>
        <div style={S.modalBody}>
          <label style={S.label}>Motivo del rechazo</label>
          <textarea
            style={{ ...S.input, height: 80, resize: 'vertical' }}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ej: Producto no disponible, fuera de horario..."
          />
          <button
            style={{ ...S.btn('#ef4444'), width: '100%', justifyContent: 'center', marginTop: 12 }}
            onClick={async () => {
              if (selectedId) {
                await updateStatus(selectedId, 'rechazado', { reject_reason: rejectReason });
                setShowRejectModal(false);
                setRejectReason('');
              }
            }}
          >
            Confirmar Rechazo
          </button>
        </div>
      </div>
    </div>
  );

  // ═════════════════════════════════════════════════════════════
  // CLOSE ORDER MODAL (Fudo-style: Items + Propina + Pago)
  // ═════════════════════════════════════════════════════════════
  const CloseModal = () => {
    const [tips, setTips] = useState<{ method: string; amount: number }[]>([]);
    const [payments, setPayments] = useState<{ method: string; amount: number }[]>([]);
    const [discount, setDiscount] = useState(selected?.discount || 0);

    if (!selected) return null;

    const itemsTotal = selectedItems.reduce((s, i) => s + i.subtotal, 0);
    const delivFee = selected.delivery_fee || 0;
    const consumo = itemsTotal + delivFee - discount;
    const totalTips = tips.reduce((s, t) => s + t.amount, 0);
    const totalPayments = payments.reduce((s, p) => s + p.amount, 0);
    const remaining = consumo - totalPayments;
    const canClose = remaining <= 0;

    // Cash change logic
    const cashPayments = payments.filter((p) => p.method === 'efectivo');
    const nonCashPayments = payments.filter((p) => p.method !== 'efectivo');
    const cashTotal = cashPayments.reduce((s, p) => s + p.amount, 0);
    const nonCashTotal = nonCashPayments.reduce((s, p) => s + p.amount, 0);
    const excessCash = Math.max(0, totalPayments - consumo);
    const excessNonCash = Math.max(0, nonCashTotal - (consumo - cashTotal));

    const addTip = () => setTips([...tips, { method: 'efectivo', amount: 0 }]);
    const addPayment = () => setPayments([...payments, { method: 'efectivo', amount: 0 }]);

    const cycleTipMethod = (idx: number) => {
      setTips((prev) => {
        const next = [...prev];
        const ci = METHODS.indexOf(next[idx].method as any);
        next[idx] = { ...next[idx], method: METHODS[(ci + 1) % METHODS.length] };
        return next;
      });
    };

    const cyclePayMethod = (idx: number) => {
      setPayments((prev) => {
        const next = [...prev];
        const ci = METHODS.indexOf(next[idx].method as any);
        next[idx] = { ...next[idx], method: METHODS[(ci + 1) % METHODS.length] };
        return next;
      });
    };

    const handleClose = async () => {
      if (!canClose || !selected) return;

      // Save payments
      if (payments.length > 0) {
        await supabase.from('delivery_payments').insert(
          payments.filter((p) => p.amount > 0).map((p) => ({
            order_id: selected.id,
            method: p.method,
            amount: p.amount,
            is_tip: false,
          }))
        );
      }

      // Save tips (explicit + auto-excess from non-cash)
      const allTips = [...tips.filter((t) => t.amount > 0)];
      if (excessNonCash > 0) {
        // Auto-add non-cash excess as tip
        const mainNonCash = nonCashPayments[0];
        if (mainNonCash) {
          allTips.push({ method: mainNonCash.method, amount: excessNonCash });
        }
      }
      if (allTips.length > 0) {
        await supabase.from('delivery_tips').insert(
          allTips.map((t) => ({
            order_id: selected.id,
            method: t.method,
            amount: t.amount,
          }))
        );
      }

      // Update order totals and close
      await supabase.from('delivery_orders').update({
        status: 'entregado',
        subtotal: itemsTotal,
        discount,
        total: consumo,
        tip_total: allTips.reduce((s, t) => s + t.amount, 0),
        delivered_at: selected.delivered_at || new Date().toISOString(),
        closed_at: new Date().toISOString(),
      }).eq('id', selected.id);

      setShowCloseModal(false);
      loadOrders();
    };

    return (
      <div style={S.overlay} onClick={() => setShowCloseModal(false)}>
        <div style={{ ...S.modal, width: 540 }} onClick={(e) => e.stopPropagation()}>
          <div style={S.modalHeader}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>
              💰 Cerrar Pedido #{selected.order_number}
            </span>
            <button style={S.btnSm('#999999')} onClick={() => setShowCloseModal(false)}>✕</button>
          </div>
          <div style={S.modalBody}>
            {/* ── ADICIONES (items resumen) ── */}
            <div style={S.sectionTitle}>CONSUMO</div>
            <div style={{ background: '#F0F0F0', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              {selectedItems.map((item) => (
                <div key={item.id} style={S.itemRow}>
                  <span>{item.quantity}x {item.product_name}</span>
                  <span style={{ fontWeight: 600 }}>{fmt(item.subtotal)}</span>
                </div>
              ))}
              {delivFee > 0 && (
                <div style={{ ...S.itemRow, color: '#999999' }}>
                  <span>🛵 Despacho</span>
                  <span>{fmt(delivFee)}</span>
                </div>
              )}
              {/* Discount */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, borderTop: '1px solid #E0E0E0', paddingTop: 6 }}>
                <span style={{ fontSize: 12, color: '#999999' }}>Descuento</span>
                <input
                  style={{ ...S.input, width: 80, padding: '4px 8px', textAlign: 'right' }}
                  type="number"
                  value={discount || ''}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                />
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 16, fontWeight: 700 }}>Total: {fmt(consumo)}</span>
              </div>
            </div>

            {/* ── PROPINA ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={S.sectionTitle}>PROPINA</div>
              <button style={S.btnSm('#E8562A')} onClick={addTip}>+ Propina</button>
            </div>
            {tips.map((t, i) => (
              <div key={i} style={S.payRow}>
                <button
                  style={S.btnSm('#E0E0E0')}
                  onClick={() => cycleTipMethod(i)}
                  title="Click para cambiar método"
                >
                  {METHOD_LABELS[t.method]}
                </button>
                <input
                  style={{ ...S.input, width: 100, padding: '4px 8px', textAlign: 'right' }}
                  type="number"
                  value={t.amount || ''}
                  onChange={(e) => {
                    const next = [...tips];
                    next[i] = { ...next[i], amount: Number(e.target.value) || 0 };
                    setTips(next);
                  }}
                  placeholder="$0"
                />
                <button
                  style={S.btnSm('#E53935')}
                  onClick={() => setTips(tips.filter((_, j) => j !== i))}
                >✕</button>
              </div>
            ))}
            {totalTips > 0 && (
              <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#E8562A', margin: '4px 0' }}>
                Total propinas: {fmt(totalTips)}
              </div>
            )}

            {/* ── PAGO ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <div style={S.sectionTitle}>PAGO</div>
              <button style={S.btnSm('#42A5F5')} onClick={addPayment}>+ Pago</button>
            </div>
            {payments.map((p, i) => (
              <div key={i} style={S.payRow}>
                <button
                  style={S.btnSm('#E0E0E0')}
                  onClick={() => cyclePayMethod(i)}
                  title="Click para cambiar método"
                >
                  {METHOD_LABELS[p.method]}
                </button>
                <input
                  style={{ ...S.input, width: 100, padding: '4px 8px', textAlign: 'right' }}
                  type="number"
                  value={p.amount || ''}
                  onChange={(e) => {
                    const next = [...payments];
                    next[i] = { ...next[i], amount: Number(e.target.value) || 0 };
                    setPayments(next);
                  }}
                  placeholder="$0"
                />
                <button
                  style={S.btnSm('#E53935')}
                  onClick={() => setPayments(payments.filter((_, j) => j !== i))}
                >✕</button>
              </div>
            ))}

            {/* Pago summary */}
            <div style={{
              marginTop: 8, padding: 10, background: '#F0F0F0', borderRadius: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>Consumo</span><span>{fmt(consumo)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>Pagado</span><span style={{ color: totalPayments >= consumo ? '#10b981' : '#f59e0b' }}>{fmt(totalPayments)}</span>
              </div>
              {remaining > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                  <span>Falta</span><span>{fmt(remaining)}</span>
                </div>
              )}
              {excessCash > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginTop: 4 }}>
                  <span>Vuelto efectivo: <b>{fmt(excessCash)}</b></span>
                  <button
                    style={S.btnSm('#E8562A')}
                    onClick={() => {
                      setTips([...tips, { method: 'efectivo', amount: excessCash }]);
                    }}
                  >
                    Sumar a propina
                  </button>
                </div>
              )}
              {excessNonCash > 0 && (
                <div style={{ fontSize: 11, color: '#999999', marginTop: 4 }}>
                  💡 Exceso no-efectivo ({fmt(excessNonCash)}) se suma automáticamente a propina
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              style={{
                ...S.btn(canClose ? '#4CAF50' : '#CCCCCC'),
                width: '100%', justifyContent: 'center', marginTop: 12, padding: '14px',
                fontSize: 15, opacity: canClose ? 1 : 0.5,
              }}
              disabled={!canClose}
              onClick={handleClose}
            >
              ✅ Cerrar Pedido
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════
  // DELIVERED TODAY LIST
  // ═════════════════════════════════════════════════════════════
  const DeliveredModal = () => {
    const all = [...deliveredToday, ...cancelledToday].sort(
      (a, b) => new Date(b.delivered_at || b.rejected_at || b.created_at).getTime() -
                new Date(a.delivered_at || a.rejected_at || a.created_at).getTime()
    );
    const totalVentas = deliveredToday.reduce((s, o) => s + o.total, 0);
    const totalTips = deliveredToday.reduce((s, o) => s + o.tip_total, 0);

    return (
      <div style={S.overlay} onClick={() => setShowDelivered(false)}>
        <div style={{ ...S.modal, width: 600 }} onClick={(e) => e.stopPropagation()}>
          <div style={S.modalHeader}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>
              📋 Pedidos Cerrados Hoy ({all.length})
            </span>
            <button style={S.btnSm('#999999')} onClick={() => setShowDelivered(false)}>✕</button>
          </div>
          <div style={S.modalBody}>
            {/* Summary bar */}
            <div style={{
              display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap',
            }}>
              <div style={S.badge('#10b981', '#fff')}>
                ✔️ Entregados: {deliveredToday.length}
              </div>
              <div style={S.badge('#ef4444', '#fff')}>
                ❌ Rechazados/Cancelados: {cancelledToday.length}
              </div>
              <div style={S.badge('#3b82f6', '#fff')}>
                💰 Ventas: {fmt(totalVentas)}
              </div>
              <div style={S.badge('#8b5cf6', '#fff')}>
                🤑 Propinas: {fmt(totalTips)}
              </div>
            </div>

            {/* Table */}
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #334155', textAlign: 'left' }}>
                    <th style={{ padding: 6 }}>#</th>
                    <th style={{ padding: 6 }}>Hora</th>
                    <th style={{ padding: 6 }}>Origen</th>
                    <th style={{ padding: 6 }}>Cliente</th>
                    <th style={{ padding: 6, textAlign: 'right' }}>Total</th>
                    <th style={{ padding: 6, textAlign: 'right' }}>Propina</th>
                    <th style={{ padding: 6 }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((o) => {
                    const sc = STATUS_CONFIG[o.status];
                    return (
                      <tr
                        key={o.id}
                        style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer' }}
                        onClick={() => { setSelectedId(o.id); setShowDelivered(false); }}
                      >
                        <td style={{ padding: 6, fontWeight: 700 }}>{o.order_number}</td>
                        <td style={{ padding: 6, color: '#999999' }}>{fmtTime(o.created_at)}</td>
                        <td style={{ padding: 6 }}>{SOURCE_LABELS[o.source]}</td>
                        <td style={{ padding: 6 }}>{o.customer_name || '—'}</td>
                        <td style={{ padding: 6, textAlign: 'right', fontWeight: 600 }}>{fmt(o.total)}</td>
                        <td style={{ padding: 6, textAlign: 'right', color: '#E8562A' }}>
                          {o.tip_total > 0 ? fmt(o.tip_total) : '—'}
                        </td>
                        <td style={{ padding: 6 }}>
                          <span style={S.badge(sc.bg, sc.color)}>{sc.icon} {sc.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════
  // ACTION BUTTONS for detail panel based on status
  // ═════════════════════════════════════════════════════════════
  const StatusActions = () => {
    if (!selected) return null;
    const repartidores = users.filter((u) => u.role === 'repartidor' || u.role === 'admin');

    switch (selected.status) {
      case 'pendiente':
        return (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btn('#10b981')} onClick={() => updateStatus(selected.id, 'aceptado')}>
              ✅ Aceptar
            </button>
            <button style={S.btn('#ef4444')} onClick={() => setShowRejectModal(true)}>
              ❌ Rechazar
            </button>
          </div>
        );
      case 'aceptado':
        return (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btn('#f97316')} onClick={() => updateStatus(selected.id, 'en_preparacion')}>
              🔥 A Cocina
            </button>
            <button style={S.btn('#475569')} onClick={() => setShowRejectModal(true)}>
              🚫 Cancelar
            </button>
          </div>
        );
      case 'en_preparacion':
        return (
          <button style={S.btn('#8b5cf6')} onClick={() => updateStatus(selected.id, 'listo')}>
            📦 Listo para Despacho
          </button>
        );
      case 'listo':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!selected.repartidor_name && (
              <div>
                <label style={S.label}>Asignar repartidor</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {repartidores.map((r) => (
                    <button
                      key={r.id}
                      style={S.btnSm('#E0E0E0')}
                      onClick={() => assignRepartidor(selected.id, r)}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              style={S.btn('#06b6d4')}
              onClick={() => updateStatus(selected.id, 'en_camino')}
            >
              🛵 Despachar {selected.repartidor_name ? `(${selected.repartidor_name})` : ''}
            </button>
          </div>
        );
      case 'en_camino':
        return (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={S.btn('#10b981')}
              onClick={() => {
                updateStatus(selected.id, 'entregado');
                // If source is mostrador, auto-close. Otherwise open close modal.
                if (selected.source === 'mostrador') {
                  // For mostrador, might already be paid
                }
                setShowCloseModal(true);
              }}
            >
              ✔️ Confirmar Entrega y Cerrar
            </button>
          </div>
        );
      case 'entregado':
        return (
          <div style={S.badge('#10b981', '#fff')}>✔️ Pedido cerrado</div>
        );
      case 'rechazado':
      case 'cancelado':
        return (
          <div style={S.badge('#ef4444', '#fff')}>
            {STATUS_CONFIG[selected.status].icon} {STATUS_CONFIG[selected.status].label}
            {selected.reject_reason && ` — ${selected.reject_reason}`}
          </div>
        );
      default:
        return null;
    }
  };

  // ═════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════
  return (
    <div style={S.screen}>
      {/* ─── TOP BAR ─── */}
      <div style={S.topBar}>
        <div style={S.topTitle}>
          🛵 Delivery
          {countByStatus('pendiente') > 0 && (
            <span style={{
              background: '#ef4444', color: '#fff', borderRadius: '50%',
              width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, animation: 'pulse 1.5s infinite',
            }}>
              {countByStatus('pendiente')}
            </span>
          )}
        </div>
        <div style={S.topBtns}>
          <button style={S.btn('#3b82f6')} onClick={() => setShowNewOrder(true)}>
            ➕ Nuevo Pedido
          </button>
          <button style={S.btn('#334155')} onClick={() => setShowDelivered(true)}>
            📋 Cerrados ({deliveredToday.length + cancelledToday.length})
          </button>
          <button style={S.btn('#334155')} onClick={loadOrders}>
            🔄
          </button>
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
      `}</style>

      {/* ─── BODY: Kanban + Detail ─── */}
      <div style={S.body}>
        {/* Kanban columns */}
        <div style={S.kanban}>
          {KANBAN_STATUSES.map((status) => {
            const cfg = STATUS_CONFIG[status];
            const colOrders = orders.filter((o) => o.status === status);

            return (
              <div key={status} style={S.column}>
                <div style={S.colHeader(cfg.color)}>
                  <div style={S.colTitle(cfg.color)}>{cfg.icon} {cfg.label}</div>
                  <div style={S.colCount(cfg.color)}>{colOrders.length}</div>
                </div>
                <div style={S.colBody}>
                  {colOrders.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: 20 }}>
                      Sin pedidos
                    </div>
                  )}
                  {colOrders.map((order) => (
                    <div
                      key={order.id}
                      style={S.card(selectedId === order.id, cfg.color)}
                      onClick={() => setSelectedId(order.id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={S.cardNum}>#{order.order_number}</span>
                        <span style={S.cardSrc(cfg.bg)}>{SOURCE_LABELS[order.source]}</span>
                      </div>
                      {order.customer_name && (
                        <div style={S.cardCustomer}>
                          👤 {order.customer_name}
                          {order.customer_address && <span> — 📍 {order.customer_address}</span>}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <span style={S.cardTotal}>{fmt(order.total || order.subtotal)}</span>
                        <span style={S.cardTime}>⏱ {elapsed(order.created_at)}</span>
                      </div>
                      {order.repartidor_name && (
                        <div style={{ fontSize: 11, color: '#999999', marginTop: 2 }}>
                          🛵 {order.repartidor_name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── DETAIL PANEL ─── */}
        {selected ? (
          <div style={S.detail}>
            <div style={S.detailHeader}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    Pedido #{selected.order_number}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <span style={S.badge(STATUS_CONFIG[selected.status].bg, STATUS_CONFIG[selected.status].color)}>
                      {STATUS_CONFIG[selected.status].icon} {STATUS_CONFIG[selected.status].label}
                    </span>
                    <span style={S.badge('#334155', '#94a3b8')}>
                      {SOURCE_LABELS[selected.source]}
                    </span>
                  </div>
                </div>
                <button
                  style={S.btnSm('#E0E0E0')}
                  onClick={() => setSelectedId(null)}
                >✕</button>
              </div>
            </div>

            {/* Customer info */}
            {(selected.customer_name || selected.customer_phone || selected.customer_address) && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #334155', fontSize: 13 }}>
                {selected.customer_name && <div>👤 <b>{selected.customer_name}</b></div>}
                {selected.customer_phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📞 {selected.customer_phone}</span>
                  <button
                    style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={() => window.open('https://wa.me/' + selected.customer_phone.replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent('Hola ' + (selected.customer_name || '') + ', te escribimos de Almíbar respecto a tu pedido #' + selected.order_number), '_blank')}
                  >💬 WhatsApp</button>
                </div>}
                {selected.customer_address && <div>📍 {selected.customer_address}</div>}
                {selected.customer_notes && (
                  <div style={{ color: '#f59e0b', marginTop: 4 }}>💬 {selected.customer_notes}</div>
                )}
              </div>
            )}

            {/* Items */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #334155' }}>
              <div style={S.sectionTitle}>PRODUCTOS</div>
              {selectedItems.map((item) => (
                <div key={item.id} style={S.itemRow}>
                  <span>
                    <b>{item.quantity}x</b> {item.product_name}
                    {item.notes && <span style={{ color: '#f59e0b', fontSize: 11 }}> — {item.notes}</span>}
                  </span>
                  <span style={{ fontWeight: 600 }}>{fmt(item.subtotal)}</span>
                </div>
              ))}
              {selected.delivery_fee > 0 && (
                <div style={{ ...S.itemRow, color: '#999999' }}>
                  <span>🛵 Despacho</span>
                  <span>{fmt(selected.delivery_fee)}</span>
                </div>
              )}
              <div style={{ ...S.itemRow, borderTop: '1px solid #E0E0E0', paddingTop: 6, marginTop: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>TOTAL</span>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{fmt(selected.total || selected.subtotal)}</span>
              </div>
            </div>

            {/* Payments & tips (if closed) */}
            {selectedPayments.length > 0 && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #334155' }}>
                <div style={S.sectionTitle}>PAGOS</div>
                {selectedPayments.map((p) => (
                  <div key={p.id} style={S.itemRow}>
                    <span>{METHOD_LABELS[p.method]}</span>
                    <span style={{ fontWeight: 600 }}>{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {selectedTips.length > 0 && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #334155' }}>
                <div style={S.sectionTitle}>PROPINAS</div>
                {selectedTips.map((t) => (
                  <div key={t.id} style={S.itemRow}>
                    <span>{METHOD_LABELS[t.method]}</span>
                    <span style={{ fontWeight: 600, color: '#E8562A' }}>{fmt(t.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Timeline */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #334155' }}>
              <div style={S.sectionTitle}>TIMELINE</div>
              <div style={{ fontSize: 12, color: '#999999' }}>
                {selected.created_at && <div>📥 Creado: {fmtTime(selected.created_at)}</div>}
                {selected.accepted_at && <div>✅ Aceptado: {fmtTime(selected.accepted_at)}</div>}
                {selected.preparation_at && <div>🔥 En cocina: {fmtTime(selected.preparation_at)}</div>}
                {selected.ready_at && <div>📦 Listo: {fmtTime(selected.ready_at)}</div>}
                {selected.dispatched_at && <div>🛵 Despachado: {fmtTime(selected.dispatched_at)}</div>}
                {selected.delivered_at && <div>✔️ Entregado: {fmtTime(selected.delivered_at)}</div>}
                {selected.rejected_at && <div>❌ Rechazado: {fmtTime(selected.rejected_at)}</div>}
                {selected.cajero_name && <div style={{ marginTop: 4 }}>💼 Cajero: {selected.cajero_name}</div>}
                {selected.repartidor_name && <div>🛵 Repartidor: {selected.repartidor_name}</div>}
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: '12px 16px', marginTop: 'auto' }}>
              <StatusActions />
              {/* Close button for orders that are delivered but not yet closed (missing payment) */}
              {selected.status === 'entregado' && !selected.closed_at && (
                <button
                  style={{ ...S.btn('#f59e0b', '#000'), width: '100%', justifyContent: 'center', marginTop: 8 }}
                  onClick={() => setShowCloseModal(true)}
                >
                  💰 Registrar Pago y Cerrar
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{
            ...S.detail, alignItems: 'center', justifyContent: 'center',
            color: '#475569', fontSize: 14,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🛵</div>
              <div>Selecciona un pedido</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>o crea uno nuevo</div>
            </div>
          </div>
        )}
      </div>

      {/* ─── MODALS ─── */}
      {showNewOrder && <NewOrderModal />}
      {showRejectModal && <RejectModal />}
      {showCloseModal && <CloseModal />}
      {showDelivered && <DeliveredModal />}
    </div>
  );
}
