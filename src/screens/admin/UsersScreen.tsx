// src/screens/admin/UsersScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Switch } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../theme';
import { Chip, LB, sh } from './shared';

export default function UsersScreen() {
  const [users, setUsers] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [nu, setNu] = useState({ name: '', pin: '', role: 'garzon', email: '' });
  const [edit, setEdit] = useState<any>(null);

  useEffect(() => { load(); }, []);
  const load = async () => { const { data } = await supabase.from('users').select('*').order('name'); if (data) setUsers(data); };

  const add = async () => {
    if (!nu.name || !nu.pin || nu.pin.length !== 4) { Alert.alert('Error', 'Nombre y PIN (4 dígitos) obligatorios'); return; }
    try {
      await supabase.from('users').insert({ name: nu.name, pin: nu.pin, role: nu.role, email: nu.email || null });
      setModal(false); setNu({ name: '', pin: '', role: 'garzon', email: '' }); await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const openEdit = (u: any) => { setEdit({ ...u, newPin: '' }); setEditModal(true); };

  const saveEdit = async () => {
    if (!edit) return;
    const updates: any = { name: edit.name, role: edit.role, email: edit.email || null };
    if (edit.newPin && edit.newPin.length === 4) updates.pin = edit.newPin;
    const { error } = await supabase.from('users').update(updates).eq('id', edit.id);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Guardado', edit.name + ' actualizado');
    setEditModal(false); setEdit(null); await load();
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
          <TouchableOpacity key={u.id} style={[sh.row, !u.active && { opacity: 0.4 }]} onPress={() => openEdit(u)} activeOpacity={0.7}>
            <View style={{ flex: 1 }}>
              <Text style={sh.rowName}>{u.name}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <View style={{ backgroundColor: (rc[u.role] || COLORS.textMuted) + '25', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: rc[u.role] }}>{u.role.toUpperCase()}</Text>
                </View>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>PIN: {u.pin}</Text>
                {u.email && <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{u.email}</Text>}
              </View>
            </View>
            <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '600', marginRight: 8 }}>Editar</Text>
            <Switch value={u.active} onValueChange={() => toggle(u)} trackColor={{ true: COLORS.success }} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Modal Nuevo */}
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

      {/* Modal Editar */}
      <Modal visible={editModal} transparent animationType="fade">
        <View style={sh.ov}><View style={sh.md}>
          <Text style={sh.mdT}>Editar Usuario</Text>
          {edit && <>
            <LB text="Nombre" /><TextInput style={sh.inp} value={edit.name} onChangeText={t => setEdit((e: any) => ({ ...e, name: t }))} placeholderTextColor={COLORS.textMuted} />
            <LB text="Rol" />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {['garzon', 'cajero', 'admin'].map(r => <Chip key={r} label={r.charAt(0).toUpperCase() + r.slice(1)} active={edit.role === r} onPress={() => setEdit((e: any) => ({ ...e, role: r }))} />)}
            </View>
            <LB text="Email" /><TextInput style={sh.inp} value={edit.email || ''} onChangeText={t => setEdit((e: any) => ({ ...e, email: t }))} placeholder="email@ejemplo.cl" placeholderTextColor={COLORS.textMuted} />
            <LB text="PIN actual" /><Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text, paddingVertical: 4 }}>{edit.pin}</Text>
            <LB text="Nuevo PIN (dejar vacío para no cambiar)" /><TextInput style={sh.inp} value={edit.newPin} onChangeText={t => setEdit((e: any) => ({ ...e, newPin: t.slice(0, 4) }))} keyboardType="number-pad" maxLength={4} placeholder="Nuevo PIN" placeholderTextColor={COLORS.textMuted} />
          </>}
          <View style={sh.mBs}>
            <TouchableOpacity style={sh.bC} onPress={() => { setEditModal(false); setEdit(null); }}><Text style={sh.bCT}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={sh.bOk} onPress={saveEdit}><Text style={sh.bOkT}>Guardar</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}
