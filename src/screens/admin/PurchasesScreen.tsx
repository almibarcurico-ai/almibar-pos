import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../theme';

const SUPA_URL = 'https://czdnllosfvakyibdijmb.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6ZG5sbG9zZnZha3lpYmRpam1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODE2OTYsImV4cCI6MjA4OTg1NzY5Nn0.Xjkpx2exJXmJb3yIv81uiwvlnNMvhd2gMRdPY4S4UJA';

interface ScannedItem {
  codigo: string; descripcion: string; cantidad: string; unidad: string;
  precio_unitario: string; precio_total: string; categoria: string;
  matched?: { id: string; name: string; unit: string; cost_per_unit: number; stock_current: number } | null;
  is_new?: boolean; create_new?: boolean;
}

export default function PurchasesScreen({ onBack }: { onBack?: () => void }) {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [detailInvoice, setDetailInvoice] = useState<any>(null);

  // Scanner state
  const [scanning, setScanning] = useState(false);
  const [scannedData, setScannedData] = useState<any>(null);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [payMethod, setPayMethod] = useState<'efectivo' | 'transferencia' | 'credito_proveedor' | 'debito'>('efectivo');
  const [linkArqueo, setLinkArqueo] = useState(true);
  const [currentArqueo, setCurrentArqueo] = useState<any>(null);

  // Edit invoice
  const [editInvoice, setEditInvoice] = useState<any>(null);

  // Manual purchase
  const [manualModal, setManualModal] = useState(false);
  const [manualSupplier, setManualSupplier] = useState('');
  const [manualInvoiceNum, setManualInvoiceNum] = useState('');
  const [manualPayMethod, setManualPayMethod] = useState<'efectivo' | 'transferencia' | 'debito' | 'credito_proveedor'>('efectivo');
  const [manualItems, setManualItems] = useState<{ ingredient: any; qty: string; price: string; unit: string }[]>([]);
  const [manualSearch, setManualSearch] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [{ data: inv }, { data: sup }, { data: ing }, { data: arq }] = await Promise.all([
      supabase.from('purchase_invoices').select('*, supplier:supplier_id(name), items:purchase_items(*, ingredient:ingredient_id(name,unit,cost_per_unit,stock_current))').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').eq('active', true).order('name'),
      supabase.from('ingredients').select('*').eq('active', true).order('name'),
      supabase.from('cash_registers').select('*').is('closed_at', null).order('opened_at', { ascending: false }).limit(1),
    ]);
    if (inv) setInvoices(inv);
    if (sup) setSuppliers(sup);
    if (ing) setIngredients(ing);
    setCurrentArqueo(arq?.[0] || null);
  };

  const fmt = (p: number) => '$' + Math.round(p).toLocaleString('es-CL');

  // ═══ SCANNER ═══
  const pickAndScan = async (fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permiso requerido'); return; }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
      if (result.canceled || !result.assets?.[0]?.base64) return;

      setScanning(true);
      const res = await fetch(`${SUPA_URL}/functions/v1/invoice-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
        body: JSON.stringify({ image_base64: result.assets[0].base64 }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Error ' + res.status); }
      const data = await res.json();
      setScannedData(data);

      // Match items with ingredients (priorizar coincidencia de nombre + unidad)
      const items: ScannedItem[] = (data.items || []).map((item: any) => {
        const desc = (item.descripcion || '').toLowerCase().trim();
        const itemUnit = (item.unidad || '').toLowerCase();
        // 1. Exact name match
        let match = ingredients.find(i => i.name.toLowerCase() === desc);
        // 2. Contains match — prefer same unit
        if (!match) {
          const candidates = ingredients.filter(i => desc.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(desc));
          match = candidates.find(c => c.unit?.toLowerCase() === itemUnit) || candidates[0];
        }
        // 3. Word match — prefer same unit, require 2+ common words
        if (!match) {
          const words = desc.split(/\s+/).filter((w: string) => w.length > 3);
          const candidates = ingredients.filter(i => {
            const iw = i.name.toLowerCase().split(/\s+/);
            const common = words.filter((w: string) => iw.some((x: string) => x.includes(w) || w.includes(x)));
            return common.length >= 2;
          });
          match = candidates.find(c => c.unit?.toLowerCase() === itemUnit) || candidates[0];
        }
        return { ...item, matched: match || null, is_new: !match, create_new: false };
      });
      setScannedItems(items);
      setScanning(false);
    } catch (e: any) {
      setScanning(false);
      Alert.alert('Error', e.message);
    }
  };

  const updateScannedItem = (idx: number, field: string, value: any) => {
    setScannedItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const assignIngredient = (idx: number, ing: any) => {
    setScannedItems(prev => prev.map((item, i) => i === idx ? { ...item, matched: ing, is_new: false, create_new: false } : item));
  };

  const saveScannedInvoice = async () => {
    if (!user || !scannedData) return;
    setSaving(true);
    try {
      // Find or create supplier
      let suppId = null;
      if (scannedData.proveedor) {
        const sup = suppliers.find(s => s.name.toLowerCase().includes(scannedData.proveedor.toLowerCase().slice(0, 10)));
        suppId = sup?.id || null;
      }

      // Create invoice
      const { data: inv, error: ie } = await supabase.from('purchase_invoices').insert({
        supplier_id: suppId,
        invoice_number: scannedData.numero_documento || null,
        date: scannedData.fecha || new Date().toISOString().split('T')[0],
        subtotal: parseInt(scannedData.subtotal) || 0,
        iva: parseInt(scannedData.iva) || 0,
        total: parseInt(scannedData.total) || 0,
        payment_method: payMethod,
        notes: `Escaneada por IA · Proveedor: ${scannedData.proveedor || 'N/A'}`,
        created_by: user.id,
      }).select('id').single();
      if (ie) throw ie;

      // Si es efectivo y hay arqueo abierto → crear egreso automático
      const totalFactura = parseInt(scannedData.total) || 0;
      if (payMethod === 'efectivo' && linkArqueo && currentArqueo && totalFactura > 0) {
        await supabase.from('cash_movements').insert({
          cash_register_id: currentArqueo.id,
          type: 'gasto',
          amount: totalFactura,
          description: `Compra: ${scannedData.proveedor || 'Proveedor'} #${scannedData.numero_documento || 'S/N'}`,
          created_by: user.id,
        });
      }

      // Process items
      const priceChanges: string[] = [];
      for (const item of scannedItems) {
        let ingredientId = item.matched?.id || null;
        const qty = parseFloat(item.cantidad) || 0;
        const unitPrice = parseFloat(item.precio_unitario) || 0;
        const totalPrice = parseFloat(item.precio_total) || 0;

        // Create new ingredient if flagged
        if (item.is_new && item.create_new && !ingredientId) {
          const { data: newIng } = await supabase.from('ingredients').insert({
            name: item.descripcion, unit: item.unidad || 'un',
            stock_current: 0, stock_min: 0, cost_per_unit: unitPrice, active: true,
          }).select('id').single();
          if (newIng) ingredientId = newIng.id;
        }

        // Insert purchase item
        await supabase.from('purchase_items').insert({
          invoice_id: inv.id, ingredient_id: ingredientId,
          quantity: qty, unit_price: unitPrice, purchase_unit: item.unidad || '',
          total_price: totalPrice, descripcion: item.descripcion, categoria: item.categoria || '',
        });

        // Update ingredient stock + detect price change
        if (ingredientId) {
          // Leer stock actual directo de BD (no del cache)
          const { data: currentIng } = await supabase.from('ingredients').select('stock_current, cost_per_unit, name').eq('id', ingredientId).single();
          if (currentIng) {
            const currentStock = currentIng.stock_current || 0;
            const newStock = currentStock + qty;
            const oldCost = currentIng.cost_per_unit || 0;
            // Detectar cambio de precio > 5%
            if (oldCost > 0 && unitPrice > 0 && Math.abs(unitPrice - oldCost) / oldCost > 0.05) {
              const pctChange = Math.round((unitPrice - oldCost) / oldCost * 100);
              priceChanges.push(`${currentIng.name}: ${fmt(oldCost)} → ${fmt(unitPrice)} (${pctChange > 0 ? '+' : ''}${pctChange}%)`);
            }
            // Actualizar stock y costo
            const updateData: any = { stock_current: newStock };
            if (unitPrice > 0) updateData.cost_per_unit = unitPrice;
            await supabase.from('ingredients').update(updateData).eq('id', ingredientId);
          }
        }
      }

      let msg = `${scannedItems.length} ítems procesados`;
      if (priceChanges.length > 0) msg += `\n\n⚠️ Cambios de precio:\n${priceChanges.join('\n')}`;
      Alert.alert('✅ Factura guardada', msg);

      setScannedData(null);
      setScannedItems([]);
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  // ═══ MANUAL PURCHASE ═══
  const addManualItem = (ing: any) => {
    if (manualItems.find(i => i.ingredient.id === ing.id)) return;
    setManualItems(prev => [...prev, { ingredient: ing, qty: '', price: String(ing.cost_per_unit || 0), unit: ing.unit || 'kg' }]);
    setManualSearch('');
  };

  const saveManualPurchase = async () => {
    if (!user || manualItems.length === 0) { Alert.alert('', 'Agrega al menos un ítem'); return; }
    setSaving(true);
    try {
      const subtotal = manualItems.reduce((a, i) => a + (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0), 0);
      const iva = Math.round(subtotal * 0.19);
      const total = subtotal + iva;
      const suppObj = suppliers.find(s => s.id === manualSupplier);

      const { data: inv, error: ie } = await supabase.from('purchase_invoices').insert({
        supplier_id: manualSupplier || null,
        invoice_number: manualInvoiceNum || null,
        date: new Date().toLocaleDateString('en-CA'),
        subtotal, iva, total,
        payment_method: manualPayMethod,
        notes: manualNotes || null,
        created_by: user.id,
      }).select('id').single();
      if (ie) throw ie;

      // Egreso en arqueo si efectivo
      if (manualPayMethod === 'efectivo' && currentArqueo && total > 0) {
        await supabase.from('cash_movements').insert({
          cash_register_id: currentArqueo.id, type: 'gasto', amount: total,
          description: `Compra: ${suppObj?.name || 'Proveedor'} #${manualInvoiceNum || 'S/N'}`,
          created_by: user.id,
        });
      }

      for (const item of manualItems) {
        const qty = parseFloat(item.qty) || 0;
        const unitPrice = parseFloat(item.price) || 0;
        await supabase.from('purchase_items').insert({
          invoice_id: inv.id, ingredient_id: item.ingredient.id,
          quantity: qty, unit_price: unitPrice, purchase_unit: item.unit,
          total_price: Math.round(qty * unitPrice), descripcion: item.ingredient.name,
        });
        // Actualizar stock
        if (qty > 0) {
          const { data: cur } = await supabase.from('ingredients').select('stock_current').eq('id', item.ingredient.id).single();
          if (cur) {
            const upd: any = { stock_current: (cur.stock_current || 0) + qty };
            if (unitPrice > 0) upd.cost_per_unit = unitPrice;
            await supabase.from('ingredients').update(upd).eq('id', item.ingredient.id);
          }
        }
      }

      Alert.alert('✅ Compra registrada', `${manualItems.length} ítems · ${fmt(total)}`);
      setManualModal(false); setManualItems([]); setManualSupplier(''); setManualInvoiceNum(''); setManualNotes('');
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  // ═══ DELETE INVOICE ═══
  const deleteInvoice = async (inv: any) => {
    const ok = typeof window !== 'undefined' ? window.confirm(`¿Eliminar factura ${inv.invoice_number || 'S/N'}?`) : true;
    if (!ok) return;
    await supabase.from('purchase_items').delete().eq('invoice_id', inv.id);
    await supabase.from('purchase_invoices').delete().eq('id', inv.id);
    setDetailInvoice(null);
    await load();
  };

  // ═══ RENDER ═══
  return (
    <View style={s.c}>
      {/* Header */}
      <View style={s.hdr}>
        <Text style={s.hdrT}>🧾 Compras</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={[s.btn, { backgroundColor: COLORS.primary }]} onPress={() => pickAndScan(true)}>
            <Text style={s.btnT}>📸 Escanear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }]} onPress={() => pickAndScan(false)}>
            <Text style={[s.btnT, { color: COLORS.textSecondary }]}>🖼 Galería</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.primary }]} onPress={() => { setManualItems([]); setManualSupplier(''); setManualInvoiceNum(''); setManualNotes(''); setManualPayMethod('efectivo'); setManualModal(true); }}>
            <Text style={[s.btnT, { color: COLORS.primary }]}>✏️ Manual</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Scanning indicator */}
      {scanning && (
        <View style={{ padding: 20, alignItems: 'center', backgroundColor: COLORS.primary + '10' }}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={{ color: COLORS.primary, fontWeight: '600', marginTop: 8 }}>Analizando factura con IA...</Text>
        </View>
      )}

      {/* Scanned invoice review */}
      {scannedData && !scanning && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>Revisar Factura</Text>
            <TouchableOpacity onPress={() => { setScannedData(null); setScannedItems([]); }}>
              <Text style={{ color: COLORS.error, fontWeight: '600' }}>✕ Cancelar</Text>
            </TouchableOpacity>
          </View>

          {/* Invoice header */}
          <View style={s.card}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{scannedData.proveedor || 'Sin proveedor'}</Text>
            <Text style={{ fontSize: 11, color: COLORS.textMuted }}>N° {scannedData.numero_documento || 'S/N'} · {scannedData.fecha || '-'}</Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Neto: {fmt(parseInt(scannedData.subtotal) || 0)}</Text>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>IVA: {fmt(parseInt(scannedData.iva) || 0)}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary }}>Total: {fmt(parseInt(scannedData.total) || 0)}</Text>
            </View>
          </View>

          {/* Método de pago */}
          <View style={s.card}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>MÉTODO DE PAGO</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {([['efectivo', '💵 Efectivo'], ['transferencia', '📱 Transferencia'], ['debito', '💳 Débito'], ['credito_proveedor', '📋 Crédito proveedor']] as const).map(([key, label]) => (
                <TouchableOpacity key={key} onPress={() => setPayMethod(key)}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: payMethod === key ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: payMethod === key ? COLORS.primary : COLORS.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: payMethod === key ? '#fff' : COLORS.textSecondary }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {payMethod === 'efectivo' && currentArqueo && (
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }} onPress={() => setLinkArqueo(!linkArqueo)}>
                <Text style={{ fontSize: 14 }}>{linkArqueo ? '☑' : '☐'}</Text>
                <Text style={{ fontSize: 12, color: linkArqueo ? COLORS.primary : COLORS.textMuted, fontWeight: '600' }}>Descontar del arqueo actual</Text>
              </TouchableOpacity>
            )}
            {payMethod === 'efectivo' && !currentArqueo && (
              <Text style={{ fontSize: 11, color: COLORS.warning, marginTop: 6 }}>⚠ No hay arqueo abierto — el egreso no se registrará en caja</Text>
            )}
          </View>

          {/* Items */}
          {scannedItems.map((item, idx) => {
            const priceChanged = item.matched && item.matched.cost_per_unit > 0 && parseFloat(item.precio_unitario) > 0 && Math.abs(parseFloat(item.precio_unitario) - item.matched.cost_per_unit) / item.matched.cost_per_unit > 0.05;
            const pctChange = priceChanged && item.matched ? Math.round((parseFloat(item.precio_unitario) - item.matched.cost_per_unit) / item.matched.cost_per_unit * 100) : 0;
            return (
              <View key={idx} style={[s.card, { borderLeftWidth: 3, borderLeftColor: item.matched ? COLORS.success : COLORS.warning }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <TextInput style={[s.inp, { flex: 1, fontWeight: '600', fontSize: 14 }]} value={item.descripcion} onChangeText={v => updateScannedItem(idx, 'descripcion', v)} />
                  {item.matched ? (
                    <TouchableOpacity style={{ backgroundColor: COLORS.success + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => { setSearchIdx(idx); setSearchText(''); }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.success }}>✓ {item.matched.name}</Text>
                      <Text style={{ fontSize: 9, color: COLORS.success }}>✏️</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ backgroundColor: COLORS.warning + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 9, fontWeight: '700', color: COLORS.warning }}>Nuevo</Text></View>
                  )}
                </View>
                {/* Búsqueda manual de ingrediente */}
                {searchIdx === idx && (
                  <View style={{ backgroundColor: COLORS.background, borderRadius: 8, padding: 8, marginBottom: 6, borderWidth: 1, borderColor: COLORS.primary + '40' }}>
                    <TextInput style={[s.inp, { marginBottom: 4 }]} placeholder="🔍 Buscar ingrediente..." placeholderTextColor={COLORS.textMuted} value={searchText} onChangeText={setSearchText} autoFocus />
                    <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled>
                      {ingredients.filter(i => !searchText || i.name.toLowerCase().includes(searchText.toLowerCase())).slice(0, 15).map(i => (
                        <TouchableOpacity key={i.id} style={{ paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} onPress={() => { assignIngredient(idx, i); setSearchIdx(null); setSearchText(''); }}>
                          <Text style={{ fontSize: 12, color: COLORS.text }}>{i.name}</Text>
                          <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{i.unit} · Stock: {i.stock_current}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <TouchableOpacity style={{ flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.border, alignItems: 'center' }} onPress={() => { setSearchIdx(null); updateScannedItem(idx, 'matched', null); updateScannedItem(idx, 'is_new', true); }}>
                        <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' }}>Sin asignar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }} onPress={() => setSearchIdx(null)}>
                        <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' }}>Cerrar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Text style={s.lb}>Cant.</Text><TextInput style={s.inp} value={item.cantidad} onChangeText={v => updateScannedItem(idx, 'cantidad', v)} keyboardType="numeric" /></View>
                  <View style={{ flex: 1 }}><Text style={s.lb}>Unidad</Text><TextInput style={s.inp} value={item.unidad} onChangeText={v => updateScannedItem(idx, 'unidad', v)} /></View>
                  <View style={{ flex: 1 }}><Text style={s.lb}>P.Unit</Text><TextInput style={s.inp} value={item.precio_unitario} onChangeText={v => updateScannedItem(idx, 'precio_unitario', v)} keyboardType="numeric" /></View>
                  <View style={{ flex: 1 }}><Text style={s.lb}>Total</Text><TextInput style={s.inp} value={item.precio_total} onChangeText={v => updateScannedItem(idx, 'precio_total', v)} keyboardType="numeric" /></View>
                </View>
                {/* Price change alert */}
                {priceChanged && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, backgroundColor: pctChange! > 0 ? '#EF444415' : '#10B98115', borderRadius: 6, padding: 6, gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: pctChange! > 0 ? COLORS.error : COLORS.success }}>
                      {pctChange! > 0 ? '📈' : '📉'} Precio {pctChange! > 0 ? 'subió' : 'bajó'} {Math.abs(pctChange!)}%: {fmt(item.matched!.cost_per_unit)} → {fmt(parseFloat(item.precio_unitario))}
                    </Text>
                  </View>
                )}
                {/* Stock info */}
                {item.matched && (
                  <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>Stock actual: {item.matched.stock_current} {item.matched.unit} → después: {(item.matched.stock_current + (parseFloat(item.cantidad) || 0)).toFixed(1)} {item.matched.unit}</Text>
                )}
                {/* Assign / create */}
                {item.is_new && (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'center' }}>
                    <TouchableOpacity style={{ backgroundColor: item.create_new ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: item.create_new ? COLORS.primary : COLORS.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }} onPress={() => updateScannedItem(idx, 'create_new', !item.create_new)}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: item.create_new ? '#fff' : COLORS.text }}>+ Crear</Text>
                    </TouchableOpacity>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {ingredients.filter(i => item.descripcion.toLowerCase().split(' ').some((w: string) => w.length > 3 && i.name.toLowerCase().includes(w))).slice(0, 5).map(i => (
                          <TouchableOpacity key={i.id} style={{ backgroundColor: COLORS.info + '15', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 }} onPress={() => assignIngredient(idx, i)}>
                            <Text style={{ fontSize: 9, color: COLORS.info, fontWeight: '600' }}>{i.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}
              </View>
            );
          })}

          {/* Save button */}
          <TouchableOpacity style={[s.btn, { backgroundColor: COLORS.primary, paddingVertical: 16, marginTop: 12, opacity: saving ? 0.5 : 1 }]} onPress={saveScannedInvoice} disabled={saving}>
            <Text style={[s.btnT, { fontSize: 15 }]}>{saving ? 'Guardando...' : `✅ Guardar factura (${scannedItems.length} ítems)`}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Invoice list */}
      {!scannedData && !scanning && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Stats */}
          {invoices.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <View style={[s.card, { flex: 1, alignItems: 'center' }]}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.primary }}>{invoices.length}</Text>
                <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Facturas</Text>
              </View>
              <View style={[s.card, { flex: 1, alignItems: 'center' }]}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text }}>{fmt(invoices.reduce((a, i) => a + (i.total || 0), 0))}</Text>
                <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Total compras</Text>
              </View>
              <View style={[s.card, { flex: 1, alignItems: 'center' }]}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text }}>{invoices.reduce((a, i) => a + (i.items?.length || 0), 0)}</Text>
                <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Items</Text>
              </View>
            </View>
          )}
          {/* Table header */}
          {invoices.length > 0 && (
            <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: COLORS.border }}>
              <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 }}>PROVEEDOR</Text>
              <Text style={{ width: 80, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 }}>FECHA</Text>
              <Text style={{ width: 50, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' }}>ITEMS</Text>
              <Text style={{ width: 60, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' }}>PAGO</Text>
              <Text style={{ width: 90, fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'right' }}>TOTAL</Text>
            </View>
          )}
          {invoices.map((inv, i) => {
            const provName = inv.supplier?.name || inv.notes?.match(/Proveedor:\s*([^·|]+)/)?.[1]?.trim() || 'Sin proveedor';
            return (
              <TouchableOpacity key={inv.id} style={[s.row, { borderRadius: 0, borderWidth: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginVertical: 0, backgroundColor: i % 2 === 0 ? COLORS.card : COLORS.background }]} onPress={() => setDetailInvoice(inv)}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }} numberOfLines={1}>{provName}</Text>
                  <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{inv.invoice_number || 'S/N'}</Text>
                </View>
                <Text style={{ width: 80, fontSize: 11, color: COLORS.textSecondary }}>{new Date(inv.created_at).toLocaleDateString('es-CL')}</Text>
                <Text style={{ width: 50, fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' }}>{inv.items?.length || 0}</Text>
                <Text style={{ width: 60, fontSize: 10, color: COLORS.textMuted, textAlign: 'center' }}>{(inv.payment_method || '').slice(0, 6)}</Text>
                <Text style={{ width: 90, fontSize: 13, fontWeight: '700', color: COLORS.primary, textAlign: 'right' }}>{fmt(inv.total)}</Text>
              </TouchableOpacity>
            );
          })}
          {invoices.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 40 }}>📸</Text>
              <Text style={{ color: COLORS.textMuted, marginTop: 8, textAlign: 'center' }}>Escanea una factura, sube de galería{'\n'}o ingresa manualmente</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Detail Modal */}
      <Modal visible={!!detailInvoice} transparent animationType="fade">
        <View style={s.ov}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={[s.md, { maxWidth: 500 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>🧾 Detalle</Text>
              <TouchableOpacity onPress={() => setDetailInvoice(null)}><Text style={{ fontSize: 18, color: COLORS.textMuted }}>✕</Text></TouchableOpacity>
            </View>
            {detailInvoice && (<>
              <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{detailInvoice.supplier?.name || 'Proveedor'}</Text>
              <Text style={{ fontSize: 12, color: COLORS.textMuted }}>{detailInvoice.invoice_number || 'S/N'} · {new Date(detailInvoice.created_at).toLocaleDateString('es-CL')}</Text>
              <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 12 }} />
              {detailInvoice.items?.map((i: any) => (
                <View key={i.id} style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={{ flex: 1, fontSize: 13, color: COLORS.text }}>{i.ingredient?.name || i.descripcion || '?'}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary, width: 60 }}>{i.quantity} {i.purchase_unit}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text, width: 80, textAlign: 'right' }}>{fmt(i.total_price)}</Text>
                </View>
              ))}
              <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 12 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '800', color: COLORS.text }}>TOTAL</Text>
                <Text style={{ fontWeight: '800', color: COLORS.primary }}>{fmt(detailInvoice.total)}</Text>
              </View>
              {detailInvoice.notes && <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>{detailInvoice.notes}</Text>}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: COLORS.error + '15', alignItems: 'center' }} onPress={() => deleteInvoice(detailInvoice)}>
                  <Text style={{ color: COLORS.error, fontWeight: '600', fontSize: 13 }}>🗑 Eliminar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center' }} onPress={() => setDetailInvoice(null)}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </>)}
          </View>
        </ScrollView></View>
      </Modal>
      {/* Manual purchase modal */}
      <Modal visible={manualModal} animationType="slide"><View style={s.c}>
        <View style={s.hdr}>
          <TouchableOpacity onPress={() => setManualModal(false)}><Text style={{ color: COLORS.error, fontWeight: '600' }}>✕ Cancelar</Text></TouchableOpacity>
          <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>Compra Manual</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          {/* Proveedor */}
          <Text style={s.lb}>Proveedor</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 38, marginBottom: 8 }}>
            {suppliers.map(sup => (
              <TouchableOpacity key={sup.id} onPress={() => setManualSupplier(sup.id)}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: manualSupplier === sup.id ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: manualSupplier === sup.id ? COLORS.primary : COLORS.border, marginRight: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: manualSupplier === sup.id ? '#fff' : COLORS.textSecondary }}>{sup.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={s.lb}>N° Factura</Text>
          <TextInput style={s.inp} value={manualInvoiceNum} onChangeText={setManualInvoiceNum} placeholder="Ej: F-001234" placeholderTextColor={COLORS.textMuted} />
          <Text style={s.lb}>Método de pago</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {([['efectivo', '💵 Efectivo'], ['transferencia', '📱 Transfer'], ['debito', '💳 Débito'], ['credito_proveedor', '📋 Crédito']] as const).map(([k, l]) => (
              <TouchableOpacity key={k} onPress={() => setManualPayMethod(k)}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: manualPayMethod === k ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: manualPayMethod === k ? COLORS.primary : COLORS.border }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: manualPayMethod === k ? '#fff' : COLORS.textSecondary }}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Buscar ingrediente */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textSecondary }}>ITEMS ({manualItems.length})</Text>
          </View>
          <TextInput style={[s.inp, { marginTop: 6, marginBottom: 4 }]} value={manualSearch} onChangeText={setManualSearch} placeholder="🔍 Buscar ingrediente para agregar..." placeholderTextColor={COLORS.textMuted} />
          {manualSearch.length >= 2 && (
            <View style={{ backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, maxHeight: 120, marginBottom: 8 }}>
              <ScrollView nestedScrollEnabled>
                {ingredients.filter(i => i.name.toLowerCase().includes(manualSearch.toLowerCase())).slice(0, 10).map(i => (
                  <TouchableOpacity key={i.id} style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between' }} onPress={() => addManualItem(i)}>
                    <Text style={{ fontSize: 13, color: COLORS.text }}>{i.name}</Text>
                    <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{i.unit} · ${i.cost_per_unit || 0}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Items list */}
          {manualItems.map((item, idx) => (
            <View key={item.ingredient.id} style={[s.card, { borderLeftWidth: 3, borderLeftColor: COLORS.success }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{item.ingredient.name}</Text>
                <TouchableOpacity onPress={() => setManualItems(prev => prev.filter((_, i) => i !== idx))}><Text style={{ color: COLORS.error }}>✕</Text></TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Text style={s.lb}>Cantidad</Text><TextInput style={s.inp} value={item.qty} onChangeText={v => setManualItems(prev => prev.map((x, i) => i === idx ? { ...x, qty: v } : x))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} /></View>
                <View style={{ flex: 1 }}><Text style={s.lb}>Unidad</Text><TextInput style={s.inp} value={item.unit} onChangeText={v => setManualItems(prev => prev.map((x, i) => i === idx ? { ...x, unit: v } : x))} /></View>
                <View style={{ flex: 1 }}><Text style={s.lb}>P.Unit (neto)</Text><TextInput style={s.inp} value={item.price} onChangeText={v => setManualItems(prev => prev.map((x, i) => i === idx ? { ...x, price: v } : x))} keyboardType="number-pad" /></View>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}><Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary, textAlign: 'right' }}>{fmt(Math.round((parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0)))}</Text></View>
              </View>
            </View>
          ))}

          {manualItems.length > 0 && (
            <View style={[s.card, { marginTop: 8 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}><Text style={{ color: COLORS.textSecondary }}>Subtotal</Text><Text style={{ fontWeight: '600' }}>{fmt(manualItems.reduce((a, i) => a + (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0), 0))}</Text></View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}><Text style={{ color: COLORS.textSecondary }}>IVA 19%</Text><Text style={{ fontWeight: '600' }}>{fmt(Math.round(manualItems.reduce((a, i) => a + (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0), 0) * 0.19))}</Text></View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 2, borderTopColor: COLORS.primary, marginTop: 4 }}><Text style={{ fontSize: 16, fontWeight: '800' }}>TOTAL</Text><Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.primary }}>{fmt(Math.round(manualItems.reduce((a, i) => a + (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0), 0) * 1.19))}</Text></View>
            </View>
          )}

          <Text style={s.lb}>Notas</Text>
          <TextInput style={s.inp} value={manualNotes} onChangeText={setManualNotes} placeholder="Observaciones" placeholderTextColor={COLORS.textMuted} />
        </ScrollView>
        {manualItems.length > 0 && (
          <View style={{ padding: 16, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border }}>
            <TouchableOpacity style={[s.btn, { backgroundColor: COLORS.primary, paddingVertical: 16, opacity: saving ? 0.5 : 1 }]} onPress={saveManualPurchase} disabled={saving}>
              <Text style={[s.btnT, { fontSize: 15 }]}>{saving ? 'Guardando...' : `💾 Registrar (${manualItems.length} ítems)`}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View></Modal>
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background },
  hdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  hdrT: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignItems: 'center' },
  btnT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  card: { backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginVertical: 3, borderWidth: 1, borderColor: COLORS.border },
  lb: { fontSize: 10, color: COLORS.textMuted, marginBottom: 2, fontWeight: '600' },
  inp: { backgroundColor: COLORS.background, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, color: COLORS.text },
  ov: { flex: 1, backgroundColor: COLORS.overlay },
  md: { width: '92%' as any, maxWidth: 450, backgroundColor: COLORS.card, borderRadius: 12, padding: 20 },
});
