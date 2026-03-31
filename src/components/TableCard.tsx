// src/components/TableCard.tsx

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { TableWithOrder } from '../types';
import { COLORS, TABLE_STATUS_COLORS, TABLE_STATUS_LABELS } from '../theme';

interface Props {
  table: TableWithOrder;
  onPress: (table: TableWithOrder) => void;
  onLongPress?: (table: TableWithOrder) => void;
}

export default function TableCard({ table, onPress, onLongPress }: Props) {
  const sc = TABLE_STATUS_COLORS[table.status] || COLORS.border;
  const occ = table.status === 'ocupada' || table.status === 'cuenta';
  const fmt = (p: number) => '$' + p.toLocaleString('es-CL');

  return (
    <TouchableOpacity
      style={[styles.box, { position: 'absolute', left: table.pos_x, top: table.pos_y, backgroundColor: sc + '20', borderColor: sc }]}
      onPress={() => onPress(table)}
      onLongPress={() => onLongPress && onLongPress(table)}
      activeOpacity={0.7}
    >
      <Text style={[styles.num, { color: sc }]}>{table.number}</Text>
      {table.status === 'libre' ? (
        <Text style={styles.status}>{TABLE_STATUS_LABELS[table.status]}</Text>
      ) : occ && table.order ? (
        <View>
          <Text style={styles.total}>{fmt(table.order.total || 0)}</Text>
          {table.order.waiter_name ? <Text style={styles.waiter} numberOfLines={1}>{table.order.waiter_name}</Text> : null}
        </View>
      ) : (
        <Text style={styles.status}>{TABLE_STATUS_LABELS[table.status]}</Text>
      )}
      <Text style={styles.cap}>👤{table.capacity}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: { width: 80, height: 70, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  num: { fontSize: 22, fontWeight: '800' },
  status: { fontSize: 10, color: COLORS.textSecondary, textTransform: 'uppercase' },
  total: { fontSize: 12, fontWeight: '700', color: COLORS.primary, textAlign: 'center' },
  waiter: { fontSize: 9, color: COLORS.textSecondary, textAlign: 'center' },
  cap: { position: 'absolute', bottom: 4, right: 6, fontSize: 9, color: COLORS.textMuted },
});
