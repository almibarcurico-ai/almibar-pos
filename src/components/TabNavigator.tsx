// src/components/TabNavigator.tsx

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
  { key: 'caja', label: 'Caja', icon: '💰', roles: ['cajero', 'admin'] },
  { key: 'delivery', label: 'Delivery', icon: '🛵', roles: ['cajero', 'admin'] },
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

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.container} contentContainerStyle={{ paddingHorizontal: 8, gap: 2 }}>
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
            {isActive && <View style={styles.indicator} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
    flexGrow: 0,
    flexShrink: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 22,
    gap: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  icon: { fontSize: 18 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  labelActive: {
    color: COLORS.text,
    fontWeight: '700',
  },
  indicator: {
    display: 'none',
  },
});
