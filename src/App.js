import { useState, useEffect, useCallback, useRef } from "react";

// ─── ESTILOS GLOBALES ───────────────────────────────────────────────────────
const GLOBAL_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Barlow:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #1a1714; color: #f0ebe3; font-family: 'Barlow', sans-serif; min-height: 100vh; }
  ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #2a2520; }
  ::-webkit-scrollbar-thumb { background: #c8873a; border-radius: 3px; }
  button { cursor: pointer; border: none; outline: none; }
  input, select, textarea { outline: none; font-family: 'Barlow', sans-serif; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  @keyframes ping { 0% { transform: scale(1); opacity: 1; } 75%,100% { transform: scale(2); opacity: 0; } }
  .fade-in { animation: fadeIn 0.25s ease forwards; }
  .slide-in { animation: slideIn 0.2s ease forwards; }
`;

// ─── PALETA ─────────────────────────────────────────────────────────────────
const C = {
  bg: "#1a1714", bg2: "#221f1b", bg3: "#2d2820", bg4: "#3a3228",
  amber: "#c8873a", amberLight: "#e09b4a", amberDark: "#a06828",
  cream: "#f0ebe3", muted: "#9c9189", border: "#3d3630",
  green: "#4caf7d", red: "#e05a4a", blue: "#5a9fe0", yellow: "#e0c84a",
  purple: "#a07ae0",
};

// ─── DATOS INICIALES ─────────────────────────────────────────────────────────
const INITIAL_USERS = [
  { id: 1, name: "Admin", role: "admin", pin: "1234", active: true },
  { id: 2, name: "Carlos", role: "cajero", pin: "2222", active: true },
  { id: 3, name: "María", role: "garzon", pin: "3333", active: true },
  { id: 4, name: "Pedro", role: "garzon", pin: "4444", active: true },
  { id: 5, name: "Cocina", role: "cocina", pin: "5555", active: true },
  { id: 6, name: "Barra", role: "barra", pin: "6666", active: true },
];

const INITIAL_INGREDIENTS = [
  { id: 1, name: "Ron blanco", unit: "ml", stock: 3000, alert: 500, cost: 0.012 },
  { id: 2, name: "Limón", unit: "unid", stock: 80, alert: 20, cost: 150 },
  { id: 3, name: "Azúcar", unit: "gr", stock: 5000, alert: 500, cost: 0.5 },
  { id: 4, name: "Hierbabuena", unit: "gr", stock: 300, alert: 50, cost: 2 },
  { id: 5, name: "Agua con gas", unit: "ml", stock: 8000, alert: 1000, cost: 0.003 },
  { id: 6, name: "Pisco", unit: "ml", stock: 2000, alert: 400, cost: 0.018 },
  { id: 7, name: "Lomo fino", unit: "gr", stock: 4000, alert: 500, cost: 12 },
  { id: 8, name: "Papa", unit: "gr", stock: 8000, alert: 1000, cost: 0.8 },
  { id: 9, name: "Pollo", unit: "gr", stock: 6000, alert: 800, cost: 5 },
  { id: 10, name: "Ají amarillo", unit: "gr", stock: 500, alert: 100, cost: 3 },
  { id: 11, name: "Crema", unit: "ml", stock: 2000, alert: 300, cost: 1.5 },
  { id: 12, name: "Ceviche mezcla", unit: "gr", stock: 3000, alert: 400, cost: 8 },
  { id: 13, name: "Cebolla morada", unit: "gr", stock: 2000, alert: 300, cost: 0.8 },
  { id: 14, name: "Cerveza", unit: "ml", stock: 20000, alert: 3000, cost: 0.004 },
  { id: 15, name: "Pisco sour mix", unit: "ml", stock: 3000, alert: 500, cost: 0.01 },
];

const INITIAL_MENU = [
  { id: 1, name: "Mojito Clásico", category: "tragos", price: 5500, station: "barra", active: true, recipe: [{ ingId: 1, qty: 60 }, { ingId: 2, qty: 0.5 }, { ingId: 3, qty: 15 }, { ingId: 4, qty: 8 }, { ingId: 5, qty: 120 }] },
  { id: 2, name: "Mojito Frutilla", category: "tragos", price: 6000, station: "barra", active: true, recipe: [{ ingId: 1, qty: 60 }, { ingId: 2, qty: 0.5 }, { ingId: 3, qty: 15 }, { ingId: 4, qty: 8 }, { ingId: 5, qty: 120 }] },
  { id: 3, name: "Mojito Maracuyá", category: "tragos", price: 6000, station: "barra", active: true, recipe: [{ ingId: 1, qty: 60 }, { ingId: 2, qty: 0.5 }, { ingId: 3, qty: 15 }, { ingId: 4, qty: 8 }, { ingId: 5, qty: 120 }] },
  { id: 4, name: "Pisco Sour", category: "tragos", price: 5000, station: "barra", active: true, recipe: [{ ingId: 6, qty: 75 }, { ingId: 15, qty: 50 }] },
  { id: 5, name: "Cerveza", category: "bebestibles", price: 2500, station: "barra", active: true, recipe: [{ ingId: 14, qty: 330 }] },
  { id: 6, name: "Lomo Saltado", category: "fondos", price: 8500, station: "cocina", active: true, recipe: [{ ingId: 7, qty: 200 }, { ingId: 8, qty: 150 }, { ingId: 13, qty: 50 }] },
  { id: 7, name: "Ají de Gallina", category: "fondos", price: 7500, station: "cocina", active: true, recipe: [{ ingId: 9, qty: 200 }, { ingId: 10, qty: 30 }, { ingId: 11, qty: 80 }, { ingId: 8, qty: 120 }] },
  { id: 8, name: "Ceviche Clásico", category: "entradas", price: 7000, station: "cocina", active: true, recipe: [{ ingId: 12, qty: 200 }, { ingId: 13, qty: 60 }, { ingId: 2, qty: 1 }] },
  { id: 9, name: "Causita Limeña", category: "entradas", price: 5500, station: "cocina", active: true, recipe: [{ ingId: 8, qty: 150 }, { ingId: 10, qty: 20 }, { ingId: 9, qty: 80 }] },
  { id: 10, name: "Papas Fritas", category: "acompañamiento", price: 2500, station: "cocina", active: true, recipe: [{ ingId: 8, qty: 200 }] },
];

const INITIAL_TABLES = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, number: i + 1, status: "free",
  orders: [], garzomId: null, openedAt: null, persons: 2,
}));

const CATEGORIES = ["tragos", "bebestibles", "entradas", "fondos", "acompañamiento", "postres"];
const ROLES = { admin: "Administrador", cajero: "Cajero", garzon: "Garzón", cocina: "Cocina", barra: "Barra" };
const ROLE_COLORS = { admin: C.purple, cajero: C.blue, garzon: C.amber, cocina: C.green, barra: C.red };

let nextOrderId = 1000;
let nextCommandId = 100;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (n) => `$${Number(n).toLocaleString("es-CL")}`;
const now = () => new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
const uuid = () => ++nextOrderId;
const cmdId = () => ++nextCommandId;

// ─── COMPONENTES BASE ─────────────────────────────────────────────────────────
const Btn = ({ children, onClick, color = C.amber, small, full, disabled, outline, style: sx = {} }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: outline ? "transparent" : disabled ? C.bg3 : color,
    color: outline ? color : disabled ? C.muted : "#fff",
    border: outline ? `1.5px solid ${color}` : "none",
    padding: small ? "6px 14px" : "10px 20px",
    borderRadius: 6, fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700, fontSize: small ? 13 : 15, letterSpacing: "0.05em",
    textTransform: "uppercase", width: full ? "100%" : "auto",
    opacity: disabled ? 0.5 : 1, transition: "all 0.15s",
    ...sx
  }}>{children}</button>
);

const Badge = ({ children, color = C.amber }) => (
  <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{children}</span>
);

const Card = ({ children, style: sx = {}, onClick }) => (
  <div onClick={onClick} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, transition: "all 0.15s", cursor: onClick ? "pointer" : "default", ...sx }}>{children}</div>
);

const Modal = ({ title, onClose, children, width = 480 }) => (
  <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
    <div className="fade-in" style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, width: "100%", maxWidth: width, maxHeight: "90vh", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 18, letterSpacing: "0.05em", textTransform: "uppercase" }}>{title}</span>
        <button onClick={onClose} style={{ background: "none", color: C.muted, fontSize: 20, padding: 4 }}>✕</button>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  </div>
);

const Input = ({ value, onChange, placeholder, type = "text", style: sx = {} }) => (
  <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type}
    style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: "9px 12px", color: C.cream, fontSize: 14, width: "100%", ...sx }} />
);

const Select = ({ value, onChange, children, style: sx = {} }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: "9px 12px", color: C.cream, fontSize: 14, width: "100%", ...sx }}>
    {children}
  </select>
);

const Label = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{children}</div>
);

const Section = ({ title, children, action }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <h2 style={{ fontFamily: "'Barlow Condensed'", fontSize: 20, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: C.amber }}>{title}</h2>
      {action}
    </div>
    {children}
  </div>
);

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({ users, onLogin }) {
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handlePin = (d) => {
    if (pin.length >= 4) return;
    const newPin = pin + d;
    setPin(newPin);
    if (newPin.length === 4) {
      setTimeout(() => {
        if (selected.pin === newPin) { onLogin(selected); }
        else { setError("PIN incorrecto"); setPin(""); }
      }, 150);
    } else { setError(""); }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 42, fontWeight: 900, letterSpacing: "0.12em", color: C.amber, textTransform: "uppercase" }}>ALMÍBAR</div>
        <div style={{ color: C.muted, fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase", marginTop: 4 }}>Sistema de Gestión</div>
      </div>

      {!selected ? (
        <div style={{ width: "100%", maxWidth: 600 }}>
          <div style={{ textAlign: "center", color: C.muted, fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 20 }}>Selecciona tu perfil</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {users.filter(u => u.active).map(u => (
              <div key={u.id} onClick={() => { setSelected(u); setPin(""); setError(""); }}
                className="fade-in"
                style={{ background: C.bg2, border: `2px solid ${ROLE_COLORS[u.role]}33`, borderRadius: 10, padding: "20px 16px", textAlign: "center", cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = ROLE_COLORS[u.role]}
                onMouseLeave={e => e.currentTarget.style.borderColor = ROLE_COLORS[u.role] + "33"}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{u.role === "admin" ? "⚙️" : u.role === "garzon" ? "🍽️" : u.role === "cajero" ? "💵" : u.role === "cocina" ? "👨‍🍳" : "🍹"}</div>
                <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 15, letterSpacing: "0.05em", textTransform: "uppercase" }}>{u.name}</div>
                <div style={{ marginTop: 4 }}><Badge color={ROLE_COLORS[u.role]}>{ROLES[u.role]}</Badge></div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="fade-in" style={{ width: "100%", maxWidth: 300, textAlign: "center" }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{selected.role === "admin" ? "⚙️" : selected.role === "garzon" ? "🍽️" : selected.role === "cajero" ? "💵" : selected.role === "cocina" ? "👨‍🍳" : "🍹"}</div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 22, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>{selected.name}</div>
            <Badge color={ROLE_COLORS[selected.role]}>{ROLES[selected.role]}</Badge>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: i < pin.length ? C.amber : C.border, transition: "all 0.15s" }} />
            ))}
          </div>
          {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((d, i) => (
              <button key={i} onClick={() => d === "⌫" ? setPin(p => p.slice(0, -1)) : d !== "" && handlePin(String(d))}
                disabled={d === ""}
                style={{ background: d === "" ? "transparent" : C.bg3, border: d === "" ? "none" : `1px solid ${C.border}`, borderRadius: 8, padding: "14px 0", color: d === "⌫" ? C.red : C.cream, fontSize: 18, fontWeight: 600, cursor: d === "" ? "default" : "pointer" }}>
                {d}
              </button>
            ))}
          </div>
          <Btn onClick={() => { setSelected(null); setPin(""); }} outline color={C.muted} full>Volver</Btn>
        </div>
      )}
    </div>
  );
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────
function Navbar({ user, onLogout, comandasPendientes }) {
  return (
    <div style={{ background: C.bg2, borderBottom: `1px solid ${C.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 26, fontWeight: 900, letterSpacing: "0.12em", color: C.amber, textTransform: "uppercase" }}>ALMÍBAR</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {comandasPendientes > 0 && (
          <div style={{ position: "relative" }}>
            <div style={{ background: C.red, color: "#fff", borderRadius: 20, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>🔔 {comandasPendientes} pendientes</div>
          </div>
        )}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{user.name}</div>
          <Badge color={ROLE_COLORS[user.role]}>{ROLES[user.role]}</Badge>
        </div>
        <Btn onClick={onLogout} outline color={C.muted} small>Salir</Btn>
      </div>
    </div>
  );
}

// ─── VISTA GARZÓN ─────────────────────────────────────────────────────────────
function GarzonView({ user, tables, setTables, menu, addComanda }) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [catFilter, setCatFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");

  const table = tables.find(t => t.id === selectedTable);
  const filtered = menu.filter(m => m.active && (catFilter === "todos" || m.category === catFilter) && m.name.toLowerCase().includes(search.toLowerCase()));

  const addItem = (item) => {
    setOrderItems(prev => {
      const ex = prev.find(i => i.menuId === item.id);
      if (ex) return prev.map(i => i.menuId === item.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { menuId: item.id, name: item.name, price: item.price, qty: 1, station: item.station, note: "" }];
    });
  };

  const removeItem = (menuId) => setOrderItems(prev => prev.filter(i => i.menuId !== menuId));
  const changeQty = (menuId, delta) => setOrderItems(prev =>
    prev.map(i => i.menuId === menuId ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
  );

  const total = orderItems.reduce((s, i) => s + i.price * i.qty, 0);

  const sendOrder = () => {
    if (!orderItems.length) return;
    const newOrders = orderItems.map(item => ({ ...item, id: uuid(), sentAt: now(), status: "pending" }));
    setTables(prev => prev.map(t => {
      if (t.id !== selectedTable) return t;
      const merged = [...(t.orders || [])];
      newOrders.forEach(no => {
        const ex = merged.find(o => o.menuId === no.menuId && o.status === "pending");
        if (ex) { ex.qty += no.qty; } else { merged.push(no); }
      });
      return { ...t, status: "occupied", garzomId: user.id, openedAt: t.openedAt || now(), orders: merged };
    }));
    addComanda(newOrders, selectedTable, user.name);
    setOrderItems([]);
  };

  const openTable = (tId) => {
    setSelectedTable(tId);
    setOrderItems([]);
    setSearch("");
    setCatFilter("todos");
  };

  if (selectedTable && table) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", height: "calc(100vh - 57px)" }}>
        {/* Menú */}
        <div style={{ overflow: "auto", padding: 20, borderRight: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <button onClick={() => setSelectedTable(null)} style={{ background: "none", color: C.muted, fontSize: 20 }}>←</button>
            <span style={{ fontFamily: "'Barlow Condensed'", fontWeight: 900, fontSize: 22, letterSpacing: "0.08em", textTransform: "uppercase" }}>Mesa {table.number}</span>
            <Badge color={C.green}>Abierta</Badge>
          </div>
          <Input value={search} onChange={setSearch} placeholder="Buscar..." style={{ marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {["todos", ...CATEGORIES].map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                style={{ background: catFilter === c ? C.amber : C.bg3, color: catFilter === c ? "#fff" : C.muted, border: "none", borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer" }}>
                {c}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {filtered.map(item => (
              <div key={item.id} onClick={() => addItem(item)} className="fade-in"
                style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.amber}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <div style={{ fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.station === "barra" ? "🍹 Barra" : "🍳 Cocina"}</div>
                <div style={{ fontWeight: 600, fontSize: 14, margin: "4px 0" }}>{item.name}</div>
                <div style={{ color: C.amber, fontWeight: 700, fontSize: 15 }}>{fmt(item.price)}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Pedido actual */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 16, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>Pedido Nuevo</div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
            {!orderItems.length && !table.orders.length && (
              <div style={{ textAlign: "center", color: C.muted, marginTop: 40, fontSize: 13 }}>Selecciona ítems del menú</div>
            )}
            {table.orders.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Ya enviado</div>
                {table.orders.map(o => (
                  <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}22`, fontSize: 13 }}>
                    <span style={{ color: C.muted }}>{o.qty}× {o.name}</span>
                    <span style={{ color: o.status === "done" ? C.green : C.amber, fontSize: 11 }}>{o.status === "done" ? "✓ Listo" : "⏳"}</span>
                  </div>
                ))}
              </div>
            )}
            {orderItems.map(item => (
              <div key={item.menuId} className="slide-in" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.border}33` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</div>
                  <div style={{ color: C.amber, fontSize: 12 }}>{fmt(item.price * item.qty)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => changeQty(item.menuId, -1)} style={{ background: C.bg3, color: C.cream, border: `1px solid ${C.border}`, borderRadius: 4, width: 24, height: 24, fontSize: 14 }}>−</button>
                  <span style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{item.qty}</span>
                  <button onClick={() => changeQty(item.menuId, 1)} style={{ background: C.bg3, color: C.cream, border: `1px solid ${C.border}`, borderRadius: 4, width: 24, height: 24, fontSize: 14 }}>+</button>
                  <button onClick={() => removeItem(item.menuId)} style={{ background: "none", color: C.red, fontSize: 16, padding: "0 4px" }}>✕</button>
                </div>
              </div>
            ))}
          </div>
          {orderItems.length > 0 && (
            <div style={{ padding: 16, borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Total nuevo</span>
                <span style={{ fontFamily: "'Barlow Condensed'", fontWeight: 900, fontSize: 20, color: C.amber }}>{fmt(total)}</span>
              </div>
              <Btn onClick={sendOrder} full color={C.green}>🖨️ Enviar Comanda</Btn>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Section title={`Mesas — ${user.name}`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
          {tables.map(t => {
            const tableTotal = (t.orders || []).reduce((s, o) => s + o.price * o.qty, 0);
            const pending = (t.orders || []).filter(o => o.status === "pending").length;
            return (
              <div key={t.id} onClick={() => openTable(t.id)} className="fade-in"
                style={{ background: t.status === "free" ? C.bg2 : C.bg3, border: `2px solid ${t.status === "free" ? C.border : C.amber}`, borderRadius: 10, padding: "16px 12px", cursor: "pointer", textAlign: "center", transition: "all 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = t.status === "free" ? C.muted : C.amberLight}
                onMouseLeave={e => e.currentTarget.style.borderColor = t.status === "free" ? C.border : C.amber}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Mesa</div>
                <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 900, fontSize: 36, color: t.status === "free" ? C.muted : C.amber }}>{t.number}</div>
                <div style={{ marginTop: 6 }}>
                  {t.status === "free"
                    ? <Badge color={C.muted}>Libre</Badge>
                    : <>
                      <div style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>{fmt(tableTotal)}</div>
                      {pending > 0 && <div style={{ color: C.red, fontSize: 11 }}>{pending} pendientes</div>}
                      {t.openedAt && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{t.openedAt}</div>}
                    </>
                  }
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// ─── VISTA COCINA / BARRA ─────────────────────────────────────────────────────
function StationView({ station, comandas, setComandas, tables }) {
  const pending = comandas.filter(c => c.station === station && c.status === "pending");
  const done = comandas.filter(c => c.station === station && c.status === "done").slice(-10);

  const markDone = (cmdId) => setComandas(prev => prev.map(c => c.id === cmdId ? { ...c, status: "done", doneAt: now() } : c));
  const markItemDone = (cmdId, itemId) => setComandas(prev => prev.map(c => {
    if (c.id !== cmdId) return c;
    const items = c.items.map(i => i.id === itemId ? { ...i, done: true } : i);
    const allDone = items.every(i => i.done);
    return { ...c, items, status: allDone ? "done" : c.status, doneAt: allDone ? now() : undefined };
  }));

  return (
    <div style={{ padding: 24 }}>
      <Section title={station === "cocina" ? "🍳 Estación Cocina" : "🍹 Estación Barra"}>
        {!pending.length && (
          <Card style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div style={{ color: C.muted, fontSize: 15 }}>Sin comandas pendientes</div>
          </Card>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {pending.map(cmd => {
            const t = tables.find(t => t.id === cmd.tableId);
            return (
              <div key={cmd.id} className="fade-in" style={{ background: C.bg2, border: `2px solid ${C.amber}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: C.amber, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "'Barlow Condensed'", fontWeight: 900, fontSize: 20, color: "#fff" }}>Mesa {t?.number || cmd.tableId}</span>
                  <span style={{ fontSize: 12, color: "#fff99" }}>{cmd.garzon} • {cmd.time}</span>
                </div>
                <div style={{ padding: 14 }}>
                  {cmd.items.map(item => (
                    <div key={item.id} onClick={() => markItemDone(cmd.id, item.id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}33`, cursor: "pointer", opacity: item.done ? 0.4 : 1 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, background: item.done ? C.green : C.border, border: `2px solid ${item.done ? C.green : C.muted}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {item.done && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 16, fontFamily: "'Barlow Condensed'" }}>{item.qty}×</span>
                      <span style={{ fontSize: 14, flex: 1, textDecoration: item.done ? "line-through" : "none" }}>{item.name}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
                  <Btn onClick={() => markDone(cmd.id)} full color={C.green} small>✓ Todo Listo</Btn>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
      {done.length > 0 && (
        <Section title="Últimas completadas">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {done.map(cmd => {
              const t = tables.find(t => t.id === cmd.tableId);
              return (
                <div key={cmd.id} style={{ background: C.bg2, border: `1px solid ${C.green}33`, borderRadius: 8, padding: "8px 14px", fontSize: 13 }}>
                  <span style={{ color: C.green, fontWeight: 700 }}>Mesa {t?.number}</span>
                  <span style={{ color: C.muted, marginLeft: 8 }}>✓ {cmd.doneAt}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── VISTA CAJERO ─────────────────────────────────────────────────────────────
function CajeroView({ tables, setTables, menu }) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [payModal, setPayModal] = useState(false);
  const [payMethod, setPayMethod] = useState("efectivo");
  const [cash, setCash] = useState("");
  const [discount, setDiscount] = useState(0);
  const [sales, setSales] = useState([]);

  const occupied = tables.filter(t => t.status === "occupied");
  const table = tables.find(t => t.id === selectedTable);
  const tableTotal = table ? table.orders.reduce((s, o) => s + o.price * o.qty, 0) : 0;
  const discountAmount = tableTotal * (discount / 100);
  const finalTotal = tableTotal - discountAmount;
  const change = payMethod === "efectivo" ? (Number(cash) - finalTotal) : 0;

  const closeMesa = () => {
    setSales(prev => [...prev, { tableId: selectedTable, total: finalTotal, method: payMethod, time: now(), date: new Date().toLocaleDateString("es-CL") }]);
    setTables(prev => prev.map(t => t.id !== selectedTable ? t : { ...t, status: "free", orders: [], garzomId: null, openedAt: null }));
    setSelectedTable(null);
    setPayModal(false);
    setCash("");
    setDiscount(0);
  };

  const todaySales = sales.filter(s => s.date === new Date().toLocaleDateString("es-CL"));
  const todayTotal = todaySales.reduce((s, sale) => s + sale.total, 0);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Ventas Hoy</div>
          <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 32, fontWeight: 900, color: C.green }}>{fmt(todayTotal)}</div>
          <div style={{ color: C.muted, fontSize: 13 }}>{todaySales.length} cierres</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Mesas Ocupadas</div>
          <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 32, fontWeight: 900, color: C.amber }}>{occupied.length}</div>
          <div style={{ color: C.muted, fontSize: 13 }}>de {tables.length} mesas</div>
        </Card>
      </div>

      <Section title="Mesas Abiertas">
        {!occupied.length && <Card style={{ textAlign: "center", padding: 30, color: C.muted }}>No hay mesas ocupadas</Card>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {occupied.map(t => {
            const total = t.orders.reduce((s, o) => s + o.price * o.qty, 0);
            const pending = t.orders.filter(o => o.status === "pending").length;
            return (
              <Card key={t.id} onClick={() => setSelectedTable(t.id)} style={{ cursor: "pointer", border: selectedTable === t.id ? `2px solid ${C.amber}` : `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 900, fontSize: 28, color: C.amber }}>#{t.number}</div>
                  {pending > 0 && <Badge color={C.red}>{pending} pend.</Badge>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 18, color: C.green }}>{fmt(total)}</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Abierta {t.openedAt}</div>
                {t.orders.length > 0 && <div style={{ color: C.muted, fontSize: 12 }}>{t.orders.length} ítems</div>}
              </Card>
            );
          })}
        </div>
      </Section>

      {table && (
        <Section title={`Detalle Mesa ${table.number}`} action={<Btn onClick={() => setPayModal(true)} color={C.green}>💳 Cobrar</Btn>}>
          <Card>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <Label>Descuento %</Label>
                <Input value={discount} onChange={v => setDiscount(Math.min(100, Math.max(0, Number(v))))} type="number" placeholder="0" />
              </div>
            </div>
            {table.orders.map((o, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}33`, fontSize: 14 }}>
                <span>{o.qty}× {o.name}</span>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ color: o.status === "done" ? C.green : C.yellow, fontSize: 11 }}>{o.status === "done" ? "✓" : "⏳"}</span>
                  <span style={{ fontWeight: 700 }}>{fmt(o.price * o.qty)}</span>
                </div>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 8 }}>
              {discount > 0 && <>
                <div style={{ display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 14 }}>
                  <span>Subtotal</span><span>{fmt(tableTotal)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: C.red, fontSize: 14 }}>
                  <span>Descuento {discount}%</span><span>-{fmt(discountAmount)}</span>
                </div>
              </>}
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Barlow Condensed'", fontSize: 22, fontWeight: 900, marginTop: 6 }}>
                <span>TOTAL</span><span style={{ color: C.amber }}>{fmt(finalTotal)}</span>
              </div>
            </div>
          </Card>
        </Section>
      )}

      {sales.length > 0 && (
        <Section title="Cierres de Hoy">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...todaySales].reverse().slice(0, 10).map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 14 }}>
                <span>Mesa {s.tableId} • {s.time}</span>
                <div style={{ display: "flex", gap: 12 }}>
                  <Badge color={s.method === "efectivo" ? C.green : C.blue}>{s.method}</Badge>
                  <span style={{ fontWeight: 700, color: C.green }}>{fmt(s.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {payModal && table && (
        <Modal title={`Cobrar Mesa ${table.number}`} onClose={() => setPayModal(false)}>
          <div style={{ marginBottom: 16 }}>
            <Label>Método de pago</Label>
            <div style={{ display: "flex", gap: 10 }}>
              {["efectivo", "debito", "credito", "transferencia"].map(m => (
                <button key={m} onClick={() => setPayMethod(m)}
                  style={{ flex: 1, background: payMethod === m ? C.amber : C.bg3, color: payMethod === m ? "#fff" : C.muted, border: `1px solid ${payMethod === m ? C.amber : C.border}`, borderRadius: 6, padding: "10px 0", fontSize: 13, fontWeight: 700, textTransform: "capitalize", cursor: "pointer" }}>
                  {m === "efectivo" ? "💵 Efectivo" : m === "debito" ? "💳 Débito" : m === "credito" ? "💳 Crédito" : "📱 Transfer."}
                </button>
              ))}
            </div>
          </div>
          {discount > 0 && (
            <div style={{ marginBottom: 16, background: C.bg3, borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: C.muted, marginBottom: 4 }}>
                <span>Subtotal</span><span>{fmt(tableTotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: C.red }}>
                <span>Descuento {discount}%</span><span>-{fmt(discountAmount)}</span>
              </div>
            </div>
          )}
          <div style={{ background: C.bg3, borderRadius: 8, padding: 14, marginBottom: 16, textAlign: "center" }}>
            <div style={{ color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>Total a cobrar</div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 900, fontSize: 40, color: C.amber }}>{fmt(finalTotal)}</div>
          </div>
          {payMethod === "efectivo" && (
            <div style={{ marginBottom: 16 }}>
              <Label>Monto recibido</Label>
              <Input value={cash} onChange={setCash} type="number" placeholder="0" />
              {Number(cash) >= finalTotal && (
                <div style={{ marginTop: 8, background: C.green + "22", border: `1px solid ${C.green}44`, borderRadius: 6, padding: "8px 12px", color: C.green, fontWeight: 700, fontSize: 15 }}>
                  Vuelto: {fmt(change)}
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={() => setPayModal(false)} outline color={C.muted} full>Cancelar</Btn>
            <Btn onClick={closeMesa} color={C.green} full
              disabled={payMethod === "efectivo" && (Number(cash) < finalTotal || !cash)}>
              ✓ Confirmar Cobro
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function AdminView({ menu, setMenu, ingredients, setIngredients, users, setUsers, tables, comandas }) {
  const [tab, setTab] = useState("dashboard");
  const [menuModal, setMenuModal] = useState(null);
  const [ingModal, setIngModal] = useState(null);
  const [userModal, setUserModal] = useState(null);
  const [form, setForm] = useState({});

  const TAB_LABELS = { dashboard: "📊 Dashboard", menu: "🍽️ Menú", inventario: "📦 Inventario", recetas: "📋 Recetas", usuarios: "👥 Usuarios" };

  // Dashboard stats
  const occupied = tables.filter(t => t.status === "occupied").length;
  const totalPending = comandas.filter(c => c.status === "pending").length;
  const totalMesa = tables.reduce((s, t) => s + (t.orders || []).reduce((ss, o) => ss + o.price * o.qty, 0), 0);
  const lowStock = ingredients.filter(i => i.stock <= i.alert);

  const saveMenuItem = () => {
    if (menuModal === "new") {
      setMenu(prev => [...prev, { ...form, id: Date.now(), active: true, recipe: form.recipe || [], price: Number(form.price) }]);
    } else {
      setMenu(prev => prev.map(m => m.id === menuModal ? { ...m, ...form, price: Number(form.price) } : m));
    }
    setMenuModal(null);
  };

  const saveIngredient = () => {
    if (ingModal === "new") {
      setIngredients(prev => [...prev, { ...form, id: Date.now(), stock: Number(form.stock), alert: Number(form.alert), cost: Number(form.cost) }]);
    } else {
      setIngredients(prev => prev.map(i => i.id === ingModal ? { ...i, ...form, stock: Number(form.stock), alert: Number(form.alert), cost: Number(form.cost) } : i));
    }
    setIngModal(null);
  };

  const saveUser = () => {
    if (userModal === "new") {
      setUsers(prev => [...prev, { ...form, id: Date.now(), active: true }]);
    } else {
      setUsers(prev => prev.map(u => u.id === userModal ? { ...u, ...form } : u));
    }
    setUserModal(null);
  };

  const openMenu = (item) => {
    setForm(item ? { ...item } : { name: "", category: "tragos", price: "", station: "barra" });
    setMenuModal(item ? item.id : "new");
  };

  const openIng = (ing) => {
    setForm(ing ? { ...ing } : { name: "", unit: "gr", stock: "", alert: "", cost: "" });
    setIngModal(ing ? ing.id : "new");
  };

  const openUser = (user) => {
    setForm(user ? { ...user } : { name: "", role: "garzon", pin: "" });
    setUserModal(user ? user.id : "new");
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 57px)" }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: C.bg2, borderRight: `1px solid ${C.border}`, padding: "20px 12px", flexShrink: 0 }}>
        {Object.entries(TAB_LABELS).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ display: "block", width: "100%", background: tab === key ? C.amber + "22" : "transparent", color: tab === key ? C.amber : C.muted, border: tab === key ? `1px solid ${C.amber}44` : "1px solid transparent", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700, textAlign: "left", cursor: "pointer", marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {label}
          </button>
        ))}
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {tab === "dashboard" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
              {[
                { label: "Mesas ocupadas", value: occupied, total: tables.length, color: C.amber },
                { label: "Comandas pendientes", value: totalPending, color: C.red },
                { label: "En caja (abierto)", value: fmt(totalMesa), color: C.green },
                { label: "Stock bajo", value: lowStock.length, color: lowStock.length > 0 ? C.yellow : C.green },
              ].map((s, i) => (
                <Card key={i}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 900, fontSize: 32, color: s.color }}>
                    {s.value}{s.total !== undefined && <span style={{ color: C.muted, fontSize: 18 }}>/{s.total}</span>}
                  </div>
                </Card>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Section title="Mesas en tiempo real">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                  {tables.map(t => (
                    <div key={t.id} style={{ background: t.status === "free" ? C.bg3 : C.amber + "33", border: `1px solid ${t.status === "free" ? C.border : C.amber}`, borderRadius: 8, padding: 8, textAlign: "center" }}>
                      <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 900, fontSize: 20, color: t.status === "free" ? C.muted : C.amber }}>{t.number}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{t.status === "free" ? "libre" : fmt(t.orders.reduce((s, o) => s + o.price * o.qty, 0))}</div>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title="Ingredientes con stock bajo">
                {!lowStock.length ? <div style={{ color: C.muted, padding: 20, textAlign: "center" }}>✅ Todo en orden</div> : (
                  lowStock.map(i => (
                    <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}33`, fontSize: 14 }}>
                      <span>{i.name}</span>
                      <span style={{ color: C.yellow, fontWeight: 700 }}>{i.stock} {i.unit} <span style={{ color: C.muted, fontWeight: 400 }}>/ min: {i.alert}</span></span>
                    </div>
                  ))
                )}
              </Section>
            </div>
          </>
        )}

        {tab === "menu" && (
          <Section title="Gestión de Menú" action={<Btn onClick={() => openMenu(null)} small>+ Nuevo ítem</Btn>}>
            {CATEGORIES.map(cat => {
              const items = menu.filter(m => m.category === cat);
              if (!items.length) return null;
              return (
                <div key={cat} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>{cat}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                    {items.map(item => (
                      <Card key={item.id} style={{ opacity: item.active ? 1 : 0.5 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                          <Badge color={item.station === "barra" ? C.blue : C.green}>{item.station}</Badge>
                        </div>
                        <div style={{ color: C.amber, fontWeight: 700, fontSize: 16, marginBottom: 10 }}>{fmt(item.price)}</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Btn onClick={() => openMenu(item)} small outline color={C.amber}>Editar</Btn>
                          <Btn onClick={() => setMenu(prev => prev.map(m => m.id === item.id ? { ...m, active: !m.active } : m))}
                            small outline color={item.active ? C.red : C.green}>{item.active ? "Pausar" : "Activar"}</Btn>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </Section>
        )}

        {tab === "inventario" && (
          <Section title="Inventario" action={<Btn onClick={() => openIng(null)} small>+ Nuevo</Btn>}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {ingredients.map(ing => {
                const low = ing.stock <= ing.alert;
                return (
                  <Card key={ing.id} style={{ border: `1px solid ${low ? C.yellow + "88" : C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{ing.name}</div>
                      {low && <Badge color={C.yellow}>Stock bajo</Badge>}
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ height: 6, background: C.bg3, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, (ing.stock / (ing.alert * 3)) * 100)}%`, background: low ? C.yellow : C.green, borderRadius: 3, transition: "width 0.5s" }} />
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 10 }}>
                      <span style={{ color: low ? C.yellow : C.green, fontWeight: 700 }}>{ing.stock} {ing.unit}</span>
                      <span style={{ color: C.muted }}>mín: {ing.alert} {ing.unit}</span>
                    </div>
                    <Btn onClick={() => openIng(ing)} small outline color={C.amber} full>Editar</Btn>
                  </Card>
                );
              })}
            </div>
          </Section>
        )}

        {tab === "recetas" && (
          <Section title="Recetas">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {menu.filter(m => m.active).map(item => (
                <Card key={item.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: item.recipe?.length ? 10 : 0 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</span>
                      <span style={{ color: C.muted, fontSize: 13, marginLeft: 10 }}>{fmt(item.price)}</span>
                    </div>
                    <Badge color={item.station === "barra" ? C.blue : C.green}>{item.station}</Badge>
                  </div>
                  {item.recipe?.length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {item.recipe.map((r, i) => {
                        const ing = ingredients.find(ing => ing.id === r.ingId);
                        return ing ? (
                          <div key={i} style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 12 }}>
                            <span style={{ color: C.amber, fontWeight: 700 }}>{r.qty}</span>
                            <span style={{ color: C.muted }}> {ing.unit}</span>
                            <span style={{ marginLeft: 4 }}>{ing.name}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                  {!item.recipe?.length && <div style={{ color: C.muted, fontSize: 13 }}>Sin receta configurada</div>}
                </Card>
              ))}
            </div>
          </Section>
        )}

        {tab === "usuarios" && (
          <Section title="Usuarios" action={<Btn onClick={() => openUser(null)} small>+ Nuevo</Btn>}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {users.map(u => (
                <Card key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
                  <div style={{ textAlign: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 30, marginBottom: 6 }}>{u.role === "admin" ? "⚙️" : u.role === "garzon" ? "🍽️" : u.role === "cajero" ? "💵" : u.role === "cocina" ? "👨‍🍳" : "🍹"}</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{u.name}</div>
                    <div style={{ marginTop: 4 }}><Badge color={ROLE_COLORS[u.role]}>{ROLES[u.role]}</Badge></div>
                    <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>PIN: {"•".repeat(u.pin.length)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn onClick={() => openUser(u)} small outline color={C.amber} full>Editar</Btn>
                    <Btn onClick={() => setUsers(prev => prev.map(usr => usr.id === u.id ? { ...usr, active: !usr.active } : usr))}
                      small outline color={u.active ? C.red : C.green}>{u.active ? "Off" : "On"}</Btn>
                  </div>
                </Card>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Modal menú */}
      {menuModal && (
        <Modal title={menuModal === "new" ? "Nuevo ítem" : "Editar ítem"} onClose={() => setMenuModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><Label>Nombre</Label><Input value={form.name || ""} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Nombre del producto" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><Label>Categoría</Label><Select value={form.category || ""} onChange={v => setForm(p => ({ ...p, category: v }))}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</Select></div>
              <div><Label>Precio CLP</Label><Input value={form.price || ""} onChange={v => setForm(p => ({ ...p, price: v }))} type="number" /></div>
            </div>
            <div><Label>Estación</Label>
              <div style={{ display: "flex", gap: 10 }}>
                {["cocina", "barra"].map(s => (
                  <button key={s} onClick={() => setForm(p => ({ ...p, station: s }))}
                    style={{ flex: 1, background: form.station === s ? C.amber : C.bg3, color: form.station === s ? "#fff" : C.muted, border: `1px solid ${form.station === s ? C.amber : C.border}`, borderRadius: 6, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>
                    {s === "cocina" ? "🍳 Cocina" : "🍹 Barra"}
                  </button>
                ))}
              </div>
            </div>
            <Btn onClick={saveMenuItem} full color={C.green}>Guardar</Btn>
          </div>
        </Modal>
      )}

      {/* Modal ingrediente */}
      {ingModal && (
        <Modal title={ingModal === "new" ? "Nuevo ingrediente" : "Editar ingrediente"} onClose={() => setIngModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><Label>Nombre</Label><Input value={form.name || ""} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Nombre" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><Label>Unidad</Label><Select value={form.unit || ""} onChange={v => setForm(p => ({ ...p, unit: v }))}>
                {["ml", "gr", "unid", "kg", "lt"].map(u => <option key={u} value={u}>{u}</option>)}
              </Select></div>
              <div><Label>Costo por unidad ($)</Label><Input value={form.cost || ""} onChange={v => setForm(p => ({ ...p, cost: v }))} type="number" /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><Label>Stock actual</Label><Input value={form.stock || ""} onChange={v => setForm(p => ({ ...p, stock: v }))} type="number" /></div>
              <div><Label>Alerta mínima</Label><Input value={form.alert || ""} onChange={v => setForm(p => ({ ...p, alert: v }))} type="number" /></div>
            </div>
            <Btn onClick={saveIngredient} full color={C.green}>Guardar</Btn>
          </div>
        </Modal>
      )}

      {/* Modal usuario */}
      {userModal && (
        <Modal title={userModal === "new" ? "Nuevo usuario" : "Editar usuario"} onClose={() => setUserModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><Label>Nombre</Label><Input value={form.name || ""} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Nombre" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><Label>Rol</Label><Select value={form.role || ""} onChange={v => setForm(p => ({ ...p, role: v }))}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select></div>
              <div><Label>PIN (4 dígitos)</Label><Input value={form.pin || ""} onChange={v => setForm(p => ({ ...p, pin: v.slice(0, 4) }))} type="password" placeholder="••••" /></div>
            </div>
            <Btn onClick={saveUser} full color={C.green}>Guardar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App() {
  const [users, setUsers] = useState(INITIAL_USERS);
  const [menu, setMenu] = useState(INITIAL_MENU);
  const [ingredients, setIngredients] = useState(INITIAL_INGREDIENTS);
  const [tables, setTables] = useState(INITIAL_TABLES);
  const [comandas, setComandas] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  const addComanda = useCallback((items, tableId, garzonName) => {
    const cocina = items.filter(i => i.station === "cocina");
    const barra = items.filter(i => i.station === "barra");
    const newCmds = [];
    if (cocina.length) newCmds.push({ id: cmdId(), station: "cocina", tableId, garzon: garzonName, time: now(), status: "pending", items: cocina.map(i => ({ ...i, done: false })) });
    if (barra.length) newCmds.push({ id: cmdId(), station: "barra", tableId, garzon: garzonName, time: now(), status: "pending", items: barra.map(i => ({ ...i, done: false })) });
    setComandas(prev => [...prev, ...newCmds]);

    // Descontar stock
    items.forEach(item => {
      const menuItem = menu.find(m => m.id === item.menuId);
      if (!menuItem?.recipe?.length) return;
      setIngredients(prev => prev.map(ing => {
        const rec = menuItem.recipe.find(r => r.ingId === ing.id);
        if (!rec) return ing;
        return { ...ing, stock: Math.max(0, ing.stock - rec.qty * item.qty) };
      }));
    });
  }, [menu]);

  // Sync comanda status back to table orders
  useEffect(() => {
    setTables(prev => prev.map(t => {
      if (t.status !== "occupied") return t;
      const tableComandas = comandas.filter(c => c.tableId === t.id);
      if (!tableComandas.length) return t;
      const updatedOrders = t.orders.map(order => {
        const cmd = tableComandas.find(c => c.items?.some(i => i.menuId === order.menuId));
        if (!cmd) return order;
        const cmdItem = cmd.items.find(i => i.menuId === order.menuId);
        if (cmd.status === "done" || cmdItem?.done) return { ...order, status: "done" };
        return order;
      });
      return { ...t, orders: updatedOrders };
    }));
  }, [comandas]);

  const pendingCmds = comandas.filter(c => c.status === "pending").length;

  if (!currentUser) return <Login users={users} onLogin={setCurrentUser} />;

  const renderView = () => {
    const { role } = currentUser;
    if (role === "garzon") return <GarzonView user={currentUser} tables={tables} setTables={setTables} menu={menu} addComanda={addComanda} />;
    if (role === "cocina") return <StationView station="cocina" comandas={comandas} setComandas={setComandas} tables={tables} />;
    if (role === "barra") return <StationView station="barra" comandas={comandas} setComandas={setComandas} tables={tables} />;
    if (role === "cajero") return <CajeroView tables={tables} setTables={setTables} menu={menu} />;
    if (role === "admin") return <AdminView menu={menu} setMenu={setMenu} ingredients={ingredients} setIngredients={setIngredients} users={users} setUsers={setUsers} tables={tables} comandas={comandas} />;
    return <div style={{ padding: 40, color: C.muted }}>Rol no configurado</div>;
  };

  return (
    <>
      <style>{GLOBAL_STYLE}</style>
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <Navbar user={currentUser} onLogout={() => setCurrentUser(null)} comandasPendientes={currentUser.role === "admin" ? pendingCmds : 0} />
        {renderView()}
      </div>
    </>
  );
}

