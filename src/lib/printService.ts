// ESC/POS Print Service
// Sends print jobs via HTTP to local print server

const PRINT_SERVER = 'http://localhost:3333/print';

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
  CUT: GS + 'V\x00',
  FEED: '\n',
  LINE: '─'.repeat(32) + '\n',
  DLINE: '═'.repeat(32) + '\n',
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
  ticket += CMD.CENTER + CMD.BOLD_ON + CMD.DOUBLE_BOTH;
  ticket += `COMANDA\n`;
  ticket += CMD.NORMAL + CMD.BOLD_ON;
  ticket += `${data.station.toUpperCase()}\n`;
  ticket += CMD.BOLD_OFF + CMD.LEFT;
  ticket += CMD.LINE;
  ticket += pad('Mesa:', String(data.table)) + '\n';
  ticket += pad('Garzon:', data.waiter) + '\n';
  ticket += pad('Hora:', time) + '\n';
  if (data.orderNumber) ticket += pad('Orden:', '#' + data.orderNumber) + '\n';
  ticket += CMD.LINE;
  
  // Items
  ticket += CMD.BOLD_ON;
  for (const item of data.items) {
    ticket += `${item.qty}x ${item.name}\n`;
    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        ticket += `   → ${mod}\n`;
      }
    }
    if (item.notes) {
      ticket += `   * ${item.notes}\n`;
    }
  }
  ticket += CMD.BOLD_OFF;
  ticket += CMD.LINE;
  ticket += CMD.CENTER;
  ticket += `${date} ${time}\n`;
  ticket += '\n\n\n';
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
  tip: number;
  total: number;
  payments: { method: string; amount: number }[];
  orderNumber?: number;
}) {
  const now = new Date();
  const time = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('es-CL');

  let ticket = CMD.INIT;
  ticket += CMD.CENTER + CMD.BOLD_ON + CMD.DOUBLE_BOTH;
  ticket += `ALMIBAR\n`;
  ticket += CMD.NORMAL;
  ticket += `Cocina y Bar\n`;
  ticket += `Francisco Moreno 418, Curico\n`;
  ticket += CMD.LEFT;
  ticket += CMD.DLINE;
  ticket += pad('Mesa:', String(data.table)) + '\n';
  ticket += pad('Garzon:', data.waiter) + '\n';
  ticket += pad('Hora:', `${date} ${time}`) + '\n';
  if (data.orderNumber) ticket += pad('Orden:', '#' + data.orderNumber) + '\n';
  ticket += CMD.LINE;

  // Items
  for (const item of data.items) {
    ticket += `${item.qty}x ${item.name}\n`;
    ticket += CMD.RIGHT + fmt(item.total) + '\n' + CMD.LEFT;
  }

  ticket += CMD.LINE;
  ticket += CMD.BOLD_ON;
  ticket += pad('Subtotal:', fmt(data.subtotal)) + '\n';
  if (data.tip > 0) {
    ticket += pad('Propina:', fmt(data.tip)) + '\n';
  }
  ticket += CMD.DOUBLE_BOTH;
  ticket += pad('TOTAL:', fmt(data.total)) + '\n';
  ticket += CMD.NORMAL + CMD.BOLD_OFF;
  ticket += CMD.LINE;

  // Payments
  for (const p of data.payments) {
    const label = p.method === 'efectivo' ? 'Efectivo' : p.method === 'debito' ? 'Debito' : p.method === 'credito' ? 'Credito' : 'Transf.';
    ticket += pad(label + ':', fmt(p.amount)) + '\n';
  }

  ticket += '\n';
  ticket += CMD.CENTER;
  ticket += `Gracias por su visita!\n`;
  ticket += `@almibar.bar\n`;
  ticket += '\n\n\n';
  ticket += CMD.CUT;

  return ticket;
}

// Send to printer via print server
export async function sendToPrinter(printerIp: string, printerPort: number, data: string, printerName?: string) {
  try {
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

    const success = await sendToPrinter(printer.ip_address, printer.port, ticket, printer.name);
    results.push({ printer: printer.name, success });
    console.log(`🖨️ ${printer.name}: ${success ? '✅' : '❌'}`);
  }

  return results;
}
