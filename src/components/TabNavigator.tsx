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
    backgroundColor: '#0B0D14',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingBottom: 20,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    position: 'relative',
  },
  tabActive: {},
  icon: { fontSize: 20 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 3,
  },
  labelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
});
