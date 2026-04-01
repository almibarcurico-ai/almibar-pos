// src/components/TableCard.tsx

import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Animated } from 'react-native';
import { TableWithOrder } from '../types';
import { COLORS, TABLE_STATUS_COLORS, TABLE_STATUS_LABELS } from '../theme';

interface Props {
  table: TableWithOrder;
  onPress: (table: TableWithOrder) => void;
  onLongPress?: (table: TableWithOrder) => void;
  hasAppOrder?: boolean;
}

export default function TableCard({ table, onPress, onLongPress, hasAppOrder }: Props) {
  const sc = TABLE_STATUS_COLORS[table.status] || COLORS.border;
  const occ = table.status === 'ocupada' || table.status === 'cuenta';
  const fmt = (p: number) => '$' + p.toLocaleString('es-CL');
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!hasAppOrder) { blink.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasAppOrder]);

  return (
    <TouchableOpacity
      onPress={() => onPress(table)}
      onLongPress={() => onLongPress && onLongPress(table)}
      activeOpacity={0.7}
    >
      <Animated.View style={[
        styles.box,
        { backgroundColor: hasAppOrder ? '#FF6B00' + '40' : sc + '20', borderColor: hasAppOrder ? '#FF6B00' : sc, opacity: hasAppOrder ? blink : 1 },
        hasAppOrder && { borderWidth: 3 },
      ]}>
        {hasAppOrder && <Text style={{ position: 'absolute', top: 2, right: 4, fontSize: 10 }}>📱</Text>}
        <Text style={[styles.num, { color: hasAppOrder ? '#FF6B00' : sc }]}>{table.number}</Text>
        {table.status === 'libre' ? (
          <Text style={styles.status}>{hasAppOrder ? 'PEDIDO APP' : TABLE_STATUS_LABELS[table.status]}</Text>
        ) : occ && table.order ? (
          <View>
            <Text style={styles.total}>{fmt(table.order.total || 0)}</Text>
            {table.order.waiter_name ? <Text style={styles.waiter} numberOfLines={1}>{table.order.waiter_name}</Text> : null}
          </View>
        ) : (
          <Text style={styles.status}>{TABLE_STATUS_LABELS[table.status]}</Text>
        )}
        <Text style={styles.cap}>👤{table.capacity}</Text>
      </Animated.View>
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
