// src/contexts/AuthContext.tsx

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  loginWithPin: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  error: null,
  loginWithPin: async () => false,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const AUTH_STORAGE_KEY = '@almibar_pos_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restaurar sesión al iniciar
  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as User;
        // Verificar que sigue activo en BD
        const { data, error: dbError } = await supabase
          .from('users')
          .select('*')
          .eq('id', parsed.id)
          .eq('active', true)
          .single();

        if (data && !dbError) {
          setUser(data as User);
        } else {
          await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error('Error restoring session:', e);
    } finally {
      setLoading(false);
    }
  };

  const loginWithPin = useCallback(async (pin: string): Promise<boolean> => {
    setError(null);
    setLoading(true);

    try {
      const { data, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('pin', pin)
        .eq('active', true)
        .single();

      if (dbError || !data) {
        setError('PIN incorrecto');
        setLoading(false);
        return false;
      }

      const userData = data as User;
      setUser(userData);
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
      setLoading(false);
      return true;
    } catch (e) {
      setError('Error de conexión');
      setLoading(false);
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, loginWithPin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
