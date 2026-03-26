// src/theme.ts

export const COLORS = {
  // Brand
  primary: '#2563EB',       // Azul Almíbar
  primaryDark: '#1d4ed8',
  primaryLight: '#60a5fa',
  
  // Backgrounds
  background: '#f0f4f8',    // Fondo claro
  card: '#ffffff',           // Tarjetas
  cardHover: '#e8edf2',     // Hover estado
  
  // Text
  text: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  
  // Status - Mesas
  tableLibre: '#059669',     // Verde
  tableOcupada: '#dc2626',   // Rojo
  tableCuenta: '#d97706',    // Amarillo
  tableReservada: '#2563eb', // Azul
  
  // UI
  border: '#d6e0ea',
  error: '#dc2626',
  success: '#059669',
  warning: '#d97706',
  info: '#2563eb',
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.4)',
};

export const TABLE_STATUS_COLORS: Record<string, string> = {
  libre: COLORS.tableLibre,
  ocupada: COLORS.tableOcupada,
  cuenta: COLORS.tableCuenta,
  reservada: COLORS.tableReservada,
};

export const TABLE_STATUS_LABELS: Record<string, string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  cuenta: 'Cuenta',
  reservada: 'Reservada',
};
