import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Modal, StyleSheet, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { COLORS } from '../theme';

const playNotif = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const p = (f: number, s: number, d: number) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.3, ctx.currentTime + s); g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + s + d); o.start(ctx.currentTime + s); o.stop(ctx.currentTime + s + d); };
      p(880, 0, 0.15); p(1100, 0.15, 0.2); p(1320, 0.3, 0.3);
    } catch (e) {}
  }
};

const SC: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pendiente: { label: 'Pendiente', color: '#F59E0B', bg: '#FEF3C7', icon: '⏳' },
  confirmada: { label: 'Confirmada', color: '#059669', bg: '#D1FAE5', icon: '✅' },
  rechazada: { label: 'Rechazada', color: '#EF4444', bg: '#FEE2E2', icon: '❌' },
  completada: { label: 'Completada', color: '#3B82F6', bg: '#DBEAFE', icon: '🎉' },
  no_show: { label: 'No asistió', color: '#6B7280', bg: '#F3F4F6', icon: '👻' },
};

export default function ReservationsScreen() {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<any[]>([]);
  const [filter, setFilter] = useState<'hoy' | 'manana' | 'semana' | 'todas'>('hoy');
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newModal, setNewModal] = useState(false);
  const [rNombre, setRNombre] = useState(''); const [rCelular, setRCelular] = useState('');
  const [rMotivo, setRMotivo] = useState('cena'); const [rPersonas, setRPersonas] = useState('2');
  const [rFecha, setRFecha] = useState(new Date().toLocaleDateString('en-CA'));
  const [rHora, setRHora] = useState('20:00'); const [rNotas, setRNotas] = useState(''); const [rMesa, setRMesa] = useState('');
  const prevPend = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const today = now.toLocaleDateString('en-CA');
    const tomorrow = new Date(now.getTime() + 86400000).toLocaleDateString('en-CA');
    const weekEnd = new Date(now.getTime() + 7 * 86400000).toLocaleDateString('en-CA');
    let q = supabase.from('reservations').select('*').order('fecha').order('hora');
    if (filter === 'hoy') q = q.eq('fecha', today);
    else if (filter === 'manana') q = q.eq('fecha', tomorrow);
    else if (filter === 'semana') q = q.gte('fecha', today).lte('fecha', weekEnd);
    const { data } = await q;
    const d = data || [];
    const np = d.filter(r => r.status === 'pendiente').length;
    if (prevPend.current > 0 && np > prevPend.current) playNotif();
    prevPend.current = np;
    setReservations(d);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const iv = setInterval(load, 15000); return () => clearInterval(iv); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('reservations').update({ status, confirmed_by: user?.id, confirmed_at: new Date().toISOString() }).eq('id', id);
    if (selected?.id === id) setSelected({ ...selected, status });
    await load();
  };

  const assignMesa = async (id: string, mesa: number) => {
    await supabase.from('reservations').update({ mesa_asignada: mesa, status: 'confirmada', confirmed_by: user?.id, confirmed_at: new Date().toISOString() }).eq('id', id);
    if (selected?.id === id) setSelected({ ...selected, mesa_asignada: mesa, status: 'confirmada' });
    await load();
  };

  const createReservation = async () => {
    if (!rNombre.trim() || !rFecha) return;
    await supabase.from('reservations').insert({ nombre: rNombre.trim(), celular: rCelular.trim() || null, motivo: rMotivo, personas: parseInt(rPersonas) || 2, fecha: rFecha, hora: rHora, notas: rNotas.trim() || null, mesa_asignada: parseInt(rMesa) || null, status: parseInt(rMesa) ? 'confirmada' : 'pendiente', confirmed_by: parseInt(rMesa) ? user?.id : null, confirmed_at: parseInt(rMesa) ? new Date().toISOString() : null });
    setNewModal(false); setRNombre(''); setRCelular(''); setRNotas(''); setRMesa('');
    await load();
  };

  const fmt = (f: string) => { const d = new Date(f + 'T12:00:00'); const t = new Date().toLocaleDateString('en-CA'); const tm = new Date(Date.now() + 86400000).toLocaleDateString('en-CA'); if (f === t) return 'Hoy'; if (f === tm) return 'Mañana'; return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }); };

  const pendientes = reservations.filter(r => r.status === 'pendiente');
  const confirmadas = reservations.filter(r => r.status === 'confirmada');
  const otras = reservations.filter(r => !['pendiente', 'confirmada'].includes(r.status));
  const today = new Date().toLocaleDateString('en-CA');

  return (
    <View style={s.wrap}>
      {/* Header */}
      <View style={s.hdr}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>📋 Reservas</Text>
          {pendientes.length > 0 && <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{pendientes.length} pendiente{pendientes.length > 1 ? 's' : ''}</Text></View>}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([['hoy', 'Hoy'], ['manana', 'Mañana'], ['semana', 'Semana'], ['todas', 'Todas']] as const).map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => setFilter(k)} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: filter === k ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: filter === k ? COLORS.primary : COLORS.border }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: filter === k ? '#fff' : COLORS.textSecondary }}>{l}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.primary }} onPress={() => { setRNombre(''); setRCelular(''); setRNotas(''); setRMesa(''); setRPersonas('2'); setRHora('20:00'); setRFecha(new Date().toLocaleDateString('en-CA')); setNewModal(true); }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>+ Nueva</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Main list */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Todas las reservas en una sola lista */}
          {reservations.map(r => <ReservaCard key={r.id} r={r} selected={selected} onSelect={setSelected} fmt={fmt} today={today} onAssignMesa={assignMesa} />)}

          {reservations.length === 0 && !loading && (
            <View style={{ alignItems: 'center', paddingTop: 80 }}>
              <Text style={{ fontSize: 48 }}>📋</Text>
              <Text style={{ color: COLORS.textMuted, marginTop: 12, fontSize: 15 }}>Sin reservas para {filter === 'hoy' ? 'hoy' : filter === 'manana' ? 'mañana' : 'este período'}</Text>
            </View>
          )}
        </ScrollView>

        {/* Detail panel */}
        {selected && (
          <View style={s.detail}>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text }}>Detalle</Text>
                <TouchableOpacity onPress={() => setSelected(null)}><Text style={{ fontSize: 20, color: COLORS.textMuted }}>✕</Text></TouchableOpacity>
              </View>

              {/* Cliente info */}
              <View style={{ backgroundColor: COLORS.background, borderRadius: 14, padding: 16, marginBottom: 14 }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.text }}>{selected.nombre}</Text>
                {selected.celular && <TouchableOpacity onPress={() => { if (Platform.OS === 'web') window.open('tel:' + selected.celular); }}><Text style={{ fontSize: 14, color: COLORS.primary, marginTop: 4 }}>📱 {selected.celular}</Text></TouchableOpacity>}
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
                  <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.text }}>{selected.hora || '-'}</Text><Text style={{ fontSize: 10, color: COLORS.textMuted }}>Hora</Text></View>
                  <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.text }}>{selected.personas}</Text><Text style={{ fontSize: 10, color: COLORS.textMuted }}>Personas</Text></View>
                  <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 24, fontWeight: '800', color: selected.mesa_asignada ? COLORS.primary : COLORS.textMuted }}>{selected.mesa_asignada || '—'}</Text><Text style={{ fontSize: 10, color: COLORS.textMuted }}>Mesa</Text></View>
                </View>
                {selected.motivo && <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 8 }}>🎯 {selected.motivo}</Text>}
                {selected.notas && <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>📝 {selected.notas}</Text>}
                <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 8 }}>📅 {fmt(selected.fecha)}</Text>
              </View>

              {/* Acciones */}
              <View style={{ gap: 8 }}>
                {selected.status === 'pendiente' && (
                  <TouchableOpacity style={{ backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} onPress={() => updateStatus(selected.id, 'rechazada')}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>❌ Rechazar</Text>
                  </TouchableOpacity>
                )}
                {selected.status === 'confirmada' && (<>
                  <TouchableOpacity style={{ backgroundColor: '#3B82F6', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} onPress={() => updateStatus(selected.id, 'completada')}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>🎉 Completada</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ backgroundColor: COLORS.background, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }} onPress={() => updateStatus(selected.id, 'no_show')}>
                    <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>👻 No asistió</Text>
                  </TouchableOpacity>
                </>)}
                {['rechazada', 'no_show'].includes(selected.status) && (
                  <TouchableOpacity style={{ backgroundColor: COLORS.background, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }} onPress={() => updateStatus(selected.id, 'pendiente')}>
                    <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>↩ Reabrir</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        )}
      </View>

      {/* New modal */}
      <Modal visible={newModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 24, width: '90%', maxWidth: 420 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 16 }}>Nueva Reserva</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Text style={s.lb}>Nombre *</Text><TextInput style={s.inp} value={rNombre} onChangeText={setRNombre} placeholder="Nombre" placeholderTextColor={COLORS.textMuted} /></View>
              <View style={{ flex: 1 }}><Text style={s.lb}>Celular</Text><TextInput style={s.inp} value={rCelular} onChangeText={setRCelular} placeholder="+569..." placeholderTextColor={COLORS.textMuted} /></View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Text style={s.lb}>Fecha *</Text><TextInput style={s.inp} value={rFecha} onChangeText={setRFecha} /></View>
              <View style={{ flex: 1 }}><Text style={s.lb}>Hora</Text><TextInput style={s.inp} value={rHora} onChangeText={setRHora} /></View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Text style={s.lb}>Personas</Text><TextInput style={s.inp} value={rPersonas} onChangeText={setRPersonas} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><Text style={s.lb}>Mesa</Text><TextInput style={s.inp} value={rMesa} onChangeText={setRMesa} placeholder="—" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" /></View>
            </View>
            <Text style={s.lb}>Motivo</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {['cena', 'almuerzo', 'cumpleaños', 'evento', 'after office'].map(m => (
                <TouchableOpacity key={m} onPress={() => setRMotivo(m)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: rMotivo === m ? COLORS.primary : COLORS.background, borderWidth: 1, borderColor: rMotivo === m ? COLORS.primary : COLORS.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: rMotivo === m ? '#fff' : COLORS.textSecondary }}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.lb}>Notas</Text>
            <TextInput style={s.inp} value={rNotas} onChangeText={setRNotas} placeholder="Notas adicionales" placeholderTextColor={COLORS.textMuted} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }} onPress={() => setNewModal(false)}><Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' }} onPress={createReservation}><Text style={{ color: '#fff', fontWeight: '700' }}>Crear</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ReservaCard({ r, selected, onSelect, fmt, today, onAssignMesa }: any) {
  const sc = SC[r.status] || SC.pendiente;
  const isActive = selected?.id === r.id;
  const isToday = r.fecha === today;
  const [mesaInput, setMesaInput] = React.useState(r.mesa_asignada ? String(r.mesa_asignada) : '');

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 6, borderRadius: 12, backgroundColor: isActive ? COLORS.primary + '08' : COLORS.card, borderWidth: isActive ? 2 : 1, borderColor: isActive ? COLORS.primary : COLORS.border, borderLeftWidth: 4, borderLeftColor: sc.color, gap: 12 }}>
      {/* Hora */}
      <View style={{ width: 55, alignItems: 'center' }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>{r.hora || '-'}</Text>
        <Text style={{ fontSize: 10, color: isToday ? COLORS.primary : COLORS.textMuted, fontWeight: isToday ? '700' : '400' }}>{fmt(r.fecha)}</Text>
      </View>
      {/* Info */}
      <TouchableOpacity style={{ flex: 1 }} onPress={() => onSelect(r)}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>{r.nombre}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>👥 {r.personas}</Text>
          {r.motivo && <Text style={{ fontSize: 12, color: COLORS.textMuted }}>{r.motivo}</Text>}
          {r.celular && <Text style={{ fontSize: 11, color: COLORS.textMuted }}>📱 {r.celular}</Text>}
          {r.notas && <Text style={{ fontSize: 11, color: COLORS.textMuted }}>📝 {r.notas}</Text>}
        </View>
      </TouchableOpacity>
      {/* Mesa input */}
      <View style={{ alignItems: 'center', width: 60 }}>
        <TextInput
          style={{ width: 50, height: 40, borderRadius: 8, backgroundColor: r.mesa_asignada ? COLORS.primary + '15' : COLORS.background, borderWidth: 1.5, borderColor: r.mesa_asignada ? COLORS.primary : COLORS.border, textAlign: 'center', fontSize: 16, fontWeight: '800', color: r.mesa_asignada ? COLORS.primary : COLORS.text }}
          value={mesaInput}
          onChangeText={setMesaInput}
          onBlur={() => { const n = parseInt(mesaInput); if (n > 0) onAssignMesa(r.id, n); }}
          keyboardType="number-pad"
          placeholder="—"
          placeholderTextColor={COLORS.textMuted}
        />
        <Text style={{ fontSize: 8, color: COLORS.textMuted, marginTop: 2, fontWeight: '600' }}>MESA</Text>
      </View>
      {/* Status */}
      <View style={{ backgroundColor: sc.bg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: sc.color }}>{sc.icon} {sc.label}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.background },
  hdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  secTitle: { fontSize: 12, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 1, marginBottom: 8 },
  detail: { width: 360, backgroundColor: COLORS.card, borderLeftWidth: 1, borderLeftColor: COLORS.border },
  lb: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 3, marginTop: 8 },
  inp: { backgroundColor: COLORS.background, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text },
});
