// src/theme.ts

export const COLORS = {
  // Brand
  primary: '#C8952A',       // Gold Almíbar
  primaryDark: '#A67A1E',
  primaryLight: '#E8C44A',
  
  // Backgrounds
  background: '#0A0908',    // Fondo oscuro
  card: '#1A1714',           // Tarjetas
  cardHover: '#221E17',     // Hover estado
  
  // Text
  text: '#FFFFFF',
  textSecondary: '#8A7A5A',
  textMuted: '#6B5A3A',
  
  // Status - Mesas
  tableLibre: '#1D6B4F',     // Verde barra
  tableOcupada: '#B22222',   // Rojo cocina
  tableCuenta: '#E8C44A',    // Gold bright
  tableReservada: '#C8952A', // Gold
  
  // UI
  border: '#2A2318',
  error: '#B22222',
  success: '#1D6B4F',
  warning: '#E8C44A',
  info: '#C8952A',
  
  // Category accent
  cocina: '#B22222',
  barra: '#1D6B4F',
  
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
