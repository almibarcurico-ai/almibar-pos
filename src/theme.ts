// src/theme.ts

export const COLORS = {
  // Brand
  primary: '#8B5CF6',       // Púrpura Almíbar
  primaryDark: '#7C3AED',
  primaryLight: '#A78BFA',
  
  // Backgrounds
  background: '#0F0F1A',    // Fondo oscuro
  card: '#1A1A2E',          // Tarjetas
  cardHover: '#252545',     // Hover estado
  
  // Text
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  
  // Status - Mesas
  tableLibre: '#10B981',     // Verde
  tableOcupada: '#EF4444',   // Rojo
  tableCuenta: '#F59E0B',    // Amarillo
  tableReservada: '#3B82F6', // Azul
  
  // UI
  border: '#2D2D4A',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#3B82F6',
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.6)',
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
