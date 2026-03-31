// src/screens/LoginScreen.tsx

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { COLORS } from '../theme';

export default function LoginScreen() {
  const { loginWithPin, loading, error } = useAuth();
  const [pin, setPin] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const handleDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 4) handleLogin(newPin);
  };

  const handleDelete = () => setPin((prev) => prev.slice(0, -1));

  const handleLogin = async (currentPin: string) => {
    const success = await loginWithPin(currentPin);
    if (!success) {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
      setPin('');
    }
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ALMÍBAR</Text>
        <View style={styles.badge}><Text style={styles.badgeText}>PUNTO DE VENTA</Text></View>
      </View>

      <Animated.View style={[styles.dotsContainer, { transform: [{ translateX: shakeAnim }] }]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
        ))}
      </Animated.View>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.numpad}>
          {digits.map((digit, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.numpadButton, digit === '' && styles.numpadEmpty]}
              disabled={digit === ''}
              onPress={() => digit === 'DEL' ? handleDelete() : handleDigit(digit)}
              activeOpacity={0.6}
            >
              <Text style={[styles.numpadText, digit === 'DEL' && styles.numpadDelText]}>
                {digit === 'DEL' ? '⌫' : digit}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.footer}>Ingresa tu PIN de 4 dígitos</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 8,
  },
  badge: {
    marginTop: 10,
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 3,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 12,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  error: {
    color: COLORS.error,
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  numpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 300,
    marginTop: 24,
  },
  numpadButton: {
    width: 76,
    height: 76,
    margin: 8,
    borderRadius: 38,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  numpadEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  numpadText: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.text,
  },
  numpadDelText: {
    fontSize: 24,
    color: COLORS.textMuted,
  },
  footer: {
    marginTop: 32,
    fontSize: 13,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
});
