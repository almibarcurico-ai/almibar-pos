// src/components/TabNavigator.tsx — Fudo-style top bar
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ScrollView } from 'react-native';
import { UserRole } from '../types';
import { COLORS } from '../theme';

export interface Tab {
  key: string;
  label: string;
  icon: string;
  roles: UserRole[];
}

const ALL_TABS: Tab[] = [
  { key: 'mesas', label: 'Mesas', icon: '🪑', roles: ['garzon', 'cajero', 'admin'] },
  { key: 'reservas', label: 'Reservas', icon: '📋', roles: ['garzon', 'cajero', 'admin'] },
  { key: 'caja', label: 'Caja', icon: '💰', roles: ['cajero', 'admin'] },
  { key: 'delivery', label: 'Delivery', icon: '🛵', roles: ['cajero', 'admin'] },
  { key: 'kds', label: 'Cocina', icon: '🔥', roles: ['cocina', 'barra', 'admin'] },
  { key: 'productos', label: 'Productos', icon: '🍕', roles: ['admin'] },
  { key: 'reportes', label: 'Reportes', icon: '📊', roles: ['admin'] },
  { key: 'admin', label: 'Admin', icon: '⚙️', roles: ['admin'] },
];

interface Props {
  activeTab: string;
  onChangeTab: (tab: string) => void;
  role: UserRole;
}

export default function TabNavigator({ activeTab, onChangeTab, role }: Props) {
  const visibleTabs = ALL_TABS.filter((t) => t.roles.includes(role));
  const now = new Date();
  const dayName = now.toLocaleDateString('es-CL', { weekday: 'long' }).toUpperCase();
  const time = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.container} contentContainerStyle={{ alignItems: 'center', minWidth: '100%' }}>
      {/* Logo */}
      <View style={styles.logo}>
        <Text style={styles.logoText}>ALMÍBAR</Text>
      </View>

      {/* Tabs */}
      {visibleTabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onChangeTab(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={styles.icon}>{tab.icon}</Text>
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}

      {/* Clock */}
      <View style={styles.clock}>
        <Text style={styles.clockDay}>{dayName}</Text>
        <Text style={styles.clockTime}>{time}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#3C3C3C',
    flexDirection: 'row',
    height: 56,
    flexGrow: 0,
  },
  logo: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    height: 56,
  },
  logoText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 2,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 6,
    height: 56,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    backgroundColor: COLORS.primary,
    borderBottomColor: COLORS.primary,
  },
  icon: { fontSize: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#AAAAAA',
  },
  labelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  clock: {
    paddingHorizontal: 16,
    alignItems: 'flex-end',
  },
  clockDay: {
    fontSize: 9,
    fontWeight: '600',
    color: '#888888',
    letterSpacing: 1,
  },
  clockTime: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
