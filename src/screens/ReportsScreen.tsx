import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';
import { COLORS } from '../theme';
interface Props { onBack: () => void; }
export default function ReportsScreen({ onBack }: Props) {
  const [orders, setOrders] = useState<any[]>([]); const [items, setItems] = useState<any[]>([]); const [period, setPeriod] = useState<'hoy'|'semana'|'mes'>('hoy');
  useEffect(() => { load(); }, [period]);
  const load = async () => {
    const now = new Date(); let since: string;
    if (period==='hoy') since=now.toISOString().split('T')[0];
    else if (period==='semana') { const d=new Date(now);d.setDate(d.getDate()-7);since=d.toISOString().split('T')[0]; }
    else { const d=new Date(now);d.setMonth(d.getMonth()-1);since=d.toISOString().split('T')[0]; }
    const { data: o } = await supabase.from('orders').select('*').eq('status','cerrada').gte('closed_at',since);
    if (o) setOrders(o);
    const ids=(o||[]).map((x:any)=>x.id);
    if (ids.length>0) { const { data: it } = await supabase.from('order_items').select('*, product:product_id(name)').in('order_id',ids); if (it) setItems(it); }
    else setItems([]);
  };
  const fmt = (p: number) => '$' + p.toLocaleString('es-CL');
  const tv = orders.reduce((s,o)=>s+o.total,0);
  const pm: Record<string,{name:string;qty:number;total:number}> = {};
  items.forEach(i => { const n=i.product?.name||'?'; if(!pm[n])pm[n]={name:n,qty:0,total:0}; pm[n].qty+=i.quantity; pm[n].total+=i.total_price; });
  const top = Object.values(pm).sort((a,b)=>b.total-a.total).slice(0,20);
  return (
    <View style={s.c}>
      <View style={s.hdr}><TouchableOpacity onPress={onBack}><Text style={s.back}>← Admin</Text></TouchableOpacity><Text style={s.hdrT}>📊 Reportes</Text><View style={{width:40}}/></View>
      <View style={{flexDirection:'row',paddingHorizontal:16,paddingVertical:10,gap:8}}>
        {(['hoy','semana','mes'] as const).map(p=><TouchableOpacity key={p} style={{paddingHorizontal:14,paddingVertical:8,borderRadius:14,backgroundColor:period===p?COLORS.primary:COLORS.card,borderWidth:1,borderColor:period===p?COLORS.primary:COLORS.border}} onPress={()=>setPeriod(p)}><Text style={{fontSize:12,fontWeight:'600',color:period===p?'#fff':COLORS.textSecondary}}>{p.charAt(0).toUpperCase()+p.slice(1)}</Text></TouchableOpacity>)}
      </View>
      <ScrollView contentContainerStyle={{padding:16,paddingBottom:100}}>
        <View style={{backgroundColor:COLORS.card,borderRadius:16,padding:24,borderWidth:1,borderColor:COLORS.border,alignItems:'center'}}>
          <Text style={{fontSize:32,fontWeight:'800',color:COLORS.primary}}>{fmt(tv)}</Text>
          <Text style={{color:COLORS.textSecondary,fontSize:13}}>{orders.length} órdenes • Ticket prom. {orders.length>0?fmt(Math.round(tv/orders.length)):'$0'}</Text>
        </View>
        <Text style={s.sec}>Top Productos</Text>
        {top.map((p,i)=><View key={p.name} style={s.row}>
          <Text style={{fontSize:14,fontWeight:'700',color:COLORS.textMuted,width:24}}>{i+1}</Text>
          <View style={{flex:1}}><Text style={s.rn}>{p.name}</Text><Text style={s.rs}>{p.qty} vendidos</Text></View>
          <Text style={{fontSize:14,fontWeight:'700',color:COLORS.primary}}>{fmt(p.total)}</Text>
        </View>)}
        {top.length===0&&<Text style={{textAlign:'center',color:COLORS.textMuted,marginTop:20}}>Sin datos</Text>}
      </ScrollView>
    </View>
  );
}
const s=StyleSheet.create({c:{flex:1,backgroundColor:COLORS.background},hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:50,paddingBottom:12,backgroundColor:COLORS.card,borderBottomWidth:1,borderBottomColor:COLORS.border},back:{color:COLORS.primary,fontSize:15,fontWeight:'600'},hdrT:{fontSize:18,fontWeight:'700',color:COLORS.text},sec:{fontSize:13,fontWeight:'700',color:COLORS.textSecondary,marginTop:20,marginBottom:8,textTransform:'uppercase'},row:{flexDirection:'row',alignItems:'center',backgroundColor:COLORS.card,borderRadius:10,padding:14,marginVertical:3,borderWidth:1,borderColor:COLORS.border,gap:10},rn:{fontSize:14,fontWeight:'600',color:COLORS.text},rs:{fontSize:11,color:COLORS.textMuted,marginTop:2}});
