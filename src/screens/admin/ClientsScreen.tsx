// src/screens/admin/ClientsScreen.tsx
// Club de Socios — admin module
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, RefreshControl } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  member_since: string;
  member_number: number;
  tier: string;
  total_visits: number;
  visits_for_reward: number;
  rewards_claimed: number;
  last_visit_at: string | null;
  total_spent: number;
  total_orders: number;
  average_ticket: number;
  notes: string | null;
  tags: string[];
  active: boolean;
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export default function ClientsScreen() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // Add form
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addNotes, setAddNotes] = useState('');

  const loadClients = useCallback(async () => {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('active', true).order('member_number', { ascending: false });
    if (data) setClients(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  const onRefresh = async () => { setRefreshing(true); await loadClients(); setRefreshing(false); };

  const filtered = clients.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.notes && c.notes.toLowerCase().includes(q)) ||
      String(c.member_number).includes(q)
    );
  });

  const handleAdd = async () => {
    if (!addName.trim()) { Alert.alert('', 'Ingresa el nombre'); return; }
    const { error } = await supabase.from('clients').insert({
      name: addName.trim(),
      phone: addPhone.trim() || null,
      email: addEmail.trim() || null,
      notes: addNotes.trim() || null,
      tags: ['manual'],
    });
    if (error) { Alert.alert('Error', error.message); return; }
    setShowAdd(false);
    setAddName(''); setAddPhone(''); setAddEmail(''); setAddNotes('');
    loadClients();
  };

  const handleDelete = async (client: Client) => {
    const ok = typeof window !== 'undefined' ? window.confirm('Eliminar a ' + client.name + '?') : true;
    if (!ok) return;
    await supabase.from('clients').update({ active: false }).eq('id', client.id);
    setSelected(null);
    loadClients();
  };

  const addVisitManual = async (client: Client) => {
    const { data } = await supabase.rpc('register_visit', {
      p_client_id: client.id,
      p_method: 'manual',
    });
    if (data && data.reward) {
      Alert.alert('🎉 ¡Premio!', `${client.name} completó 3 visitas y ganó un premio!`);
    } else {
      Alert.alert('✅ Visita registrada', `${client.name}: ${data?.visits || '?'}/3 visitas`);
    }
    loadClients();
  };

  // Stats
  const totalClients = clients.length;
  const totalVisits = clients.reduce((s, c) => s + c.total_visits, 0);
  const totalSpent = clients.reduce((s, c) => s + c.total_spent, 0);
  const avgTicket = clients.filter(c => c.total_orders > 0).length > 0
    ? totalSpent / clients.filter(c => c.total_orders > 0).reduce((s, c) => s + c.total_orders, 0)
    : 0;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>👥 Club de Socios</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(!showAdd)}>
          <Text style={s.addBtnT}>{showAdd ? '✕' : '+ Agregar'}</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.stat}><Text style={s.statNum}>{totalClients}</Text><Text style={s.statLabel}>Socios</Text></View>
        <View style={s.stat}><Text style={s.statNum}>{totalVisits}</Text><Text style={s.statLabel}>Visitas</Text></View>
        <View style={s.stat}><Text style={s.statNum}>{fmt(totalSpent)}</Text><Text style={s.statLabel}>Ventas</Text></View>
        <View style={s.stat}><Text style={s.statNum}>{fmt(avgTicket)}</Text><Text style={s.statLabel}>Ticket prom.</Text></View>
      </View>

      {/* Add form */}
      {showAdd && (
        <View style={s.addForm}>
          <TextInput style={s.input} placeholder="Nombre *" placeholderTextColor={COLORS.textMuted} value={addName} onChangeText={setAddName} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Teléfono" placeholderTextColor={COLORS.textMuted} value={addPhone} onChangeText={setAddPhone} keyboardType="phone-pad" />
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Email" placeholderTextColor={COLORS.textMuted} value={addEmail} onChangeText={setAddEmail} />
          </View>
          <TextInput style={s.input} placeholder="Notas (RUT, etc.)" placeholderTextColor={COLORS.textMuted} value={addNotes} onChangeText={setAddNotes} />
          <TouchableOpacity style={s.saveBtn} onPress={handleAdd}>
            <Text style={s.saveBtnT}>Guardar Socio</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search */}
      <TextInput
        style={s.search}
        placeholder="🔍 Buscar por nombre, teléfono, RUT..."
        placeholderTextColor={COLORS.textMuted}
        value={search}
        onChangeText={setSearch}
      />

      {/* List + Detail */}
      <View style={s.body}>
        {/* Client list */}
        <ScrollView
          style={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        >
          {filtered.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[s.row, selected?.id === c.id && s.rowActive]}
              onPress={() => setSelected(c)}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{c.name}</Text>
                <Text style={s.rowSub}>
                  #{c.member_number} · {c.phone || 'Sin tel.'} · {c.total_visits} visitas
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.rowSpent}>{fmt(c.total_spent)}</Text>
                <View style={[s.tierBadge, { backgroundColor: c.tier === 'vip' ? '#F59E0B' : c.tier === 'gold' ? '#EAB308' : COLORS.primary }]}>
                  <Text style={s.tierText}>{c.tier.toUpperCase()}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
          {filtered.length === 0 && (
            <Text style={{ color: COLORS.textMuted, textAlign: 'center', padding: 40 }}>
              {search ? 'Sin resultados' : 'No hay socios registrados'}
            </Text>
          )}
        </ScrollView>

        {/* Detail panel */}
        {selected ? (
          <ScrollView style={s.detail}>
            <Text style={s.detailName}>{selected.name}</Text>
            <View style={[s.tierBadge, { backgroundColor: selected.tier === 'vip' ? '#F59E0B' : selected.tier === 'gold' ? '#EAB308' : COLORS.primary, alignSelf: 'flex-start', marginBottom: 12 }]}>
              <Text style={s.tierText}>SOCIO #{selected.member_number} · {selected.tier.toUpperCase()}</Text>
            </View>

            <View style={s.detailSection}>
              <Text style={s.detailLabel}>Contacto</Text>
              <Text style={s.detailValue}>📞 {selected.phone || '—'}</Text>
              <Text style={s.detailValue}>📧 {selected.email || '—'}</Text>
              {selected.birthday && <Text style={s.detailValue}>🎂 {fmtDate(selected.birthday)}</Text>}
            </View>

            <View style={s.detailSection}>
              <Text style={s.detailLabel}>Fidelidad</Text>
              <View style={s.fidelRow}>
                <View style={s.fidelItem}>
                  <Text style={s.fidelNum}>{selected.total_visits}</Text>
                  <Text style={s.fidelLabel}>Visitas totales</Text>
                </View>
                <View style={s.fidelItem}>
                  <Text style={[s.fidelNum, { color: '#F59E0B' }]}>{selected.visits_for_reward}/3</Text>
                  <Text style={s.fidelLabel}>Para premio</Text>
                </View>
                <View style={s.fidelItem}>
                  <Text style={[s.fidelNum, { color: '#10B981' }]}>{selected.rewards_claimed}</Text>
                  <Text style={s.fidelLabel}>Premios</Text>
                </View>
              </View>
              <Text style={s.detailValue}>Última visita: {fmtDate(selected.last_visit_at)}</Text>
            </View>

            <View style={s.detailSection}>
              <Text style={s.detailLabel}>Consumo</Text>
              <View style={s.fidelRow}>
                <View style={s.fidelItem}>
                  <Text style={s.fidelNum}>{selected.total_orders}</Text>
                  <Text style={s.fidelLabel}>Pedidos</Text>
                </View>
                <View style={s.fidelItem}>
                  <Text style={[s.fidelNum, { color: COLORS.primary }]}>{fmt(selected.total_spent)}</Text>
                  <Text style={s.fidelLabel}>Gasto total</Text>
                </View>
                <View style={s.fidelItem}>
                  <Text style={s.fidelNum}>{fmt(selected.average_ticket)}</Text>
                  <Text style={s.fidelLabel}>Ticket prom.</Text>
                </View>
              </View>
            </View>

            {selected.notes && (
              <View style={s.detailSection}>
                <Text style={s.detailLabel}>Notas</Text>
                <Text style={s.detailValue}>{selected.notes}</Text>
              </View>
            )}

            <Text style={s.detailLabel}>Miembro desde: {fmtDate(selected.member_since)}</Text>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#10B981' }]} onPress={() => addVisitManual(selected)}>
                <Text style={s.actionBtnT}>+ Visita Manual</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#EF4444' }]} onPress={() => handleDelete(selected)}>
                <Text style={s.actionBtnT}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <View style={[s.detail, { justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 40 }}>👥</Text>
            <Text style={{ color: COLORS.textMuted, marginTop: 8 }}>Selecciona un socio</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  addBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  addBtnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
  statsRow: { flexDirection: 'row', padding: 12, gap: 8 },
  stat: { flex: 1, backgroundColor: COLORS.card, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statNum: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  addForm: { padding: 16, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8 },
  input: { backgroundColor: COLORS.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 8, padding: 12, alignItems: 'center' },
  saveBtnT: { color: '#fff', fontWeight: '700', fontSize: 14 },
  search: { margin: 12, backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  body: { flex: 1, flexDirection: 'row' },
  list: { flex: 1, borderRightWidth: 1, borderRightColor: COLORS.border },
  row: { flexDirection: 'row', padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' },
  rowActive: { backgroundColor: COLORS.primary + '15' },
  rowName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  rowSpent: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  tierBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  tierText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  detail: { flex: 1, padding: 20 },
  detailName: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  detailSection: { marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  detailLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  detailValue: { fontSize: 14, color: COLORS.text, marginBottom: 4 },
  fidelRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  fidelItem: { flex: 1, backgroundColor: COLORS.background, borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  fidelNum: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  fidelLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  actionBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  actionBtnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
