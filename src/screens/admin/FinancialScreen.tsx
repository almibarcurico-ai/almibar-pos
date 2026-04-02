import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import Papa from 'papaparse';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');
const pct = (n: number, total: number) => total > 0 ? Math.round(n / total * 100) : 0;
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const IVA_RATE = 0.19;

interface SIIRow { rut: string; razon: string; folio: string; fecha: string; neto: number; iva: number; total: number; tipo: string; excluded: boolean; }

export default function FinancialScreen() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);

  // Ventas
  const [ventas, setVentas] = useState<any>(null);

  // SII
  const [siiRows, setSiiRows] = useState<SIIRow[]>([]);
  const [siiLoaded, setSiiLoaded] = useState(false);

  // Costos
  const [costs, setCosts] = useState({
    sueldos_brutos: 0, cotizaciones: 0, gratificacion: 0,
    arriendo: 0, servicios_basicos: 0, internet: 0,
    publicidad: 0, mantenimiento: 0, gastos_sin_factura: 0,
    otros_fijos: 0, otros_variables: 0,
  });

  const [saved, setSaved] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const hastaMes = mes === 12 ? 1 : mes + 1;
    const hastaAnio = mes === 12 ? anio + 1 : anio;
    const hasta = `${hastaAnio}-${String(hastaMes).padStart(2,'0')}-01`;

    // Ventas del mes
    const { data: orders } = await supabase.from('orders').select('total, tip_amount, payment_method, closed_at')
      .eq('status', 'cerrada').gte('closed_at', desde).lt('closed_at', hasta);

    if (orders) {
      const ventaBruta = orders.reduce((a, o) => a + (o.total || 0), 0);
      const propinas = orders.reduce((a, o) => a + (o.tip_amount || 0), 0);
      const ivaDeb = Math.round(ventaBruta * IVA_RATE / (1 + IVA_RATE));
      setVentas({ bruta: ventaBruta, neta: ventaBruta - ivaDeb, ivaDebito: ivaDeb, propinas, ordenes: orders.length });
    }

    // Costos guardados
    const { data: mc } = await supabase.from('monthly_costs').select('*')
      .eq('mes', mes).eq('anio', anio).eq('restaurant', 'almibar').single();
    if (mc) {
      setCosts({
        sueldos_brutos: mc.sueldos_brutos || 0, cotizaciones: mc.cotizaciones || 0,
        gratificacion: mc.gratificacion || 0, arriendo: mc.arriendo || 0,
        servicios_basicos: mc.servicios_basicos || 0, internet: mc.internet || 0,
        publicidad: mc.publicidad || 0, mantenimiento: mc.mantenimiento || 0,
        gastos_sin_factura: mc.gastos_sin_factura || 0, otros_fijos: mc.otros_fijos || 0,
        otros_variables: mc.otros_variables || 0,
      });
    }

    // Reporte guardado (SII data)
    const { data: fr } = await supabase.from('financial_reports').select('raw_sii_data')
      .eq('mes', mes).eq('anio', anio).eq('restaurant', 'almibar').single();
    if (fr?.raw_sii_data) {
      setSiiRows(fr.raw_sii_data as SIIRow[]);
      setSiiLoaded(true);
    } else {
      setSiiRows([]);
      setSiiLoaded(false);
    }

    setLoading(false);
  }, [mes, anio]);

  useEffect(() => { loadData(); }, [loadData]);

  // Parse SII CSV
  const pickSII = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '*/*'] });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];

      let text = '';
      if (Platform.OS === 'web') {
        const res = await fetch(file.uri);
        text = await res.text();
      } else {
        const res = await fetch(file.uri);
        text = await res.text();
      }

      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: ';' });
      if (!parsed.data || parsed.data.length === 0) {
        // Try comma delimiter
        const parsed2 = Papa.parse(text, { header: true, skipEmptyLines: true });
        if (parsed2.data && parsed2.data.length > 0) parsed.data = parsed2.data;
      }

      const rows: SIIRow[] = (parsed.data as any[]).map(row => {
        // SII columns vary - try common names
        const neto = parseFloat(String(row['Monto Neto'] || row['Neto'] || row['MontoNeto'] || row['MONTO NETO'] || 0).replace(/\./g, '').replace(',', '.')) || 0;
        const iva = parseFloat(String(row['IVA'] || row['Monto IVA'] || row['MontoIVA'] || 0).replace(/\./g, '').replace(',', '.')) || 0;
        const total = parseFloat(String(row['Monto Total'] || row['Total'] || row['MontoTotal'] || row['MONTO TOTAL'] || 0).replace(/\./g, '').replace(',', '.')) || 0;
        return {
          rut: row['RUT Proveedor'] || row['Rut'] || row['RUT'] || row['rut'] || '',
          razon: row['Razón Social'] || row['Razon Social'] || row['RAZON SOCIAL'] || row['Proveedor'] || '',
          folio: row['Folio'] || row['N° Doc'] || row['Numero'] || '',
          fecha: row['Fecha'] || row['Fecha Docto'] || row['FECHA'] || '',
          neto: Math.abs(neto),
          iva: Math.abs(iva),
          total: Math.abs(total),
          tipo: row['Tipo Doc'] || row['Tipo'] || row['TIPO DOC'] || '',
          excluded: false,
        };
      }).filter(r => r.total > 0 || r.neto > 0);

      setSiiRows(rows);
      setSiiLoaded(true);
      Alert.alert('✅ Importado', `${rows.length} facturas cargadas`);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const toggleExclude = (idx: number) => {
    setSiiRows(prev => prev.map((r, i) => i === idx ? { ...r, excluded: !r.excluded } : r));
  };

  // Save costs
  const saveCosts = async () => {
    const { error } = await supabase.from('monthly_costs').upsert({
      mes, anio, restaurant: 'almibar', ...costs, updated_at: new Date().toISOString(),
    }, { onConflict: 'mes,anio,restaurant' });
    if (error) Alert.alert('Error', error.message);
    else { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  };

  const updateCost = (key: string, val: string) => {
    setCosts(prev => ({ ...prev, [key]: parseInt(val.replace(/\D/g, '')) || 0 }));
  };

  // Calculations
  const activeSII = siiRows.filter(r => !r.excluded);
  const comprasNetas = activeSII.reduce((a, r) => a + r.neto, 0);
  const ivaCred = activeSII.reduce((a, r) => a + r.iva, 0);
  const ventaNeta = ventas?.neta || 0;
  const ventaBruta = ventas?.bruta || 0;
  const ivaDebito = ventas?.ivaDebito || 0;
  const propinas = ventas?.propinas || 0;
  const ivaPagar = Math.max(0, ivaDebito - ivaCred);

  const totalRemuneraciones = costs.sueldos_brutos + costs.cotizaciones + costs.gratificacion;
  const totalFijos = costs.arriendo + costs.servicios_basicos + costs.internet + costs.otros_fijos;
  const totalVariables = costs.publicidad + costs.mantenimiento + costs.gastos_sin_factura + costs.otros_variables;
  const totalGastos = totalRemuneraciones + totalFijos + totalVariables;

  const utilidadBruta = ventaNeta - comprasNetas;
  const utilidadOp = utilidadBruta - totalGastos;
  const utilidadNeta = utilidadOp;
  const margenNeto = pct(utilidadNeta, ventaNeta);

  const margenColor = margenNeto >= 15 ? COLORS.success : margenNeto >= 5 ? COLORS.warning : COLORS.error;

  // Save report
  const saveReport = async () => {
    await saveCosts();
    const { error } = await supabase.from('financial_reports').upsert({
      mes, anio, restaurant: 'almibar',
      venta_bruta: ventaBruta, venta_neta: ventaNeta, propinas,
      compras_netas_sii: comprasNetas, iva_debito: ivaDebito, iva_credito: ivaCred, iva_a_pagar: ivaPagar,
      total_remuneraciones: totalRemuneraciones, total_gastos_fijos: totalFijos, total_gastos_variables: totalVariables,
      utilidad_bruta: utilidadBruta, utilidad_operacional: utilidadOp, utilidad_neta: utilidadNeta, margen_neto: margenNeto,
      raw_sii_data: siiRows,
    }, { onConflict: 'mes,anio,restaurant' });
    if (error) Alert.alert('Error', error.message);
    else Alert.alert('✅ Reporte guardado');
  };

  // Export PDF
  const exportPDF = async () => {
    const html = `<html><head><style>body{font-family:sans-serif;padding:20px}h1{color:#059669}table{width:100%;border-collapse:collapse;margin:10px 0}td,th{border:1px solid #ddd;padding:8px;text-align:right}th{background:#f5f5f5;text-align:left}.total{font-weight:bold;font-size:16px}.green{color:#059669}.red{color:#ef4444}.section{margin-top:20px;padding:10px;background:#f9f9f9;border-radius:8px}</style></head><body>
    <h1>Estado de Resultados — Almíbar</h1><p>${MESES[mes-1]} ${anio}</p>
    <div class="section"><h3>INGRESOS</h3><table>
    <tr><td>Venta bruta</td><td>${fmt(ventaBruta)}</td></tr>
    <tr><td>IVA débito (19%)</td><td>-${fmt(ivaDebito)}</td></tr>
    <tr class="total"><td>Venta neta</td><td>${fmt(ventaNeta)}</td></tr>
    <tr><td>Propinas</td><td>${fmt(propinas)}</td></tr>
    </table></div>
    <div class="section"><h3>COSTOS DE VENTAS</h3><table>
    <tr><td>Compras proveedores (neto)</td><td>${fmt(comprasNetas)}</td></tr>
    <tr><td>IVA crédito</td><td>${fmt(ivaCred)}</td></tr>
    <tr><td>IVA a pagar</td><td>${fmt(ivaPagar)}</td></tr>
    <tr class="total"><td>% del ingreso neto</td><td>${pct(comprasNetas, ventaNeta)}%</td></tr>
    </table></div>
    <div class="section"><h3>GASTOS</h3><table>
    <tr><td>Remuneraciones</td><td>${fmt(totalRemuneraciones)}</td></tr>
    <tr><td>Gastos fijos</td><td>${fmt(totalFijos)}</td></tr>
    <tr><td>Gastos variables</td><td>${fmt(totalVariables)}</td></tr>
    <tr class="total"><td>Total gastos</td><td>${fmt(totalGastos)}</td></tr>
    </table></div>
    <div class="section"><h3>RESULTADO</h3><table>
    <tr class="total"><td>Utilidad bruta</td><td>${fmt(utilidadBruta)} (${pct(utilidadBruta, ventaNeta)}%)</td></tr>
    <tr class="total"><td>Utilidad operacional</td><td>${fmt(utilidadOp)} (${pct(utilidadOp, ventaNeta)}%)</td></tr>
    <tr class="total" style="font-size:20px"><td>UTILIDAD NETA</td><td class="${margenNeto >= 15 ? 'green' : 'red'}">${fmt(utilidadNeta)} (${margenNeto}%)</td></tr>
    </table></div></body></html>`;
    await Print.printAsync({ html });
  };

  if (loading) return <View style={[st.c, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <ScrollView style={st.c} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* PERÍODO */}
      <View style={st.card}>
        <Text style={st.cardTitle}>📅 Período</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {MESES.map((m, i) => (
            <TouchableOpacity key={i} onPress={() => setMes(i + 1)}
              style={[st.chip, mes === i + 1 && st.chipActive]}>
              <Text style={[st.chipT, mes === i + 1 && st.chipActiveT]}>{m.slice(0, 3)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {[anio - 1, anio, anio + 1].map(a => (
            <TouchableOpacity key={a} onPress={() => setAnio(a)}
              style={[st.chip, anio === a && st.chipActive]}>
              <Text style={[st.chipT, anio === a && st.chipActiveT]}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* VENTAS */}
      <View style={st.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={st.cardTitle}>💰 Ingresos — {MESES[mes-1]} {anio}</Text>
          {ventas && <Text style={{ fontSize: 11, color: COLORS.success, fontWeight: '700' }}>✓ {ventas.ordenes} órdenes</Text>}
        </View>
        {ventas ? (
          <View style={{ marginTop: 8 }}>
            <Row label="Venta bruta (con IVA)" val={fmt(ventaBruta)} />
            <Row label="IVA débito (19%)" val={'-' + fmt(ivaDebito)} sub />
            <Row label="Venta neta" val={fmt(ventaNeta)} bold />
            <Row label="Propinas" val={fmt(propinas)} sub />
            <Row label="INGRESOS TOTALES" val={fmt(ventaNeta + propinas)} bold accent />
          </View>
        ) : <Text style={{ color: COLORS.textMuted, marginTop: 8 }}>Sin ventas en este período</Text>}
      </View>

      {/* SII */}
      <View style={st.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={st.cardTitle}>🧾 Compras SII</Text>
          {siiLoaded && <Text style={{ fontSize: 11, color: COLORS.success, fontWeight: '700' }}>✓ {activeSII.length} facturas</Text>}
        </View>
        <TouchableOpacity style={st.btnPrimary} onPress={pickSII}>
          <Text style={st.btnPrimaryT}>{siiLoaded ? '🔄 Recargar CSV' : '📂 Subir reporte SII'}</Text>
        </TouchableOpacity>
        {siiLoaded && (
          <View style={{ marginTop: 12 }}>
            <Row label="Compras netas" val={fmt(comprasNetas)} />
            <Row label="IVA crédito" val={fmt(ivaCred)} sub />
            <Row label="IVA a pagar" val={fmt(ivaPagar)} bold />
            <Row label="% del ingreso neto" val={`${pct(comprasNetas, ventaNeta)}%`} sub />
            <View style={{ marginTop: 8, maxHeight: 200 }}>
              <ScrollView nestedScrollEnabled>
                {siiRows.map((r, i) => (
                  <TouchableOpacity key={i} onPress={() => toggleExclude(i)}
                    style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border, opacity: r.excluded ? 0.3 : 1, gap: 8, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, width: 16 }}>{r.excluded ? '☐' : '☑'}</Text>
                    <Text style={{ fontSize: 11, color: COLORS.text, flex: 1 }} numberOfLines={1}>{r.razon || r.rut}</Text>
                    <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{r.folio}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.text }}>{fmt(r.total)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
      </View>

      {/* COSTOS */}
      <View style={st.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={st.cardTitle}>📊 Costos del Mes</Text>
          {saved && <Text style={{ fontSize: 11, color: COLORS.success, fontWeight: '700' }}>✓ Guardado</Text>}
        </View>
        <Text style={st.secLabel}>REMUNERACIONES</Text>
        <CostInput label="Sueldos brutos" value={costs.sueldos_brutos} onChange={v => updateCost('sueldos_brutos', v)} onBlur={saveCosts} />
        <CostInput label="Cotizaciones (AFP+Salud)" value={costs.cotizaciones} onChange={v => updateCost('cotizaciones', v)} onBlur={saveCosts} />
        <CostInput label="Gratificación" value={costs.gratificacion} onChange={v => updateCost('gratificacion', v)} onBlur={saveCosts} />
        <Text style={st.secLabel}>GASTOS FIJOS</Text>
        <CostInput label="Arriendo" value={costs.arriendo} onChange={v => updateCost('arriendo', v)} onBlur={saveCosts} />
        <CostInput label="Servicios básicos" value={costs.servicios_basicos} onChange={v => updateCost('servicios_basicos', v)} onBlur={saveCosts} />
        <CostInput label="Internet / telefonía" value={costs.internet} onChange={v => updateCost('internet', v)} onBlur={saveCosts} />
        <CostInput label="Otros fijos" value={costs.otros_fijos} onChange={v => updateCost('otros_fijos', v)} onBlur={saveCosts} />
        <Text style={st.secLabel}>GASTOS VARIABLES</Text>
        <CostInput label="Publicidad / marketing" value={costs.publicidad} onChange={v => updateCost('publicidad', v)} onBlur={saveCosts} />
        <CostInput label="Mantenimiento" value={costs.mantenimiento} onChange={v => updateCost('mantenimiento', v)} onBlur={saveCosts} />
        <CostInput label="Gastos sin factura" value={costs.gastos_sin_factura} onChange={v => updateCost('gastos_sin_factura', v)} onBlur={saveCosts} />
        <CostInput label="Otros variables" value={costs.otros_variables} onChange={v => updateCost('otros_variables', v)} onBlur={saveCosts} />
      </View>

      {/* P&L DASHBOARD */}
      <View style={[st.card, { borderColor: margenColor + '40', borderWidth: 2 }]}>
        <Text style={st.cardTitle}>📈 Estado de Resultados</Text>
        <Text style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>{MESES[mes-1]} {anio}</Text>

        <Row label="Venta neta" val={fmt(ventaNeta)} bold />
        <Row label="(-) Costo mercadería" val={fmt(comprasNetas)} sub />
        <View style={{ borderTopWidth: 2, borderTopColor: COLORS.border, marginVertical: 6, paddingTop: 6 }}>
          <Row label="UTILIDAD BRUTA" val={`${fmt(utilidadBruta)} (${pct(utilidadBruta, ventaNeta)}%)`} bold />
        </View>
        <Row label="(-) Remuneraciones" val={fmt(totalRemuneraciones)} sub />
        <Row label="(-) Gastos fijos" val={fmt(totalFijos)} sub />
        <Row label="(-) Gastos variables" val={fmt(totalVariables)} sub />
        <View style={{ borderTopWidth: 2, borderTopColor: COLORS.border, marginVertical: 6, paddingTop: 6 }}>
          <Row label="UTILIDAD OPERACIONAL" val={`${fmt(utilidadOp)} (${pct(utilidadOp, ventaNeta)}%)`} bold />
        </View>
        <View style={{ backgroundColor: margenColor + '15', borderRadius: 10, padding: 14, marginTop: 8, borderWidth: 1, borderColor: margenColor + '30' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text }}>UTILIDAD NETA</Text>
            <Text style={{ fontSize: 24, fontWeight: '900', color: margenColor }}>{fmt(utilidadNeta)}</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: margenColor, textAlign: 'right', marginTop: 4 }}>Margen: {margenNeto}%</Text>
        </View>

        {/* Composición */}
        {ventaNeta > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>COMPOSICIÓN DE COSTOS</Text>
            <BarIndicator label="Mercadería" value={comprasNetas} total={ventaNeta} color="#ef4444" />
            <BarIndicator label="Remuneraciones" value={totalRemuneraciones} total={ventaNeta} color="#f59e0b" />
            <BarIndicator label="Gastos fijos" value={totalFijos} total={ventaNeta} color="#3b82f6" />
            <BarIndicator label="Gastos variables" value={totalVariables} total={ventaNeta} color="#8b5cf6" />
            <BarIndicator label="Utilidad" value={Math.max(0, utilidadNeta)} total={ventaNeta} color={COLORS.success} />
          </View>
        )}
      </View>

      {/* ACCIONES */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <TouchableOpacity style={[st.btnPrimary, { flex: 1 }]} onPress={saveReport}>
          <Text style={st.btnPrimaryT}>💾 Guardar reporte</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.btnSecondary, { flex: 1 }]} onPress={exportPDF}>
          <Text style={st.btnSecondaryT}>🖨 Exportar PDF</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Row({ label, val, bold, sub, accent }: { label: string; val: string; bold?: boolean; sub?: boolean; accent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ fontSize: sub ? 12 : 13, fontWeight: bold ? '700' : '400', color: sub ? COLORS.textMuted : COLORS.text }}>{label}</Text>
      <Text style={{ fontSize: sub ? 12 : bold ? 15 : 13, fontWeight: bold ? '800' : '500', color: accent ? COLORS.primary : COLORS.text }}>{val}</Text>
    </View>
  );
}

function CostInput({ label, value, onChange, onBlur }: { label: string; value: number; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 }}>
      <Text style={{ flex: 1, fontSize: 12, color: COLORS.textSecondary }}>{label}</Text>
      <TextInput style={{ backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, fontWeight: '600', color: COLORS.text, width: 120, textAlign: 'right' }}
        value={value > 0 ? String(value) : ''} onChangeText={onChange} onBlur={onBlur} keyboardType="number-pad" placeholder="$0" placeholderTextColor={COLORS.textMuted} />
    </View>
  );
}

function BarIndicator({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const p = total > 0 ? Math.round(value / total * 100) : 0;
  return (
    <View style={{ marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
        <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>{label}</Text>
        <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.text }}>{fmt(value)} ({p}%)</Text>
      </View>
      <View style={{ height: 8, backgroundColor: COLORS.border, borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ height: 8, width: `${Math.min(100, p)}%`, backgroundColor: color, borderRadius: 4 }} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background },
  card: { backgroundColor: COLORS.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  secLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginTop: 12, marginBottom: 6, letterSpacing: 1 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipT: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  chipActiveT: { color: '#fff' },
  btnPrimary: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  btnPrimaryT: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnSecondary: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  btnSecondaryT: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
});
