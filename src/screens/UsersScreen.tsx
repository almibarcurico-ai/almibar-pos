import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Switch } from 'react-native';
import { supabase } from '../lib/supabase';
import { COLORS } from '../theme';
interface Props { onBack: () => void; }
export default function UsersScreen({ onBack }: Props) {
  const [users, setUsers] = useState<any[]>([]); const [modal, setModal] = useState(false);
  const [nu, setNu] = useState({name:'',pin:'',role:'garzon',email:''});
  useEffect(() => { load(); }, []);
  const load = async () => { const { data } = await supabase.from('users').select('*').order('name'); if (data) setUsers(data); };
  const add = async () => {
    if (!nu.name||!nu.pin||nu.pin.length!==4) { Alert.alert('Error','Nombre y PIN 4 dígitos obligatorios'); return; }
    await supabase.from('users').insert({name:nu.name,pin:nu.pin,role:nu.role,email:nu.email||null});
    setModal(false); setNu({name:'',pin:'',role:'garzon',email:''}); await load();
  };
  const toggle = async (u: any) => { await supabase.from('users').update({active:!u.active}).eq('id',u.id); await load(); };
  const rc: Record<string,string> = {admin:COLORS.error,cajero:COLORS.warning,garzon:COLORS.info};
  return (
    <View style={s.c}>
      <View style={s.hdr}><TouchableOpacity onPress={onBack}><Text style={s.back}>← Admin</Text></TouchableOpacity><Text style={s.hdrT}>👥 Usuarios</Text><TouchableOpacity style={s.addBtn} onPress={()=>setModal(true)}><Text style={s.addBtnT}>+ Nuevo</Text></TouchableOpacity></View>
      <ScrollView contentContainerStyle={{padding:16,paddingBottom:100}}>
        {users.map(u=><View key={u.id} style={[s.row,!u.active&&{opacity:0.4}]}>
          <View style={{flex:1}}><Text style={s.rn}>{u.name}</Text><View style={{flexDirection:'row',gap:8,marginTop:4}}>
            <View style={{backgroundColor:(rc[u.role]||COLORS.textMuted)+'25',paddingHorizontal:8,paddingVertical:2,borderRadius:4}}><Text style={{fontSize:10,fontWeight:'700',color:rc[u.role]}}>{u.role.toUpperCase()}</Text></View>
            <Text style={{fontSize:11,color:COLORS.textMuted}}>PIN: {u.pin}</Text></View></View>
          <Switch value={u.active} onValueChange={()=>toggle(u)} trackColor={{true:COLORS.success}} />
        </View>)}
      </ScrollView>
      <Modal visible={modal} transparent animationType="fade"><View style={s.ov}><View style={s.md}>
        <Text style={s.mdT}>Nuevo Usuario</Text>
        <Text style={s.lb}>Nombre</Text><TextInput style={s.inp} value={nu.name} onChangeText={t=>setNu(u=>({...u,name:t}))} placeholderTextColor={COLORS.textMuted} />
        <Text style={s.lb}>PIN (4 dígitos)</Text><TextInput style={s.inp} value={nu.pin} onChangeText={t=>setNu(u=>({...u,pin:t.slice(0,4)}))} keyboardType="number-pad" maxLength={4} placeholderTextColor={COLORS.textMuted} />
        <Text style={s.lb}>Rol</Text><View style={{flexDirection:'row',gap:8}}>
          {['garzon','cajero','admin'].map(r=><TouchableOpacity key={r} style={{paddingHorizontal:14,paddingVertical:8,borderRadius:14,backgroundColor:nu.role===r?COLORS.primary:COLORS.card,borderWidth:1,borderColor:nu.role===r?COLORS.primary:COLORS.border}} onPress={()=>setNu(u=>({...u,role:r}))}><Text style={{fontSize:12,fontWeight:'600',color:nu.role===r?'#fff':COLORS.textSecondary}}>{r}</Text></TouchableOpacity>)}
        </View>
        <View style={s.btns}><TouchableOpacity style={s.bC} onPress={()=>setModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity><TouchableOpacity style={s.bOk} onPress={add}><Text style={s.bOkT}>Crear</Text></TouchableOpacity></View>
      </View></View></Modal>
    </View>
  );
}
const s=StyleSheet.create({c:{flex:1,backgroundColor:COLORS.background},hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:50,paddingBottom:12,backgroundColor:COLORS.card,borderBottomWidth:1,borderBottomColor:COLORS.border},back:{color:COLORS.primary,fontSize:15,fontWeight:'600'},hdrT:{fontSize:18,fontWeight:'700',color:COLORS.text},addBtn:{paddingHorizontal:14,paddingVertical:8,borderRadius:8,backgroundColor:COLORS.primary},addBtnT:{color:'#fff',fontSize:13,fontWeight:'600'},row:{flexDirection:'row',alignItems:'center',backgroundColor:COLORS.card,borderRadius:10,padding:14,marginVertical:3,borderWidth:1,borderColor:COLORS.border,gap:10},rn:{fontSize:14,fontWeight:'600',color:COLORS.text},ov:{flex:1,backgroundColor:COLORS.overlay,justifyContent:'center',alignItems:'center'},md:{width:'90%' as any,maxWidth:450,backgroundColor:COLORS.card,borderRadius:16,padding:24,borderWidth:1,borderColor:COLORS.border},mdT:{fontSize:20,fontWeight:'700',color:COLORS.text,textAlign:'center'},lb:{fontSize:13,color:COLORS.textSecondary,marginBottom:6,marginTop:12},inp:{backgroundColor:COLORS.background,borderRadius:10,borderWidth:1,borderColor:COLORS.border,paddingHorizontal:14,paddingVertical:12,fontSize:15,color:COLORS.text},btns:{flexDirection:'row',gap:12,marginTop:20},bC:{flex:1,paddingVertical:14,borderRadius:10,borderWidth:1,borderColor:COLORS.border,alignItems:'center'},bCT:{color:COLORS.textSecondary,fontWeight:'600',fontSize:15},bOk:{flex:1,paddingVertical:14,borderRadius:10,backgroundColor:COLORS.primary,alignItems:'center'},bOkT:{color:'#fff',fontWeight:'700',fontSize:15}});
