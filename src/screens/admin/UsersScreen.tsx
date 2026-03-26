// src/screens/admin/UsersScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Switch } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';
import { Chip, LB, sh } from './shared';

export default function UsersScreen() {
  const [users, setUsers] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [nu, setNu] = useState({ name: '', pin: '', role: 'garzon', email: '' });

  useEffect(() => { load(); }, []);
  const load = async () => { const { data } = await supabase.from('users').select('*').order('name'); if (data) setUsers(data); };

  const add = async () => {
    if (!nu.name || !nu.pin || nu.pin.length !== 4) { Alert.alert('Error', 'Nombre y PIN (4 dígitos) obligatorios'); return; }
    try {
      await supabase.from('users').insert({ name: nu.name, pin: nu.pin, role: nu.role, email: nu.email || null });
      setModal(false); setNu({ name: '', pin: '', role: 'garzon', email: '' }); await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const toggle = async (u: any) => { await supabase.from('users').update({ active: !u.active }).eq('id', u.id); await load(); };
  const rc: Record<string, string> = { admin: COLORS.error, cajero: COLORS.warning, garzon: COLORS.info };

  return (
    <View style={sh.c}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={sh.count}>{users.length} usuarios</Text>
        <TouchableOpacity style={sh.addBtn} onPress={() => setModal(true)}><Text style={sh.addBtnT}>+ Nuevo</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {users.map(u => (
          <View key={u.id} style={[sh.row, !u.active && { opacity: 0.4 }]}>
            <View style={{ flex: 1 }}>
              <Text style={sh.rowName}>{u.name}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <View style={{ backgroundColor: (rc[u.role] || COLORS.textMuted) + '25', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: rc[u.role] }}>{u.role.toUpperCase()}</Text>
                </View>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>PIN: {u.pin}</Text>
              </View>
            </View>
            <Switch value={u.active} onValueChange={() => toggle(u)} trackColor={{ true: COLORS.success }} />
          </View>
        ))}
      </ScrollView>
      <Modal visible={modal} transparent animationType="fade">
        <View style={sh.ov}><View style={sh.md}>
          <Text style={sh.mdT}>Nuevo Usuario</Text>
          <LB text="Nombre" /><TextInput style={sh.inp} value={nu.name} onChangeText={t => setNu(u => ({ ...u, name: t }))} placeholder="Nombre" placeholderTextColor={COLORS.textMuted} />
          <LB text="PIN (4 dígitos)" /><TextInput style={sh.inp} value={nu.pin} onChangeText={t => setNu(u => ({ ...u, pin: t.slice(0, 4) }))} keyboardType="number-pad" maxLength={4} placeholder="1234" placeholderTextColor={COLORS.textMuted} />
          <LB text="Rol" />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {['garzon', 'cajero', 'admin'].map(r => <Chip key={r} label={r.charAt(0).toUpperCase() + r.slice(1)} active={nu.role === r} onPress={() => setNu(u => ({ ...u, role: r }))} />)}
          </View>
          <LB text="Email (opcional)" /><TextInput style={sh.inp} value={nu.email} onChangeText={t => setNu(u => ({ ...u, email: t }))} placeholder="email@ejemplo.cl" placeholderTextColor={COLORS.textMuted} />
          <View style={sh.mBs}>
            <TouchableOpacity style={sh.bC} onPress={() => setModal(false)}><Text style={sh.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={sh.bOk} onPress={add}><Text style={sh.bOkT}>Crear</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}
