// src/theme.ts — Dark modern theme

export const COLORS = {
  // Brand - Fudo Orange
  primary: '#E8562A',
  primaryDark: '#D14A22',
  primaryLight: '#F27A54',

  // Backgrounds - Light (Fudo style)
  background: '#F5F5F5',
  card: '#FFFFFF',
  cardHover: '#FAFAFA',

  // Text
  text: '#1A1A1A',
  textSecondary: '#666666',
  textMuted: '#999999',

  // Status - Mesas (Fudo mint green)
  tableLibre: '#7ECDB5',
  tableOcupada: '#E8562A',
  tableCuenta: '#F5A623',
  tableReservada: '#6366F1',

  // UI
  border: '#E8E8E8',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F5A623',
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
