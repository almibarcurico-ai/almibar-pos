// src/contexts/ConnectivityContext.tsx
// Detecta conectividad y maneja modo offline/online

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { syncFromServer, syncPendingOps, getPendingOps } from '../lib/offlineStore';
import { supabase } from '../lib/supabase';

interface ConnectivityContextType {
  isOnline: boolean;
  isOfflineMode: boolean;
  pendingOpsCount: number;
  lastSync: string | null;
  isSyncing: boolean;
  forceSync: () => Promise<void>;
}

const ConnectivityContext = createContext<ConnectivityContextType>({
  isOnline: true,
  isOfflineMode: false,
  pendingOpsCount: 0,
  lastSync: null,
  isSyncing: false,
  forceSync: async () => {},
});

export const useConnectivity = () => useContext(ConnectivityContext);

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [pendingOpsCount, setPendingOpsCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const checkInterval = useRef<any>(null);

  // Verificar conectividad cada 10 segundos
  const checkConnectivity = useCallback(async () => {
    try {
      const { error } = await supabase.from('sectors').select('id').limit(1);
      if (!error) {
        const wasOffline = !isOnline;
        setIsOnline(true);
        setIsOfflineMode(false);

        // Si estábamos offline y volvimos, sincronizar
        if (wasOffline) {
          console.log('🌐 Conexión restaurada! Sincronizando...');
          await handleReconnect();
        }
      } else {
        goOffline();
      }
    } catch {
      goOffline();
    }
  }, [isOnline]);

  const goOffline = () => {
    if (isOnline) {
      console.log('📴 Sin conexión — modo offline activado');
    }
    setIsOnline(false);
    setIsOfflineMode(true);
  };

  const handleReconnect = async () => {
    setIsSyncing(true);
    try {
      // Sincronizar operaciones pendientes
      const result = await syncPendingOps();
      if (result.synced > 0) {
        console.log(`✅ ${result.synced} operaciones sincronizadas`);
      }
      // Actualizar cache local
      await syncFromServer();
      setLastSync(new Date().toISOString());
      // Actualizar contador
      const ops = await getPendingOps();
      setPendingOpsCount(ops.length);
    } catch (e) {
      console.error('Error en sincronización:', e);
    }
    setIsSyncing(false);
  };

  const forceSync = async () => {
    if (!isOnline) return;
    setIsSyncing(true);
    try {
      await syncPendingOps();
      await syncFromServer();
      setLastSync(new Date().toISOString());
      const ops = await getPendingOps();
      setPendingOpsCount(ops.length);
    } catch (e) {
      console.error('Error en forceSync:', e);
    }
    setIsSyncing(false);
  };

  // Sync inicial al cargar
  useEffect(() => {
    (async () => {
      try {
        await syncFromServer();
        setLastSync(new Date().toISOString());
      } catch { }
      const ops = await getPendingOps();
      setPendingOpsCount(ops.length);
    })();
  }, []);

  // Check de conectividad periódico
  useEffect(() => {
    checkConnectivity();
    checkInterval.current = setInterval(checkConnectivity, 10000);
    return () => clearInterval(checkInterval.current);
  }, [checkConnectivity]);

  // Escuchar eventos del navegador
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => { setIsOnline(true); handleReconnect(); };
    const onOffline = () => goOffline();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Actualizar pending count periódicamente
  useEffect(() => {
    const iv = setInterval(async () => {
      const ops = await getPendingOps();
      setPendingOpsCount(ops.length);
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  return (
    <ConnectivityContext.Provider value={{ isOnline, isOfflineMode, pendingOpsCount, lastSync, isSyncing, forceSync }}>
      {children}
    </ConnectivityContext.Provider>
  );
}
