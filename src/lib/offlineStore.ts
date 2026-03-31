// src/lib/offlineStore.ts
// Base de datos local para modo offline con sincronización

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const KEYS = {
  PRODUCTS: '@almibar_offline_products',
  CATEGORIES: '@almibar_offline_categories',
  TABLES: '@almibar_offline_tables',
  USERS: '@almibar_offline_users',
  PRINTERS: '@almibar_offline_printers',
  CAT_PRINTERS: '@almibar_offline_cat_printers',
  ORDERS: '@almibar_offline_orders',
  PENDING_OPS: '@almibar_offline_pending_ops',
  LAST_SYNC: '@almibar_offline_last_sync',
};

// =============================================
// Cache local — guardar/leer datos
// =============================================
async function setCache(key: string, data: any) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('offlineStore setCache error:', e);
  }
}

async function getCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('offlineStore getCache error:', e);
    return null;
  }
}

// =============================================
// Sincronizar datos del servidor al cache local
// =============================================
export async function syncFromServer(): Promise<boolean> {
  try {
    const [prodR, catR, tableR, userR, printR, cpR] = await Promise.all([
      supabase.from('products').select('*, category:categories(name)').eq('active', true).order('sort_order'),
      supabase.from('categories').select('*').eq('active', true).order('sort_order'),
      supabase.from('tables').select('*, sector:sectors(name), current_order:orders(*, order_items(*, product:products(name)))').eq('active', true).order('number'),
      supabase.from('users').select('*').eq('active', true),
      supabase.from('printers').select('*').eq('active', true),
      supabase.from('category_printer').select('*'),
    ]);

    if (prodR.data) await setCache(KEYS.PRODUCTS, prodR.data);
    if (catR.data) await setCache(KEYS.CATEGORIES, catR.data);
    if (tableR.data) await setCache(KEYS.TABLES, tableR.data);
    if (userR.data) await setCache(KEYS.USERS, userR.data);
    if (printR.data) await setCache(KEYS.PRINTERS, printR.data);
    if (cpR.data) await setCache(KEYS.CAT_PRINTERS, cpR.data);

    await setCache(KEYS.LAST_SYNC, new Date().toISOString());
    console.log('✅ offlineStore: sincronizado desde servidor');
    return true;
  } catch (e) {
    console.error('offlineStore sync error:', e);
    return false;
  }
}

// =============================================
// Leer datos del cache local
// =============================================
export async function getCachedProducts() {
  return getCache<any[]>(KEYS.PRODUCTS) || [];
}

export async function getCachedCategories() {
  return getCache<any[]>(KEYS.CATEGORIES) || [];
}

export async function getCachedTables() {
  return getCache<any[]>(KEYS.TABLES) || [];
}

export async function getCachedUsers() {
  return getCache<any[]>(KEYS.USERS) || [];
}

export async function getCachedPrinters() {
  return getCache<any[]>(KEYS.PRINTERS) || [];
}

export async function getCachedCatPrinters() {
  return getCache<any[]>(KEYS.CAT_PRINTERS) || [];
}

export async function getLastSync(): Promise<string | null> {
  return getCache<string>(KEYS.LAST_SYNC);
}

// =============================================
// Operaciones pendientes (cola offline)
// =============================================
interface PendingOp {
  id: string;
  type: 'insert' | 'update' | 'rpc';
  table: string;
  data: any;
  filter?: any;
  rpcName?: string;
  rpcParams?: any;
  createdAt: string;
}

export async function addPendingOp(op: Omit<PendingOp, 'id' | 'createdAt'>) {
  const ops = await getPendingOps();
  const newOp: PendingOp = {
    ...op,
    id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
  };
  ops.push(newOp);
  await setCache(KEYS.PENDING_OPS, ops);
  console.log('📝 offlineStore: operación pendiente agregada:', op.type, op.table);
  return newOp;
}

export async function getPendingOps(): Promise<PendingOp[]> {
  return (await getCache<PendingOp[]>(KEYS.PENDING_OPS)) || [];
}

export async function clearPendingOps() {
  await setCache(KEYS.PENDING_OPS, []);
}

export async function removePendingOp(id: string) {
  const ops = await getPendingOps();
  await setCache(KEYS.PENDING_OPS, ops.filter(o => o.id !== id));
}

// =============================================
// Sincronizar operaciones pendientes al servidor
// =============================================
export async function syncPendingOps(): Promise<{ synced: number; failed: number }> {
  const ops = await getPendingOps();
  if (ops.length === 0) return { synced: 0, failed: 0 };

  console.log(`🔄 offlineStore: sincronizando ${ops.length} operaciones pendientes...`);
  let synced = 0;
  let failed = 0;

  for (const op of ops) {
    try {
      let error: any = null;

      if (op.type === 'insert') {
        const result = await supabase.from(op.table).insert(op.data);
        error = result.error;
      } else if (op.type === 'update') {
        let query = supabase.from(op.table).update(op.data);
        if (op.filter) {
          for (const [key, value] of Object.entries(op.filter)) {
            query = query.eq(key, value);
          }
        }
        const result = await query;
        error = result.error;
      } else if (op.type === 'rpc' && op.rpcName) {
        const result = await supabase.rpc(op.rpcName, op.rpcParams);
        error = result.error;
      }

      if (error) {
        console.error('  ❌ Fallo sync op:', op.id, error.message);
        failed++;
      } else {
        await removePendingOp(op.id);
        synced++;
      }
    } catch (e: any) {
      console.error('  ❌ Error sync op:', op.id, e.message);
      failed++;
    }
  }

  console.log(`  ✅ Sincronizadas: ${synced}, Fallidas: ${failed}`);
  return { synced, failed };
}

// =============================================
// Guardar orden offline (para cuando no hay internet)
// =============================================
export async function saveOfflineOrder(order: any) {
  const orders = (await getCache<any[]>(KEYS.ORDERS)) || [];
  orders.push({ ...order, offlineId: Date.now().toString(), createdAt: new Date().toISOString() });
  await setCache(KEYS.ORDERS, orders);
}

export async function getOfflineOrders(): Promise<any[]> {
  return (await getCache<any[]>(KEYS.ORDERS)) || [];
}

export async function clearOfflineOrders() {
  await setCache(KEYS.ORDERS, []);
}
