// src/theme.ts — Dark modern theme

export const COLORS = {
  // Brand - Emerald accent
  primary: '#10B981',
  primaryDark: '#059669',
  primaryLight: '#34D399',

  // Backgrounds - Dark slate
  background: '#0F1117',
  card: '#1A1D27',
  cardHover: '#242836',

  // Text
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',

  // Status - Mesas
  tableLibre: '#10B981',
  tableOcupada: '#EF4444',
  tableCuenta: '#F59E0B',
  tableReservada: '#6366F1',

  // UI
  border: '#2D3348',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#3B82F6',

  // Category accent
  cocina: '#EF4444',
  barra: '#10B981',

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
