// src/theme.ts

export const COLORS = {
  // Brand - Fudo style
  primary: '#E8562A',       // Naranja Fudo
  primaryDark: '#D04520',
  primaryLight: '#F4845F',
  
  // Backgrounds - Light grays
  background: '#F5F5F5',
  card: '#FFFFFF',
  cardHover: '#EAEAEA',
  
  // Text
  text: '#2D2D2D',
  textSecondary: '#666666',
  textMuted: '#999999',
  
  // Status - Mesas
  tableLibre: '#4CAF50',
  tableOcupada: '#E53935',
  tableCuenta: '#FFA726',
  tableReservada: '#42A5F5',
  
  // UI
  border: '#E0E0E0',
  error: '#E53935',
  success: '#4CAF50',
  warning: '#FFA726',
  info: '#42A5F5',
  
  // Category accent
  cocina: '#E53935',
  barra: '#2E7D32',
  
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
