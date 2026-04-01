// src/theme.ts — Dark modern theme

export const COLORS = {
  // Brand - Emerald accent
  primary: '#059669',
  primaryDark: '#047857',
  primaryLight: '#34D399',

  // Backgrounds - Light
  background: '#F1F5F9',
  card: '#FFFFFF',
  cardHover: '#F8FAFC',

  // Text
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',

  // Status - Mesas
  tableLibre: '#10B981',
  tableOcupada: '#EF4444',
  tableCuenta: '#F59E0B',
  tableReservada: '#6366F1',

  // UI
  border: '#E2E8F0',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#3B82F6',

  // Category accent
  cocina: '#EF4444',
  barra: '#10B981',

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
