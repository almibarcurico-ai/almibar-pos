import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Modal, StyleSheet, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { COLORS } from '../theme';

// Sonido de notificación para nuevas reservas
const playNotifSound = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Melodía corta: ding-dong
      const play = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur);
      };
      play(880, 0, 0.15); play(1100, 0.15, 0.2); play(1320, 0.3, 0.3);
    } catch (e) {}
  }
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pendiente: { label: 'Pendiente', color: '#F5A623', icon: '⏳' },
  confirmada: { label: 'Confirmada', color: COLORS.success, icon: '✅' },
  rechazada: { label: 'Rechazada', color: COLORS.error, icon: '❌' },
  completada: { label: 'Completada', color: '#3B82F6', icon: '🎉' },
  no_show: { label: 'No asistió', color: '#999', icon: '👻' },
};

export default function ReservationsScreen() {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<any[]>([]);
  const [filter, setFilter] = useState<'hoy' | 'manana' | 'semana' | 'todas'>('hoy');
  const [statusFilter, setStatusFilter] = useState<string>('todas');
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // New reservation
  const [newModal, setNewModal] = useState(false);
  const [rNombre, setRNombre] = useState('');
  const [rCelular, setRCelular] = useState('');
  const [rMotivo, setRMotivo] = useState('cena');
  const [rPersonas, setRPersonas] = useState('2');
  const [rFecha, setRFecha] = useState(new Date().toLocaleDateString('en-CA'));
  const [rHora, setRHora] = useState('20:00');
  const [rNotas, setRNotas] = useState('');
  const [rMesa, setRMesa] = useState('');

  const prevCountRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const today = now.toLocaleDateString('en-CA');
    const tomorrow = new Date(now.getTime() + 86400000).toLocaleDateString('en-CA');
    const weekEnd = new Date(now.getTime() + 7 * 86400000).toLocaleDateString('en-CA');

    let query = supabase.from('reservations').select('*, client:client_id(name, phone, member_number)').order('fecha').order('hora');

    if (filter === 'hoy') query = query.eq('fecha', today);
    else if (filter === 'manana') query = query.eq('fecha', tomorrow);
    else if (filter === 'semana') query = query.gte('fecha', today).lte('fecha', weekEnd);

    const { data } = await query;
    const newData = data || [];
    // Detectar nuevas reservas pendientes → sonar
    const newPendientes = newData.filter((r: any) => r.status === 'pendiente').length;
    if (prevCountRef.current > 0 && newPendientes > prevCountRef.current) {
      playNotifSound();
    }
    prevCountRef.current = newPendientes;
    setReservations(newData);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Polling cada 30s para reservas nuevas
  useEffect(() => { const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('reservations').update({
      status, confirmed_by: user?.id, confirmed_at: new Date().toISOString(),
    }).eq('id', id);
    if (selected?.id === id) setSelected({ ...selected, status });
    await load();
  };

  const assignTable = async (id: string, mesa: number) => {
    await supabase.from('reservations').update({ mesa_asignada: mesa }).eq('id', id);
    if (selected?.id === id) setSelected({ ...selected, mesa_asignada: mesa });
    await load();
  };

  const createReservation = async () => {
    if (!rNombre.trim() || !rFecha) { Alert.alert('', 'Nombre y fecha son requeridos'); return; }
    await supabase.from('reservations').insert({
      nombre: rNombre.trim(), celular: rCelular.trim() || null,
      motivo: rMotivo, personas: parseInt(rPersonas) || 2,
      fecha: rFecha, hora: rHora, notas: rNotas.trim() || null,
      mesa_asignada: parseInt(rMesa) || null, status: 'confirmada',
      confirmed_by: user?.id, confirmed_at: new Date().toISOString(),
    });
    setNewModal(false); setRNombre(''); setRCelular(''); setRNotas(''); setRMesa('');
    Alert.alert('✅ Reserva creada');
    await load();
  };

  const filtered = statusFilter === 'todas' ? reservations : reservations.filter(r => r.status === statusFilter);
  const pendientes = reservations.filter(r => r.status === 'pendiente').length;

  const formatFecha = (f: string) => {
    const d = new Date(f + 'T12:00:00');
    const today = new Date().toLocaleDateString('en-CA');
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');
    if (f === today) return 'Hoy';
    if (f === tomorrow) return 'Mañana';
    return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <View style={st.wrap}>
      {/* Header */}
      <View style={st.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>📋 Reservas</Text>
          {pendientes > 0 && (
            <View style={{ backgroundColor: COLORS.error, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{pendientes} pendiente{pendientes > 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {/* Date filters */}
          {([['hoy', 'Hoy'], ['manana', 'Mañana'], ['semana', 'Semana'], ['todas', 'Todas']] as const).map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => setFilter(k)}
              style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: filter === k ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: filter === k ? COLORS.primary : COLORS.border }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: filter === k ? '#fff' : COLORS.textSecondary }}>{l}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.primary }}
            onPress={() => { setRNombre(''); setRCelular(''); setRNotas(''); setRMesa(''); setRPersonas('2'); setRHora('20:00'); setRFecha(new Date().toLocaleDateString('en-CA')); setNewModal(true); }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>+ Nueva</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Status filter */}
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <TouchableOpacity onPress={() => setStatusFilter('todas')}
          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: statusFilter === 'todas' ? COLORS.text : COLORS.background, borderWidth: 1, borderColor: statusFilter === 'todas' ? COLORS.text : COLORS.border }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: statusFilter === 'todas' ? '#fff' : COLORS.textSecondary }}>Todas ({reservations.length})</Text>
        </TouchableOpacity>
        {Object.entries(STATUS_CONFIG).map(([k, v]) => {
          const count = reservations.filter(r => r.status === k).length;
          if (count === 0 && k !== 'pendiente') return null;
          return (
            <TouchableOpacity key={k} onPress={() => setStatusFilter(k)}
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: statusFilter === k ? v.color + '20' : COLORS.background, borderWidth: 1, borderColor: statusFilter === k ? v.color : COLORS.border }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: statusFilter === k ? v.color : COLORS.textSecondary }}>{v.icon} {count}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* List */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {filtered.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 40 }}>📋</Text>
              <Text style={{ color: COLORS.textMuted, marginTop: 8 }}>Sin reservas para {filter === 'hoy' ? 'hoy' : filter === 'manana' ? 'mañana' : 'este período'}</Text>
            </View>
          )}
          {filtered.map((r, i) => {
            const sc = STATUS_CONFIG[r.status] || STATUS_CONFIG.pendiente;
            const isActive = selected?.id === r.id;
            return (
              <TouchableOpacity key={r.id} onPress={() => setSelected(r)}
                style={{ flexDirection: 'row', padding: 14, backgroundColor: isActive ? COLORS.primary + '10' : i % 2 === 0 ? COLORS.card : COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.border, borderLeftWidth: isActive ? 3 : 0, borderLeftColor: COLORS.primary, alignItems: 'center', gap: 12 }}>
                {/* Time */}
                <View style={{ width: 50, alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text }}>{r.hora || '-'}</Text>
                  <Text style={{ fontSize: 9, color: COLORS.textMuted }}>{formatFecha(r.fecha)}</Text>
                </View>
                {/* Info */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{r.nombre}</Text>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>👥 {r.personas} · {r.motivo || 'Cena'}{r.mesa_asignada ? ` · Mesa ${r.mesa_asignada}` : ''}</Text>
                </View>
                {/* Status badge */}
                <View style={{ backgroundColor: sc.color + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: sc.color + '30' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: sc.color }}>{sc.icon} {sc.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Detail panel */}
        {selected && (
          <View style={{ width: 340, backgroundColor: COLORS.card, borderLeftWidth: 1, borderLeftColor: COLORS.border }}>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>Reserva</Text>
                <TouchableOpacity onPress={() => setSelected(null)}><Text style={{ color: COLORS.textMuted, fontSize: 18 }}>✕</Text></TouchableOpacity>
              </View>

              <View style={{ backgroundColor: COLORS.background, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.text }}>{selected.nombre}</Text>
                {selected.celular && <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>📱 {selected.celular}</Text>}
                {selected.client?.member_number && <Text style={{ fontSize: 11, color: COLORS.primary, marginTop: 2 }}>Socio #{selected.client.member_number}</Text>}
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1, backgroundColor: COLORS.background, borderRadius: 10, padding: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.text }}>{selected.hora || '-'}</Text>
                  <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Hora</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: COLORS.background, borderRadius: 10, padding: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.text }}>{selected.personas}</Text>
                  <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Personas</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: COLORS.background, borderRadius: 10, padding: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.primary }}>{selected.mesa_asignada || '-'}</Text>
                  <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Mesa</Text>
                </View>
              </View>

              {selected.motivo && <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>🎯 {selected.motivo}</Text>}
              {selected.notas && <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>📝 {selected.notas}</Text>}
              <Text style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 16 }}>📅 {formatFecha(selected.fecha)} · Creada {new Date(selected.created_at).toLocaleString('es-CL')}</Text>

              {/* Asignar mesa */}
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>ASIGNAR MESA</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(n => (
                  <TouchableOpacity key={n} onPress={() => assignTable(selected.id, n)}
                    style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: selected.mesa_asignada === n ? COLORS.primary : COLORS.background, borderWidth: 1, borderColor: selected.mesa_asignada === n ? COLORS.primary : COLORS.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: selected.mesa_asignada === n ? '#fff' : COLORS.text }}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Status actions */}
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 }}>ESTADO</Text>
              <View style={{ gap: 8 }}>
                {selected.status === 'pendiente' && (<>
                  <TouchableOpacity style={{ backgroundColor: COLORS.success, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} onPress={() => updateStatus(selected.id, 'confirmada')}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>✅ Confirmar reserva</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ backgroundColor: COLORS.error + '15', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.error + '30' }} onPress={() => updateStatus(selected.id, 'rechazada')}>
                    <Text style={{ color: COLORS.error, fontWeight: '600', fontSize: 13 }}>Rechazar</Text>
                  </TouchableOpacity>
                </>)}
                {selected.status === 'confirmada' && (<>
                  <TouchableOpacity style={{ backgroundColor: '#3B82F6', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }} onPress={() => updateStatus(selected.id, 'completada')}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>🎉 Marcar completada</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ backgroundColor: COLORS.background, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }} onPress={() => updateStatus(selected.id, 'no_show')}>
                    <Text style={{ color: COLORS.textSecondary, fontWeight: '600', fontSize: 13 }}>👻 No asistió</Text>
                  </TouchableOpacity>
                </>)}
                {(selected.status === 'rechazada' || selected.status === 'no_show') && (
                  <TouchableOpacity style={{ backgroundColor: COLORS.background, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }} onPress={() => updateStatus(selected.id, 'pendiente')}>
                    <Text style={{ color: COLORS.textSecondary, fontWeight: '600', fontSize: 13 }}>↩ Reabrir</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        )}
      </View>

      {/* New reservation modal */}
      <Modal visible={newModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 24, width: '90%', maxWidth: 420 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 16 }}>Nueva Reserva</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Text style={st.lb}>Nombre *</Text><TextInput style={st.inp} value={rNombre} onChangeText={setRNombre} placeholder="Nombre" placeholderTextColor={COLORS.textMuted} /></View>
              <View style={{ flex: 1 }}><Text style={st.lb}>Celular</Text><TextInput style={st.inp} value={rCelular} onChangeText={setRCelular} placeholder="+569..." placeholderTextColor={COLORS.textMuted} keyboardType="phone-pad" /></View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Text style={st.lb}>Fecha *</Text><TextInput style={st.inp} value={rFecha} onChangeText={setRFecha} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.textMuted} /></View>
              <View style={{ flex: 1 }}><Text style={st.lb}>Hora</Text><TextInput style={st.inp} value={rHora} onChangeText={setRHora} placeholder="20:00" placeholderTextColor={COLORS.textMuted} /></View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Text style={st.lb}>Personas</Text><TextInput style={st.inp} value={rPersonas} onChangeText={setRPersonas} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><Text style={st.lb}>Mesa</Text><TextInput style={st.inp} value={rMesa} onChangeText={setRMesa} placeholder="Opcional" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" /></View>
            </View>
            <Text style={st.lb}>Motivo</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {['cena', 'almuerzo', 'cumpleaños', 'evento', 'after office'].map(m => (
                <TouchableOpacity key={m} onPress={() => setRMotivo(m)}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: rMotivo === m ? COLORS.primary : COLORS.background, borderWidth: 1, borderColor: rMotivo === m ? COLORS.primary : COLORS.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: rMotivo === m ? '#fff' : COLORS.textSecondary }}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={st.lb}>Notas</Text>
            <TextInput style={st.inp} value={rNotas} onChangeText={setRNotas} placeholder="Notas adicionales" placeholderTextColor={COLORS.textMuted} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }} onPress={() => setNewModal(false)}>
                <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' }} onPress={createReservation}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  lb: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 3, marginTop: 8 },
  inp: { backgroundColor: COLORS.background, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text },
});
