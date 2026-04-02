import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';

const SUPA_URL = 'https://czdnllosfvakyibdijmb.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6ZG5sbG9zZnZha3lpYmRpam1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODE2OTYsImV4cCI6MjA4OTg1NzY5Nn0.Xjkpx2exJXmJb3yIv81uiwvlnNMvhd2gMRdPY4S4UJA';

interface InvoiceItem {
  descripcion: string;
  cantidad: string;
  unidad: string;
  precio_unitario: string;
  precio_total: string;
  categoria: string;
  matched_ingredient?: { id: string; name: string; unit: string } | null;
  is_new?: boolean;
  create_ingredient?: boolean;
}

interface InvoiceData {
  proveedor: string;
  numero_documento: string;
  fecha: string;
  items: InvoiceItem[];
  subtotal: string;
  iva: string;
  total: string;
}

export default function FacturaScannerScreen() {
  const [step, setStep] = useState<'upload' | 'scanning' | 'review' | 'saving'>('upload');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadIngredients(); }, []);

  const loadIngredients = async () => {
    const { data } = await supabase.from('ingredients').select('id, name, unit, stock').eq('active', true).order('name');
    if (data) setIngredients(data);
  };

  const pickImage = async (fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permiso requerido', 'Necesitas permitir acceso a la cámara'); return; }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, allowsEditing: true });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      setImageBase64(result.assets[0].base64);
      scanInvoice(result.assets[0].base64);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const scanInvoice = async (base64: string) => {
    setStep('scanning'); setError(null);
    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/invoice-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
        body: JSON.stringify({ image_base64: base64 }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Error ${res.status}`);
      }

      const parsed: InvoiceData = await res.json();
      // Match ingredients
      parsed.items = parsed.items.map(item => ({
        ...item,
        ...matchIngredient(item.descripcion),
      }));
      setInvoice(parsed);
      setStep('review');
    } catch (e: any) {
      setError(e.message);
      setStep('upload');
    }
  };

  const matchIngredient = (descripcion: string): { matched_ingredient: any; is_new: boolean; create_ingredient: boolean } => {
    const desc = descripcion.toLowerCase().trim();
    // Exact match
    let match = ingredients.find(i => i.name.toLowerCase() === desc);
    if (match) return { matched_ingredient: match, is_new: false, create_ingredient: false };
    // Contains match
    match = ingredients.find(i => desc.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(desc));
    if (match) return { matched_ingredient: match, is_new: false, create_ingredient: false };
    // Word match (at least 2 words in common)
    const descWords = desc.split(/\s+/);
    match = ingredients.find(i => {
      const ingWords = i.name.toLowerCase().split(/\s+/);
      const common = descWords.filter(w => ingWords.some((iw: string) => iw.includes(w) || w.includes(iw)));
      return common.length >= 2 || (common.length === 1 && common[0].length > 4);
    });
    if (match) return { matched_ingredient: match, is_new: false, create_ingredient: false };
    return { matched_ingredient: null, is_new: true, create_ingredient: false };
  };

  const updateItem = (idx: number, field: string, value: any) => {
    if (!invoice) return;
    const items = [...invoice.items];
    items[idx] = { ...items[idx], [field]: value };
    setInvoice({ ...invoice, items });
  };

  const toggleCreateIngredient = (idx: number) => {
    if (!invoice) return;
    const items = [...invoice.items];
    items[idx] = { ...items[idx], create_ingredient: !items[idx].create_ingredient };
    setInvoice({ ...invoice, items });
  };

  const reassignIngredient = (idx: number, ingredientId: string | null) => {
    if (!invoice) return;
    const items = [...invoice.items];
    if (ingredientId) {
      const ing = ingredients.find(i => i.id === ingredientId);
      items[idx] = { ...items[idx], matched_ingredient: ing || null, is_new: false };
    } else {
      items[idx] = { ...items[idx], matched_ingredient: null, is_new: true };
    }
    setInvoice({ ...invoice, items });
  };

  const saveInvoice = async () => {
    if (!invoice) return;
    setStep('saving');
    try {
      // 1. Insert purchase
      const { data: purchase, error: pe } = await supabase.from('purchases').insert({
        proveedor: invoice.proveedor,
        invoice_number: invoice.numero_documento,
        fecha: invoice.fecha || null,
        subtotal: parseFloat(invoice.subtotal) || 0,
        iva: parseFloat(invoice.iva) || 0,
        total: parseFloat(invoice.total) || 0,
        status: 'recibida',
      }).select('id').single();
      if (pe) throw pe;

      // 2. Process items
      for (const item of invoice.items) {
        let ingredientId = item.matched_ingredient?.id || null;

        // Create new ingredient if flagged
        if (item.is_new && item.create_ingredient && !ingredientId) {
          const { data: newIng, error: ie } = await supabase.from('ingredients').insert({
            name: item.descripcion,
            unit: item.unidad || 'un',
            stock: 0,
            alert_stock: 0,
            cost_per_unit: parseFloat(item.precio_unitario) || 0,
            active: true,
          }).select('id').single();
          if (!ie && newIng) ingredientId = newIng.id;
        }

        // Insert purchase_item
        await supabase.from('purchase_items').insert({
          purchase_id: purchase.id,
          ingredient_id: ingredientId,
          descripcion: item.descripcion,
          quantity: parseFloat(item.cantidad) || 0,
          purchase_unit: item.unidad || '',
          unit_price: parseFloat(item.precio_unitario) || 0,
          total_price: parseFloat(item.precio_total) || 0,
          categoria: item.categoria || '',
        });

        // Update ingredient stock
        if (ingredientId) {
          const qty = parseFloat(item.cantidad) || 0;
          const cost = parseFloat(item.precio_unitario) || 0;
          await supabase.rpc('increment_stock', { p_ingredient_id: ingredientId, p_quantity: qty }).catch(() => {
            // Fallback if RPC doesn't exist
            supabase.from('ingredients').select('stock').eq('id', ingredientId!).single().then(({ data }) => {
              if (data) supabase.from('ingredients').update({ stock: (data.stock || 0) + qty, cost_per_unit: cost }).eq('id', ingredientId!);
            });
          });
        }
      }

      Alert.alert('✅ Factura guardada', `${invoice.items.length} ítems procesados`);
      setStep('upload');
      setInvoice(null);
      setImageBase64(null);
      loadIngredients();
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setStep('review');
    }
  };

  const fmt = (n: string | number) => '$' + Math.round(parseFloat(String(n)) || 0).toLocaleString('es-CL');

  // ═══ UPLOAD STEP ═══
  if (step === 'upload') return (
    <ScrollView style={st.container} contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>📷</Text>
      <Text style={st.title}>Escanear Factura</Text>
      <Text style={st.subtitle}>Sube una foto de la factura o boleta del proveedor y el sistema extraerá los datos automáticamente</Text>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
        <TouchableOpacity style={st.btnPrimary} onPress={() => pickImage(true)}>
          <Text style={st.btnPrimaryT}>📸 Tomar foto</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.btnSecondary} onPress={() => pickImage(false)}>
          <Text style={st.btnSecondaryT}>🖼 Galería</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={{ backgroundColor: COLORS.error + '15', borderRadius: 10, padding: 14, marginTop: 16, width: '100%', maxWidth: 500, borderWidth: 1, borderColor: COLORS.error + '30' }}>
          <Text style={{ color: COLORS.error, fontSize: 13 }}>❌ {error}</Text>
        </View>
      )}

    </ScrollView>
  );

  // ═══ SCANNING STEP ═══
  if (step === 'scanning') return (
    <View style={[st.container, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '600', marginTop: 16 }}>Analizando factura...</Text>
      <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 8 }}>Claude Vision está extrayendo los datos</Text>
    </View>
  );

  // ═══ SAVING STEP ═══
  if (step === 'saving') return (
    <View style={[st.container, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '600', marginTop: 16 }}>Guardando...</Text>
    </View>
  );

  // ═══ REVIEW STEP ═══
  if (!invoice) return null;
  const newItems = invoice.items.filter(i => i.is_new);
  const matchedItems = invoice.items.filter(i => !i.is_new);

  return (
    <ScrollView style={st.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={st.title}>Revisar Factura</Text>
        <TouchableOpacity onPress={() => { setStep('upload'); setInvoice(null); }}>
          <Text style={{ color: COLORS.error, fontSize: 13, fontWeight: '600' }}>✕ Cancelar</Text>
        </TouchableOpacity>
      </View>

      {/* Invoice header info */}
      <View style={st.card}>
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 150 }}>
            <Text style={st.label}>Proveedor</Text>
            <TextInput style={st.input} value={invoice.proveedor} onChangeText={v => setInvoice({ ...invoice, proveedor: v })} />
          </View>
          <View style={{ flex: 1, minWidth: 120 }}>
            <Text style={st.label}>N° Documento</Text>
            <TextInput style={st.input} value={invoice.numero_documento} onChangeText={v => setInvoice({ ...invoice, numero_documento: v })} />
          </View>
          <View style={{ flex: 1, minWidth: 120 }}>
            <Text style={st.label}>Fecha</Text>
            <TextInput style={st.input} value={invoice.fecha} onChangeText={v => setInvoice({ ...invoice, fecha: v })} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
          <View><Text style={st.label}>Subtotal</Text><Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{fmt(invoice.subtotal)}</Text></View>
          <View><Text style={st.label}>IVA</Text><Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{fmt(invoice.iva)}</Text></View>
          <View><Text style={st.label}>Total</Text><Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary }}>{fmt(invoice.total)}</Text></View>
        </View>
      </View>

      {/* Items matched */}
      <Text style={[st.sectionTitle, { color: COLORS.success }]}>✅ Coincidencias ({matchedItems.length})</Text>
      {matchedItems.map((item, idx) => {
        const realIdx = invoice.items.indexOf(item);
        return (
          <View key={realIdx} style={st.itemRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{item.descripcion}</Text>
                <View style={{ backgroundColor: COLORS.success + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: COLORS.success }}>→ {item.matched_ingredient?.name}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{item.cantidad} {item.unidad}</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Unit: {fmt(item.precio_unitario)}</Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.text }}>Total: {fmt(item.precio_total)}</Text>
              </View>
            </View>
          </View>
        );
      })}

      {/* Items new */}
      {newItems.length > 0 && (<>
        <Text style={[st.sectionTitle, { color: COLORS.warning }]}>⚠ Nuevos — sin coincidencia ({newItems.length})</Text>
        {newItems.map((item, idx) => {
          const realIdx = invoice.items.indexOf(item);
          return (
            <View key={realIdx} style={[st.itemRow, { borderLeftColor: COLORS.warning }]}>
              <View style={{ flex: 1 }}>
                <TextInput style={[st.input, { fontWeight: '600', marginBottom: 4 }]} value={item.descripcion} onChangeText={v => updateItem(realIdx, 'descripcion', v)} />
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 60 }}>
                    <Text style={st.label}>Cant.</Text>
                    <TextInput style={st.input} value={item.cantidad} onChangeText={v => updateItem(realIdx, 'cantidad', v)} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1, minWidth: 60 }}>
                    <Text style={st.label}>Unidad</Text>
                    <TextInput style={st.input} value={item.unidad} onChangeText={v => updateItem(realIdx, 'unidad', v)} />
                  </View>
                  <View style={{ flex: 1, minWidth: 80 }}>
                    <Text style={st.label}>P.Unit</Text>
                    <TextInput style={st.input} value={item.precio_unitario} onChangeText={v => updateItem(realIdx, 'precio_unitario', v)} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1, minWidth: 80 }}>
                    <Text style={st.label}>Total</Text>
                    <TextInput style={st.input} value={item.precio_total} onChangeText={v => updateItem(realIdx, 'precio_total', v)} keyboardType="numeric" />
                  </View>
                </View>
                {/* Assign existing or create new */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <TouchableOpacity style={{ backgroundColor: item.create_ingredient ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: item.create_ingredient ? COLORS.primary : COLORS.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => toggleCreateIngredient(realIdx)}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: item.create_ingredient ? '#fff' : COLORS.text }}>+ Crear ingrediente</Text>
                  </TouchableOpacity>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {ingredients.filter(i => {
                        const d = item.descripcion.toLowerCase();
                        const n = i.name.toLowerCase();
                        return d.split(' ').some((w: string) => w.length > 3 && n.includes(w));
                      }).slice(0, 5).map(i => (
                        <TouchableOpacity key={i.id} style={{ backgroundColor: COLORS.info + '15', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.info + '30' }} onPress={() => reassignIngredient(realIdx, i.id)}>
                          <Text style={{ fontSize: 10, color: COLORS.info, fontWeight: '600' }}>{i.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </View>
            </View>
          );
        })}
      </>)}

      {/* Save button */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
        <TouchableOpacity style={st.btnSecondary} onPress={() => { setStep('upload'); setInvoice(null); }}>
          <Text style={st.btnSecondaryT}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.btnPrimary, { flex: 1 }]} onPress={saveInvoice}>
          <Text style={st.btnPrimaryT}>✅ Guardar factura ({invoice.items.length} ítems)</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 8, maxWidth: 400 },
  card: { backgroundColor: COLORS.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  label: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 3 },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: COLORS.text },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  itemRow: { backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: COLORS.success, borderWidth: 1, borderColor: COLORS.border },
  btnPrimary: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' },
  btnPrimaryT: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnSecondary: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' },
  btnSecondaryT: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
});
