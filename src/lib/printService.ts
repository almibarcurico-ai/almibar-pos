// ESC/POS Print Service
// Sends print jobs via HTTP to local print server

const PRINT_SERVER = 'http://localhost:3333/print';

// Configuración real de impresoras por estación
// (override sobre lo que venga de BD para evitar problemas de RLS)
export const PRINTER_CONFIG: Record<string, { ip: string; port: number }> = {
  cocina: { ip: '192.168.1.115', port: 9100 },
  barra:  { ip: '192.168.1.114', port: 9100 },
  caja:   { ip: '192.168.1.114', port: 9100 },
};

// ESC/POS commands
const ESC = '\x1B';
const GS = '\x1D';
const CMD = {
  INIT: ESC + '@',
  BOLD_ON: ESC + 'E\x01',
  BOLD_OFF: ESC + 'E\x00',
  CENTER: ESC + 'a\x01',
  LEFT: ESC + 'a\x00',
  RIGHT: ESC + 'a\x02',
  DOUBLE_WIDTH: GS + '!\x10',
  DOUBLE_HEIGHT: GS + '!\x01',
  DOUBLE_BOTH: GS + '!\x11',
  NORMAL: GS + '!\x00',
  // Tamaño base: doble alto (~30% más grande que normal)
  SIZE_UP: GS + '!\x01',
  CUT: GS + 'V\x00',
  FEED: '\n',
  LINE: '─'.repeat(32) + '\n',
  DLINE: '═'.repeat(32) + '\n',
  // Interlineado: ESC 3 n (n = espaciado en puntos, default ~30)
  LINE_SPACING_TIGHT: ESC + '3\x10',   // 16 puntos - compacto para boleta
  LINE_SPACING_WIDE: ESC + '3\x3C',    // 60 puntos - espaciado para comandas
  LINE_SPACING_DEFAULT: ESC + '2',      // reset al default
  // Espaciado entre caracteres: ESC SP n
  CHAR_SPACING_WIDE: ESC + ' \x03',    // 3 puntos extra entre letras
  CHAR_SPACING_WIDER: ESC + ' \x05',   // 5 puntos extra - más legible
  CHAR_SPACING_DEFAULT: ESC + ' \x00', // sin espacio extra
  // Font: A = más grande/legible (12x24), B = más pequeña (9x17)
  FONT_A: ESC + 'M\x00',
  FONT_B: ESC + 'M\x01',
  // Doble ancho+alto para items comanda (más grande que solo doble alto)
  SIZE_COMANDA: GS + '!\x11',
  // Márgenes: GS L nL nH (margen izquierdo en puntos)
  MARGIN_LEFT: GS + 'L\x10\x00',   // 16 puntos margen izquierdo
  // Área de impresión: GS W nL nH (ancho en puntos, 576 = 80mm full)
  PRINT_WIDTH: GS + 'W\x20\x02',   // 544 puntos (deja margen a ambos lados)
};

function pad(left: string, right: string, width = 32) {
  const space = width - left.length - right.length;
  return left + ' '.repeat(Math.max(space, 1)) + right;
}

function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CL');
}

// Generate kitchen/bar ticket
export function generateComanda(data: {
  table: number | string;
  waiter: string;
  items: { name: string; qty: number; notes?: string; modifiers?: string[] }[];
  station: string;
  orderNumber?: number;
}) {
  const now = new Date();
  const time = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('es-CL');

  let ticket = CMD.INIT;
  // Font A + márgenes para centrar en la hoja
  ticket += CMD.FONT_A + CMD.MARGIN_LEFT + CMD.PRINT_WIDTH;
  // Título grande centrado
  ticket += CMD.CENTER + CMD.BOLD_ON + CMD.DOUBLE_BOTH;
  ticket += `COMANDA\n`;
  ticket += `${data.station.toUpperCase()}\n`;
  // Info mesa - doble alto
  ticket += CMD.SIZE_UP + CMD.BOLD_OFF + CMD.LEFT;
  ticket += CMD.LINE;
  ticket += pad('Mesa:', String(data.table)) + '\n';
  ticket += pad('Garzon:', data.waiter) + '\n';
  ticket += pad('Fecha:', `${date} ${time}`) + '\n';
  if (data.orderNumber) ticket += pad('Orden:', '#' + data.orderNumber) + '\n';
  ticket += CMD.LINE;

  // Items - doble alto + bold + espaciado moderado
  ticket += CMD.BOLD_ON + CMD.SIZE_UP + CMD.CHAR_SPACING_WIDE + CMD.LINE_SPACING_WIDE;
  for (const item of data.items) {
    ticket += `\n${item.qty}x ${item.name}\n`;
    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        ticket += `  → ${mod}\n`;
      }
    }
    if (item.notes) {
      ticket += `  * ${item.notes}\n`;
    }
    ticket += `\n`;
  }
  ticket += CMD.CHAR_SPACING_DEFAULT + CMD.LINE_SPACING_DEFAULT;
  ticket += CMD.BOLD_OFF + CMD.SIZE_UP;
  ticket += CMD.LINE;
  ticket += CMD.CENTER + CMD.BOLD_ON + CMD.DOUBLE_BOTH;
  ticket += `OJO: Leer comentarios!\n`;
  ticket += CMD.BOLD_OFF + CMD.NORMAL;
  ticket += '\n\n\n\n\n\n';
  ticket += CMD.CUT;

  return ticket;
}

// Generate void/anulacion ticket
export function generateAnulacion(data: {
  table: number | string;
  waiter: string;
  item: { name: string; qty: number; price: number };
  motivo: string;
  station: string;
}) {
  const now = new Date();
  const time = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('es-CL');

  let ticket = CMD.INIT;
  ticket += CMD.CENTER + CMD.BOLD_ON + CMD.DOUBLE_BOTH;
  ticket += `ANULACION\n`;
  ticket += CMD.NORMAL + CMD.BOLD_ON;
  ticket += `${data.station.toUpperCase()}\n`;
  ticket += CMD.BOLD_OFF + CMD.LEFT;
  ticket += CMD.DLINE;
  ticket += pad('Mesa:', String(data.table)) + '\n';
  ticket += pad('Garzon:', data.waiter) + '\n';
  ticket += pad('Hora:', time) + '\n';
  ticket += CMD.LINE;
  ticket += CMD.BOLD_ON;
  ticket += `${data.item.qty}x ${data.item.name}\n`;
  ticket += CMD.BOLD_OFF;
  ticket += pad('Valor:', fmt(data.item.price * data.item.qty)) + '\n';
  ticket += CMD.LINE;
  ticket += CMD.BOLD_ON + 'MOTIVO:\n' + CMD.BOLD_OFF;
  ticket += data.motivo + '\n';
  ticket += CMD.DLINE;
  ticket += CMD.CENTER;
  ticket += `${date} ${time}\n`;
  ticket += '\n\n\n';
  ticket += CMD.CUT;
  return ticket;
}

// Generate bill/cuenta ticket
export function generateBoleta(data: {
  table: number | string;
  waiter: string;
  items: { name: string; qty: number; price: number; total: number }[];
  subtotal: number;
  discount?: number;
  discountLabel?: string;
  tip: number;
  total: number;
  payments: { method: string; amount: number }[];
  orderNumber?: number;
}) {
  const now = new Date();
  const time = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('es-CL');

  let ticket = CMD.INIT;
  // Interlineado compacto para toda la boleta
  ticket += CMD.LINE_SPACING_TIGHT;
  // Header grande
  ticket += CMD.CENTER + CMD.BOLD_ON + CMD.DOUBLE_BOTH;
  ticket += `ALMIBAR\n`;
  ticket += CMD.SIZE_UP + CMD.BOLD_OFF;
  ticket += `Cocina y Bar\n`;
  ticket += `Francisco Moreno 418, Curico\n`;
  ticket += CMD.LEFT;
  ticket += CMD.DLINE;
  ticket += pad('Mesa:', String(data.table)) + '\n';
  ticket += pad('Garzon:', data.waiter) + '\n';
  ticket += pad('Hora:', `${date} ${time}`) + '\n';
  if (data.orderNumber) ticket += pad('Orden:', '#' + data.orderNumber) + '\n';
  ticket += CMD.LINE;

  // Items - tamaño normal (más pequeño que el resto)
  ticket += CMD.NORMAL;
  for (const item of data.items) {
    ticket += `${item.qty}x ${item.name}\n`;
    ticket += CMD.RIGHT + fmt(item.total) + '\n' + CMD.LEFT;
  }

  ticket += CMD.LINE;
  ticket += CMD.BOLD_ON + CMD.SIZE_UP + CMD.CHAR_SPACING_WIDE;
  ticket += pad('Subtotal:', fmt(data.subtotal)) + '\n';
  if (data.discount && data.discount > 0) {
    ticket += pad(data.discountLabel || 'Descuento:', '-' + fmt(data.discount)) + '\n';
  }
  const neto = data.subtotal - (data.discount || 0);
  ticket += pad('Neto:', fmt(neto)) + '\n';
  if (data.tip > 0) {
    ticket += pad('Propina 10%:', fmt(data.tip)) + '\n';
  }
  ticket += CMD.DOUBLE_BOTH;
  const totalConPropina = neto + (data.tip || 0);
  ticket += pad('TOTAL:', fmt(totalConPropina)) + '\n';
  ticket += CMD.CHAR_SPACING_DEFAULT + CMD.SIZE_UP + CMD.BOLD_OFF;
  ticket += CMD.LINE;

  // Payments
  ticket += CMD.SIZE_UP;
  for (const p of data.payments) {
    const label = p.method === 'efectivo' ? 'Efectivo' : p.method === 'tarjeta' ? 'Tarjeta' : p.method === 'transferencia' ? 'Transf.' : p.method === 'pedidosya' ? 'PedidosYa' : p.method === 'consumo' ? 'Consumo' : p.method;
    ticket += pad(label + ':', fmt(p.amount)) + '\n';
  }

  ticket += '\n';
  ticket += CMD.CENTER + CMD.SIZE_UP;
  ticket += `Nos encanto tenerte, vuelve pronto!\n`;
  ticket += CMD.NORMAL;
  ticket += `@almibar.bar\n`;
  ticket += CMD.LINE_SPACING_DEFAULT;
  ticket += '\n\n\n\n\n\n';
  ticket += CMD.CUT;

  return ticket;
}

// Send to printer via print server
export async function sendToPrinter(printerIp: string, printerPort: number, data: string, printerName?: string) {
  try {
    console.log(`🖨️ sendToPrinter: ${printerName} -> ${printerIp}:${printerPort} (${data.length} bytes) via ${PRINT_SERVER}`);
    const res = await fetch(PRINT_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printer: printerName || 'unknown',
        ip: printerIp,
        port: printerPort,
        data,
      }),
    });
    const result = await res.json();
    return result.success;
  } catch (e) {
    console.error('Print error:', e);
    return false;
  }
}

// Print order to correct printers based on category mapping
export async function printOrder(params: {
  table: number | string;
  waiter: string;
  items: { name: string; qty: number; category_id: string; notes?: string; modifiers?: string[] }[];
  printers: { id: string; name: string; station: string; ip_address: string; port: number }[];
  categoryPrinters: { category_id: string; printer_id: string }[];
  orderNumber?: number;
}) {
  const { table, waiter, items, printers, categoryPrinters, orderNumber } = params;
  const results: { printer: string; success: boolean }[] = [];

  // Group items by printer
  const printerItems: Record<string, typeof items> = {};

  for (const item of items) {
    // Find which printers this category maps to
    const mappings = categoryPrinters.filter(cp => cp.category_id === item.category_id);
    
    for (const mapping of mappings) {
      const printer = printers.find(p => p.id === mapping.printer_id);
      if (!printer || !printer.ip_address) continue;

      const key = printer.id;
      if (!printerItems[key]) printerItems[key] = [];
      printerItems[key].push(item);
    }
  }

  // Send to each printer
  for (const [printerId, pItems] of Object.entries(printerItems)) {
    const printer = printers.find(p => p.id === printerId);
    if (!printer) continue;

    const ticket = generateComanda({
      table, waiter, station: printer.station,
      items: pItems.map(i => ({ name: i.name, qty: i.qty, notes: i.notes, modifiers: i.modifiers })),
      orderNumber,
    });

    // Usar IP del config local si existe (override BD por station o nombre)
    const override = PRINTER_CONFIG[printer.station] || PRINTER_CONFIG[printer.name?.toLowerCase()];
    const ip = override?.ip || printer.ip_address;
    const port = override?.port || printer.port;
    console.log(`🖨️ printOrder: ${printer.name} station=${printer.station} -> ${ip}:${port} (override=${!!override})`);
    const success = await sendToPrinter(ip, port, ticket, printer.name);
    results.push({ printer: printer.name, success });
    console.log(`🖨️ ${printer.name}: ${success ? '✅' : '❌'}`);
  }

  return results;
}
// build 1774973279
