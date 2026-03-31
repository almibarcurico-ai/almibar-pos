// src/types/index.ts

export type UserRole = 'admin' | 'cajero' | 'garzon';
export type TableStatus = 'libre' | 'ocupada' | 'cuenta' | 'reservada';
export type OrderType = 'mesa' | 'delivery' | 'takeaway';
export type OrderStatus = 'abierta' | 'cerrada' | 'anulada';
export type DiscountType = 'none' | 'percent' | 'fixed';
export type PaymentMethod = 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'mixto';
export type ItemStatus = 'pendiente' | 'preparando' | 'listo' | 'entregado';

export interface User {
  id: string;
  email: string | null;
  name: string;
  pin: string;
  role: UserRole;
  active: boolean;
  created_at: string;
}

export interface Sector {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
}

export interface Table {
  id: string;
  sector_id: string;
  number: number;
  name: string | null;
  pos_x: number;
  pos_y: number;
  capacity: number;
  status: TableStatus;
  current_order_id: string | null;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  printer_id: string;
  sort_order: number;
  active: boolean;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  printer_id: string | null;
  active: boolean;
  sort_order: number;
  tags: string[];
}

export interface Order {
  id: string;
  table_id: string | null;
  order_number: number;
  type: OrderType;
  status: OrderStatus;
  waiter_id: string;
  opened_at: string;
  closed_at: string | null;
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  total: number;
  payment_method: PaymentMethod | null;
  tip_amount: number;
  notes: string | null;
  client_id: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
  status: ItemStatus;
  printed: boolean;
  paid: boolean;
  created_at: string;
  created_by: string;
  // Joined
  product?: Product;
}

export interface Printer {
  id: string;
  name: string;
  type: 'ethernet' | 'usb';
  ip_address: string | null;
  port: number;
  active: boolean;
}

export interface CashRegister {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  closed_by: string | null;
  opening_amount: number;
  closing_amount: number | null;
  total_cash: number;
  total_debit: number;
  total_credit: number;
  total_transfer: number;
  total_sales: number;
  total_orders: number;
  notes: string | null;
}

// Tabla con datos de orden para el mapa
export interface TableWithOrder extends Table {
  order?: Order & { items_count?: number; waiter_name?: string };
}
