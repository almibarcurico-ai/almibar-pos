import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../theme';

interface InvoiceItem { id:string; ingredient:any; quantity:string; unit_price:string; purchase_unit:string; }

export default function PurchasesScreen({onBack}:{onBack:()=>void}){
  const {user}=useAuth();
  const [invoices,setInvoices]=useState<any[]>([]);const [suppliers,setSuppliers]=useState<any[]>([]);const [ingredients,setIngredients]=useState<any[]>([]);
  const [modal,setModal]=useState(false);const [supplierId,setSupplierId]=useState('');const [invoiceNum,setInvoiceNum]=useState('');
  const [payMethod,setPayMethod]=useState('transferencia');const [items,setItems]=useState<InvoiceItem[]>([]);const [notes,setNotes]=useState('');
  const [addItemModal,setAddItemModal]=useState(false);const [selIng,setSelIng]=useState<any>(null);const [iQty,setIQty]=useState('');const [iPrice,setIPrice]=useState('');const [iPUnit,setIPUnit]=useState('kg');const [iSearch,setISearch]=useState('');
  const [detailModal,setDetailModal]=useState(false);const [detailInvoice,setDetailInvoice]=useState<any>(null);

  useEffect(()=>{load()},[]);
  const load=async()=>{
    const{data:inv}=await supabase.from('purchase_invoices').select('*, supplier:supplier_id(name), items:purchase_items(*, ingredient:ingredient_id(name,unit))').order('created_at',{ascending:false});if(inv)setInvoices(inv);
    const{data:sup}=await supabase.from('suppliers').select('*').eq('active',true).order('name');if(sup)setSuppliers(sup);
    const{data:ing}=await supabase.from('ingredients').select('*').eq('active',true).order('name');if(ing)setIngredients(ing);
  };

  const fmt=(p:number)=>'$'+Math.round(p).toLocaleString('es-CL');
  const itemsTotal=items.reduce((s,i)=>{const q=parseFloat(i.quantity)||0;const p=parseFloat(i.unit_price)||0;return s+q*p},0);
  const itemsIva=Math.round(itemsTotal*0.19);

  const addItem=()=>{
    if(!selIng||!iQty||!iPrice){Alert.alert('Error','Completa todos los campos');return}
    setItems(prev=>[...prev,{id:`i-${Date.now()}`,ingredient:selIng,quantity:iQty,unit_price:iPrice,purchase_unit:iPUnit}]);
    setAddItemModal(false);setSelIng(null);setIQty('');setIPrice('');setISearch('');
  };

  const removeItem=(id:string)=>setItems(prev=>prev.filter(i=>i.id!==id));

  const saveInvoice=async()=>{
    if(!user)return;if(items.length===0){Alert.alert('Error','Agrega al menos un item');return}
    try{
      const subtotal=itemsTotal;const iva=itemsIva;const total=subtotal+iva;
      const invoiceData:any={invoice_number:invoiceNum||null,date:new Date().toISOString().split('T')[0],payment_method:payMethod,subtotal,iva,total,notes:notes||null,created_by:user.id};
      if(supplierId){invoiceData.supplier_id=supplierId}
      const{data:inv,error:e1}=await supabase.from('purchase_invoices').insert(invoiceData).select().single();
      if(e1){console.error('Invoice error:',e1);throw e1}
      const purchaseItems=items.map(i=>({invoice_id:inv.id,ingredient_id:i.ingredient.id,quantity:parseFloat(i.quantity)||0,unit_price:parseFloat(i.unit_price)||0,purchase_unit:i.purchase_unit,total_price:Math.round((parseFloat(i.quantity)||0)*(parseFloat(i.unit_price)||0))}));
      const{error:e2}=await supabase.from('purchase_items').insert(purchaseItems);if(e2){console.error('Items error:',e2);throw e2}
      setModal(false);setItems([]);setSupplierId('');setInvoiceNum('');setNotes('');
      Alert.alert('✅ Factura registrada',`Total: ${fmt(total)}\nStock actualizado automáticamente`);await load();
    }catch(e:any){Alert.alert('Error al guardar',e.message||JSON.stringify(e))}
  };

  return(<View style={s.c}>
    <View style={s.hdr}><TouchableOpacity onPress={onBack}><Text style={s.back}>← Admin</Text></TouchableOpacity><Text style={s.hdrT}>🧾 Compras</Text><TouchableOpacity style={s.addBtn} onPress={()=>{setItems([]);setSupplierId('');setInvoiceNum('');setNotes('');setPayMethod('transferencia');setModal(true)}}><Text style={s.addBtnT}>+ Factura</Text></TouchableOpacity></View>
    <ScrollView style={{flex:1}} contentContainerStyle={{padding:16,paddingBottom:100}}>
      <Text style={s.cnt}>{invoices.length} facturas registradas</Text>
      {invoices.map(inv=>(<TouchableOpacity key={inv.id} style={s.row} onPress={()=>{setDetailInvoice(inv);setDetailModal(true)}}>
        <View style={{flex:1}}><Text style={s.rn}>{inv.supplier?.name||'Sin proveedor'} — {inv.invoice_number||'S/N'}</Text>
        <Text style={s.rs}>{new Date(inv.created_at).toLocaleDateString('es-CL')} • {inv.payment_method} • {inv.items?.length||0} items</Text></View>
        <Text style={{fontSize:15,fontWeight:'700',color:COLORS.primary}}>{fmt(inv.total)}</Text>
      </TouchableOpacity>))}
      {invoices.length===0&&<View style={{alignItems:'center',paddingTop:60}}><Text style={{fontSize:40}}>🧾</Text><Text style={{color:COLORS.textMuted,marginTop:8}}>Sin facturas. Registra la primera.</Text></View>}
    </ScrollView>

    {/* NEW INVOICE MODAL */}
    <Modal visible={modal} animationType="slide"><View style={s.c}>
      <View style={s.hdr}><TouchableOpacity onPress={()=>setModal(false)}><Text style={{color:COLORS.error,fontSize:15,fontWeight:'600'}}>✕ Cancelar</Text></TouchableOpacity><Text style={{fontSize:16,fontWeight:'700',color:COLORS.text}}>Nueva Factura</Text><View style={{width:70}}/></View>
      <ScrollView style={{flex:1}} contentContainerStyle={{padding:16,paddingBottom:200}}>
        <Text style={s.lb}>Proveedor</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{maxHeight:42}}>
          {suppliers.map(sup=>(<TouchableOpacity key={sup.id} onPress={()=>setSupplierId(sup.id)} style={{paddingHorizontal:14,paddingVertical:8,borderRadius:14,backgroundColor:supplierId===sup.id?COLORS.primary:COLORS.card,borderWidth:1,borderColor:supplierId===sup.id?COLORS.primary:COLORS.border,marginRight:6}}><Text style={{fontSize:12,fontWeight:'600',color:supplierId===sup.id?'#fff':COLORS.textSecondary}}>{sup.name}</Text></TouchableOpacity>))}
        </ScrollView>
        <Text style={s.lb}>N° Factura</Text><TextInput style={s.inp} value={invoiceNum} onChangeText={setInvoiceNum} placeholder="Ej: F-001234" placeholderTextColor={COLORS.textMuted}/>
        <Text style={s.lb}>Método de pago</Text>
        <View style={{flexDirection:'row',gap:6}}>
          {['efectivo','transferencia','credito','debito'].map(m=>(<TouchableOpacity key={m} onPress={()=>setPayMethod(m)} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:14,backgroundColor:payMethod===m?COLORS.primary:COLORS.card,borderWidth:1,borderColor:payMethod===m?COLORS.primary:COLORS.border}}><Text style={{fontSize:12,fontWeight:'600',color:payMethod===m?'#fff':COLORS.textSecondary}}>{m.charAt(0).toUpperCase()+m.slice(1)}</Text></TouchableOpacity>))}
        </View>

        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:20}}>
          <Text style={{fontSize:14,fontWeight:'700',color:COLORS.textSecondary,textTransform:'uppercase'}}>Items ({items.length})</Text>
          <TouchableOpacity style={s.addBtn} onPress={()=>{setISearch('');setSelIng(null);setIQty('');setIPrice('');setIPUnit('kg');setAddItemModal(true)}}><Text style={s.addBtnT}>+ Item</Text></TouchableOpacity>
        </View>

        {items.map(i=>{const tot=Math.round((parseFloat(i.quantity)||0)*(parseFloat(i.unit_price)||0));return(
          <View key={i.id} style={s.row}><View style={{flex:1}}><Text style={s.rn}>{i.ingredient.name}</Text><Text style={s.rs}>{i.quantity} {i.purchase_unit} × {fmt(parseFloat(i.unit_price)||0)} = {fmt(tot)}</Text></View>
          <TouchableOpacity onPress={()=>removeItem(i.id)}><Text>🗑</Text></TouchableOpacity></View>
        )})}

        {items.length>0&&<View style={{marginTop:16,backgroundColor:COLORS.card,borderRadius:12,padding:16,borderWidth:1,borderColor:COLORS.border}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:3}}><Text style={{color:COLORS.textSecondary}}>Subtotal</Text><Text style={{fontWeight:'600',color:COLORS.text}}>{fmt(itemsTotal)}</Text></View>
          <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:3}}><Text style={{color:COLORS.textSecondary}}>IVA 19%</Text><Text style={{fontWeight:'600',color:COLORS.text}}>{fmt(itemsIva)}</Text></View>
          <View style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:6,borderTopWidth:2,borderTopColor:COLORS.primary,marginTop:4}}><Text style={{fontSize:16,fontWeight:'800',color:COLORS.text}}>TOTAL</Text><Text style={{fontSize:16,fontWeight:'800',color:COLORS.primary}}>{fmt(itemsTotal+itemsIva)}</Text></View>
        </View>}

        <Text style={s.lb}>Notas</Text><TextInput style={s.inp} value={notes} onChangeText={setNotes} placeholder="Observaciones" placeholderTextColor={COLORS.textMuted}/>
      </ScrollView>
      {items.length>0&&<View style={{position:'absolute',bottom:0,left:0,right:0,padding:16,backgroundColor:COLORS.card,borderTopWidth:1,borderTopColor:COLORS.border,paddingBottom:30}}>
        <TouchableOpacity style={{backgroundColor:COLORS.success,borderRadius:12,paddingVertical:16,alignItems:'center'}} onPress={saveInvoice}>
          <Text style={{color:'#fff',fontSize:16,fontWeight:'700'}}>💾 Registrar Factura — {fmt(itemsTotal+itemsIva)}</Text>
        </TouchableOpacity>
      </View>}
    </View></Modal>

    {/* ADD ITEM MODAL */}
    <Modal visible={addItemModal} transparent animationType="fade"><View style={s.ov}><ScrollView contentContainerStyle={{flexGrow:1,justifyContent:'center',alignItems:'center',padding:16}}><View style={[s.md,{maxWidth:480}]}>
      <Text style={s.mdT}>Agregar Item</Text>
      <TextInput style={s.si} placeholder="🔍 Buscar ingrediente..." placeholderTextColor={COLORS.textMuted} value={iSearch} onChangeText={setISearch}/>
      <ScrollView style={{maxHeight:180,marginTop:8}}>
        {ingredients.filter(i=>!iSearch||i.name.toLowerCase().includes(iSearch.toLowerCase())).map(i=>(
          <TouchableOpacity key={i.id} style={[{padding:10,borderRadius:8,marginVertical:2},selIng?.id===i.id?{backgroundColor:COLORS.primary+'25',borderWidth:1,borderColor:COLORS.primary}:{backgroundColor:COLORS.background}]} onPress={()=>setSelIng(i)}>
            <Text style={{fontSize:14,color:COLORS.text,fontWeight:selIng?.id===i.id?'700':'400'}}>{i.name} ({i.category})</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {selIng&&<><Text style={s.lb}>Unidad de compra</Text>
        <View style={{flexDirection:'row',gap:6}}>{['kg','lt','unidad','caja','bolsa'].map(u=><TouchableOpacity key={u} onPress={()=>setIPUnit(u)} style={{paddingHorizontal:12,paddingVertical:6,borderRadius:12,backgroundColor:iPUnit===u?COLORS.primary:COLORS.card,borderWidth:1,borderColor:iPUnit===u?COLORS.primary:COLORS.border}}><Text style={{fontSize:12,fontWeight:'600',color:iPUnit===u?'#fff':COLORS.textSecondary}}>{u}</Text></TouchableOpacity>)}</View>
        <Text style={s.lb}>Cantidad</Text><TextInput style={s.inp} value={iQty} onChangeText={setIQty} keyboardType="decimal-pad" placeholder="Ej: 5" placeholderTextColor={COLORS.textMuted}/>
        <Text style={s.lb}>Precio unitario (neto)</Text><TextInput style={s.inp} value={iPrice} onChangeText={setIPrice} keyboardType="number-pad" placeholder="Ej: 8500" placeholderTextColor={COLORS.textMuted}/>
        {iQty&&iPrice&&<Text style={{fontSize:14,color:COLORS.primary,textAlign:'center',marginTop:8,fontWeight:'700'}}>Total: {fmt(Math.round((parseFloat(iQty)||0)*(parseFloat(iPrice)||0)))}</Text>}
      </>}
      <View style={s.mBs}><TouchableOpacity style={s.bC} onPress={()=>setAddItemModal(false)}><Text style={s.bCT}>Cancelar</Text></TouchableOpacity><TouchableOpacity style={s.bOk} onPress={addItem}><Text style={s.bOkT}>Agregar</Text></TouchableOpacity></View>
    </View></ScrollView></View></Modal>

    {/* DETAIL MODAL */}
    <Modal visible={detailModal} transparent animationType="fade"><View style={s.ov}><ScrollView contentContainerStyle={{flexGrow:1,justifyContent:'center',alignItems:'center',padding:16}}><View style={[s.md,{maxWidth:500}]}>
      <Text style={s.mdT}>🧾 Detalle Factura</Text>
      {detailInvoice&&<><Text style={{textAlign:'center',color:COLORS.textSecondary,fontSize:13}}>{detailInvoice.supplier?.name} — {detailInvoice.invoice_number||'S/N'}</Text>
        <Text style={{textAlign:'center',color:COLORS.textMuted,fontSize:12,marginTop:4}}>{new Date(detailInvoice.created_at).toLocaleDateString('es-CL')} • {detailInvoice.payment_method}</Text>
        <View style={{height:1,backgroundColor:COLORS.border,marginVertical:12}}/>
        {detailInvoice.items?.map((i:any)=>(<View key={i.id} style={{flexDirection:'row',paddingVertical:4}}><Text style={{flex:1,fontSize:13,color:COLORS.text}}>{i.ingredient?.name}</Text><Text style={{fontSize:12,color:COLORS.textSecondary}}>{i.quantity} {i.purchase_unit}</Text><Text style={{fontSize:13,fontWeight:'600',color:COLORS.text,marginLeft:12}}>{fmt(i.total_price)}</Text></View>))}
        <View style={{height:1,backgroundColor:COLORS.border,marginVertical:12}}/>
        <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{fontWeight:'800',color:COLORS.text}}>TOTAL</Text><Text style={{fontWeight:'800',color:COLORS.primary}}>{fmt(detailInvoice.total)}</Text></View>
      </>}
      <TouchableOpacity style={[s.bOk,{marginTop:20}]} onPress={()=>setDetailModal(false)}><Text style={s.bOkT}>Cerrar</Text></TouchableOpacity>
    </View></ScrollView></View></Modal>
  </View>)}
const s=StyleSheet.create({c:{flex:1,backgroundColor:COLORS.background},hdr:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:16,paddingTop:50,paddingBottom:12,backgroundColor:COLORS.card,borderBottomWidth:1,borderBottomColor:COLORS.border},back:{color:COLORS.primary,fontSize:15,fontWeight:'600'},hdrT:{fontSize:18,fontWeight:'700',color:COLORS.text},addBtn:{paddingHorizontal:14,paddingVertical:8,borderRadius:8,backgroundColor:COLORS.primary},addBtnT:{color:'#fff',fontWeight:'700',fontSize:13},cnt:{fontSize:12,color:COLORS.textMuted,marginBottom:8},row:{flexDirection:'row',alignItems:'center',backgroundColor:COLORS.card,borderRadius:10,padding:14,marginVertical:3,borderWidth:1,borderColor:COLORS.border},rn:{fontSize:14,fontWeight:'600',color:COLORS.text},rs:{fontSize:11,color:COLORS.textMuted,marginTop:2},si:{backgroundColor:COLORS.card,borderRadius:10,borderWidth:1,borderColor:COLORS.border,paddingHorizontal:14,paddingVertical:10,fontSize:14,color:COLORS.text},ov:{flex:1,backgroundColor:COLORS.overlay},md:{width:'92%' as any,maxWidth:450,backgroundColor:COLORS.card,borderRadius:16,padding:24,borderWidth:1,borderColor:COLORS.border},mdT:{fontSize:20,fontWeight:'700',color:COLORS.text,textAlign:'center',marginBottom:8},lb:{fontSize:13,color:COLORS.textSecondary,marginBottom:6,marginTop:14},inp:{backgroundColor:COLORS.background,borderRadius:10,borderWidth:1,borderColor:COLORS.border,paddingHorizontal:14,paddingVertical:12,fontSize:15,color:COLORS.text},mBs:{flexDirection:'row',gap:12,marginTop:20},bC:{flex:1,paddingVertical:14,borderRadius:10,borderWidth:1,borderColor:COLORS.border,alignItems:'center'},bCT:{color:COLORS.textSecondary,fontWeight:'600',fontSize:15},bOk:{flex:1,paddingVertical:14,borderRadius:10,backgroundColor:COLORS.primary,alignItems:'center'},bOkT:{color:'#fff',fontWeight:'700',fontSize:15}});
