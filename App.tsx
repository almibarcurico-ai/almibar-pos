// App.tsx — Role-based tab navigation

import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
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

function AppContent() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('mesas');
  const [detail, setDetail] = useState<DetailScreen>(null);

  if (loading) {
    return <View style={s.loading}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }
  if (!user) return <LoginScreen />;

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
      <StatusBar style="light" />
      <AppContent />
    </AuthProvider>
  );
}

const s = StyleSheet.create({
  loading: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1 },
});
