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
        { backgroundColor: hasAppOrder ? '#FF6B0040' : table.status === 'libre' ? '#7ECDB5' : table.status === 'cuenta' ? '#F5A623' : sc, borderColor: hasAppOrder ? '#FF6B00' : 'transparent', opacity: hasAppOrder ? blink : 1 },
        hasAppOrder && { borderWidth: 3 },
      ]}>
        {hasAppOrder && <Text style={{ position: 'absolute', top: 4, right: 6, fontSize: 12 }}>📱</Text>}
        <Text style={[styles.num, { color: '#FFFFFF' }]}>{table.number}</Text>
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
  // Fudo: large rounded squares, solid colored
  box: { width: 130, height: 110, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  num: { fontSize: 32, fontWeight: '800' },
  status: { fontSize: 11, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', fontWeight: '600' },
  total: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  waiter: { fontSize: 10, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  cap: { position: 'absolute', bottom: 5, right: 8, fontSize: 10, color: 'rgba(255,255,255,0.6)' },
});
