// App.tsx — Role-based tab navigation

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ConnectivityProvider, useConnectivity } from './src/contexts/ConnectivityContext';
import { supabase } from './src/lib/supabase';
import LoginScreen from './src/screens/LoginScreen';
import TableMapScreen from './src/screens/TableMapScreen';
import OrderScreen from './src/screens/OrderScreen';
import TableEditorScreen from './src/screens/TableEditorScreen';
import CajaScreen from './src/screens/CajaScreen';
import DeliveryScreen from './src/screens/DeliveryScreen';
import AdminScreen from './src/screens/AdminScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import TabNavigator from './src/components/TabNavigator';
import MobileTableScreen from './src/screens/MobileTableScreen';
import { COLORS } from './src/theme';
import { TableWithOrder } from './src/types';

type DetailScreen =
  | { type: 'order'; table: TableWithOrder }
  | { type: 'editor' }
  | { type: 'inventory'; sub: string }
  | null;

function OfflineBanner() {
  const { isOnline, isOfflineMode, pendingOpsCount, isSyncing } = useConnectivity();
  if (isOnline && !isSyncing && pendingOpsCount === 0) return null;
  return (
    <View style={{ backgroundColor: !isOnline ? '#F44336' : isSyncing ? '#FF9800' : '#4CAF50', paddingVertical: 4, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
        {!isOnline ? '📴 SIN CONEXIÓN — Modo offline activo' : isSyncing ? '🔄 Sincronizando...' : `✅ ${pendingOpsCount} operaciones pendientes`}
      </Text>
    </View>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('mesas');
  const [detail, setDetail] = useState<DetailScreen>(null);
  const [hasOpenArqueo, setHasOpenArqueo] = useState<boolean | null>(null);

  // Verificar si hay arqueo abierto
  useEffect(() => {
    if (!user) return;
    checkArqueo();
    const iv = setInterval(checkArqueo, 30000); // re-check cada 30s
    return () => clearInterval(iv);
  }, [user]);

  const checkArqueo = async () => {
    try {
      const { data } = await supabase.from('cash_registers').select('id').is('closed_at', null).limit(1);
      setHasOpenArqueo(data && data.length > 0);
    } catch { setHasOpenArqueo(true); } // si falla, dejar pasar
  };

  if (loading) {
    return <View style={s.loading}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }
  if (!user) return <LoginScreen />;

  // Bloquear si no hay arqueo abierto (solo para cajero/admin en PC)
  if (hasOpenArqueo === false && (user.role === 'cajero' || user.role === 'admin') && Dimensions.get('window').width >= 600) {
    return (
      <View style={[s.loading, { gap: 16 }]}>
        <Text style={{ fontSize: 40 }}>🔒</Text>
        <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.text }}>Arqueo de Caja Requerido</Text>
        <Text style={{ fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', maxWidth: 400 }}>
          Debes abrir un arqueo de caja antes de iniciar el turno. Ve a Caja → Arqueos para abrir uno.
        </Text>
        <TouchableOpacity onPress={() => { setActiveTab('caja'); setHasOpenArqueo(true); }} style={{ backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, marginTop: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Ir a Caja</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Mobile view for phones (< 600px)
  const isMobile = Dimensions.get('window').width < 600;

  if (isMobile) {
    if (detail?.type === 'order') {
      return <OrderScreen table={detail.table} onBack={() => setDetail(null)} />;
    }
    return <MobileTableScreen onOpenOrder={(table) => setDetail({ type: 'order', table })} />;
  }

  // Detail screens (overlay main tabs)
  if (detail?.type === 'order') {
    return (
      <OrderScreen
        table={detail.table}
        onBack={() => setDetail(null)}
      />
    );
  }
  if (detail?.type === 'editor') {
    return (
      <TableEditorScreen
        onBack={() => setDetail(null)}
      />
    );
  }
  if (detail?.type === 'inventory') {
    return (
      <InventoryScreen
        initialSub={detail.sub}
        onBack={() => setDetail(null)}
      />
    );
  }

  const navigateToOrder = (table: TableWithOrder) => setDetail({ type: 'order', table });
  const navigateToEditor = () => setDetail({ type: 'editor' });
  const navigateToInventory = (sub: string) => setDetail({ type: 'inventory', sub });

  return (
    <View style={s.container}>
      <OfflineBanner />
      <View style={s.content}>
        {activeTab === 'mesas' && (
          <TableMapScreen
            onOpenOrder={navigateToOrder}
            onOpenEditor={navigateToEditor}
          />
        )}
        {activeTab === 'caja' && <CajaScreen />}
        {activeTab === 'delivery' && <DeliveryScreen user={user} />}
        {activeTab === 'admin' && <AdminScreen onOpenEditor={navigateToEditor} onOpenInventory={navigateToInventory} />}
      </View>
      <TabNavigator activeTab={activeTab} onChangeTab={setActiveTab} role={user.role} />
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ConnectivityProvider>
        <StatusBar style="light" />
        <AppContent />
      </ConnectivityProvider>
    </AuthProvider>
  );
}

const s = StyleSheet.create({
  loading: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1 },
});
