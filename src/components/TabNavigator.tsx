// src/components/TabNavigator.tsx

import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
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
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 8,
    gap: 2,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    gap: 6,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  icon: { fontSize: 16 },
  label: {
    fontSize: 13,
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
