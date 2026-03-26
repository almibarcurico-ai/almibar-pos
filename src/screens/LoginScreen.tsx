// src/screens/LoginScreen.tsx

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { COLORS } from '../theme';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const { loginWithPin, loading, error } = useAuth();
  const [pin, setPin] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const handleDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);

    // Auto-submit al completar 4 dígitos
    if (newPin.length === 4) {
      handleLogin(newPin);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleLogin = async (currentPin: string) => {
    const success = await loginWithPin(currentPin);
    if (!success) {
      // Shake animation
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
        <Text style={styles.subtitle}>Punto de Venta</Text>
      </View>

      {/* PIN dots */}
      <Animated.View style={[styles.dotsContainer, { transform: [{ translateX: shakeAnim }] }]}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              pin.length > i && styles.dotFilled,
            ]}
          />
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
              style={[
                styles.numpadButton,
                digit === '' && styles.numpadEmpty,
              ]}
              disabled={digit === ''}
              onPress={() => {
                if (digit === 'DEL') handleDelete();
                else handleDigit(digit);
              }}
              activeOpacity={0.6}
            >
              <Text style={[
                styles.numpadText,
                digit === 'DEL' && styles.numpadDelText,
              ]}>
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
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 4,
    letterSpacing: 1,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
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
    marginTop: 20,
  },
  numpadButton: {
    width: 80,
    height: 80,
    margin: 8,
    borderRadius: 40,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  numpadEmpty: {
    backgroundColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
  },
  numpadText: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.text,
  },
  numpadDelText: {
    fontSize: 24,
    color: COLORS.textSecondary,
  },
  footer: {
    marginTop: 30,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
