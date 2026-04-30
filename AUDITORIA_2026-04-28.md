# Auditoría Completa AlmibarPOS — 28 Abril 2026

**Alcance**: Seguridad, lógica financiera (CajaScreen 2.353 líneas, OrderScreen 1.695 líneas, DeliveryScreen 1.505 líneas), arquitectura, calidad de código. Total auditado: 17.886 líneas TS/TSX.

**Auditoría previa**: `AUDITORIA_RESULTADO.md` (10 abril 2026). Varios hallazgos del 10/04 siguen vigentes. Esta auditoría agrega ~50 hallazgos nuevos.

---

## 🔴 CRÍTICO — ATENCIÓN INMEDIATA (mismo día)

### S1. Token Bearer de WhatsApp Cloud API expuesto en GitHub público + Vercel
- **Archivos**: `src/screens/AdminScreen.tsx:411,468` y bundle compilado en `dist/_expo/static/js/web/index-d0f9ff6adc81e3acf1f33b993dc711f4.js`
- Commit que lo introdujo: `418de16` ("Promo Flash mejorada + Blast WhatsApp")
- El token `EAAOIZBr9SYXEB...` permite enviar WhatsApp suplantando a Almíbar a cualquier destinatario, agotar la cuota Meta, y posiblemente provocar bloqueo del número.
- **Acción**: revocar/rotar el token HOY en Meta Business Manager. Mover el blast a la Edge Function `supabase/functions/whatsapp-blast/` que ya está implementada correctamente con `Deno.env.get("WHATSAPP_TOKEN")`. Después borrar el secreto del historial git con `git filter-repo` o BFG.

### S2. PINs en texto plano + admin con PIN `0000`
- `src/contexts/AuthContext.tsx:69-75` — login: `supabase.from('users').select('*').eq('pin', pin)` (PIN como string en BD).
- Espacio de PINs = 10.000 → trivialmente brute-force.
- Confirmado en auditoría 10/04: Nico y Rosangela usan `0000` = admin.
- Si tabla `users` no tiene RLS bloqueando `SELECT` para `anon`, cualquier persona con la anon key (que es pública) puede dumpear todos los PINs.
- **Acción**:
  1. Cambiar PINs `0000` y degradar a rol cajero a quien no necesite admin.
  2. Verificar/agregar RLS en `users` para que `anon` no pueda leer la columna `pin`.
  3. Hashear PINs (bcrypt) vía RPC server-side; o migrar a Supabase Auth con OTP.

### S3. RLS de Supabase no versionada en el repo
- `supabase/` solo tiene `functions/whatsapp-blast/`. **Cero archivos `.sql`, ninguna política RLS commiteada.**
- Imposible auditar localmente. El cliente hace `insert`/`update`/`delete` directos a `cash_movements`, `orders`, `payments`, `users` (ej: `CajaScreen.tsx:622, 629, 986`, `OrderScreen.tsx:573`, `UsersScreen.tsx:21`). Todo eso depende de RLS para no ser explotable desde el navegador con la anon key.
- **Acción**: `supabase db dump --schema public` → commitear en `supabase/migrations/`. Verificar tabla por tabla que RLS está habilitado y que las políticas requieren `auth.role() = 'authenticated'` con role checks server-side.

### F1. Bug financiero: `closing_amount` se guarda CON consumo, pero `diff` se calcula SIN consumo → arqueos descuadrados artificialmente
- `CajaScreen.tsx:896` (handleClose): `closing_amount = cEf + cDe + cTr + cCr + cConsumo` (incluye consumo).
- `CajaScreen.tsx:1306-1308` (modal cierre): `userTotal = cEf + cDe + cTr + cCr` (NO incluye consumo) → `diff = userTotal - totalGeneral`.
- `CajaScreen.tsx:1300` muestra al cajero "Total usuario" SUMANDO consumo (texto en pantalla).
- **Cualquier arqueo donde el cajero haya tipeado consumo queda con `diff` falsamente positivo igual al monto del consumo.** Esto puede explicar parte del descuadre histórico de turnos.
- **Acción**: unificar la fórmula. Recomendado: `closing_amount` NO debe incluir consumo (es la regla #2 del blindaje en CLAUDE.md). Migración para corregir registros previos.

### F2. Editar arqueo cerrado descuadra para siempre
- `CajaScreen.tsx:1022-1047` (saveEditArqueo) sobrescribe `closing_amount` con `uEf + uDe + uCr + uTr` (sin campo para consumo) y NO actualiza `total_cash/debit/credit/transfer/sales/tips`.
- Si el dueño edita un arqueo viejo donde el bug delivery (corregido 10/04) dejó `total_cash` mal, no hay forma de corregirlo desde la UI: solo puede tocar `closing_amount`, lo que distorsiona en lugar de arreglar.
- **Acción**: agregar campo `cConsumo` al editor; permitir recálculo automático desde `payments+delivery_payments` reales del rango del turno.

### F3. Edición de venta destruye pagos split
- `CajaScreen.tsx:553-561` y `:962-969`: `update payments where order_id=X limit 1` modifica solo el primer payment.
- Si la orden tuvo 3 pagos (efectivo+tarjeta+transferencia), solo se modifica el primero. Los otros quedan con sus métodos viejos pero los totales recalculados como si todo fuera del nuevo método.
- No se borran pagos sobrantes ni se valida `Σ payments == orders.total`.
- **Acción**: rehacer la edición como `delete from payments where order_id=X` + reinsertar TODOS los pagos. O bloquear edición de órdenes con > 1 payment.

### F4. Race condition al cerrar caja → dinero huérfano
- `CajaScreen.tsx:894-918` (handleClose): lee `totalByMethod` desde state local y luego marca `closed_at = now()` sin re-querear payments.
- Si entre `loadData()` y el clic "Cerrar caja" entra un pago (mesa cobrando, delivery entregando), el pago **no entra a `total_cash` pero queda en BD**. El siguiente arqueo no lo verá (su `opened_at > closed_at` del pago) → dinero invisible.
- **Acción**: mover cierre de arqueo a un RPC transaccional `close_cash_register(id, closing_amount, notes)` que recompute totales en una transacción server-side.

### F5. Race condition `sendCartToKitchen` y `closeTable` → doble cobro / doble pedido
- `OrderScreen.tsx:588-629`: no hay flag `isSubmitting`. Doble-tap al botón "Confirmar" puede insertar el cart **dos veces** antes del `setCart([])` final.
- `OrderScreen.tsx:1437` botón "Cerrar mesa": solo se deshabilita si `payTotal < unpaidTotal`, no por estar ejecutando. Doble-tap dispara doble payment.
- **Acción**: agregar `useState<boolean>(false)` `isSending` y deshabilitar botones durante async.

### O1. `loadOrder` borra automáticamente descuento 40% en miércoles
- `OrderScreen.tsx:145-147`: si es miércoles y `discount_value === 40`, hace UPDATE silencioso a `discount_type='none'`.
- Esto destruye descuentos legítimos donde un admin aplicó 40% manual a un cliente VIP especial el miércoles.
- Además se ejecuta múltiples veces vía RT subscription → potencial loop de writes.
- **Acción**: eliminar este bloque o agregar flag `discount_source` ('auto'|'manual') y borrar solo los 'auto'.

---

## 🟠 ALTA — Esta semana

### S4. Blast WhatsApp en cliente sin role-check + CORS abierto en Edge Function
- `AdminScreen.tsx`: cualquier código corriendo en el navegador puede invocar el fetch a Meta directamente con el token expuesto.
- `supabase/functions/whatsapp-blast/index.ts:5`: `Access-Control-Allow-Origin: '*'`. Cualquier origen + anon key puede gatillar blasts.
- **Acción**: restringir CORS a `https://almibar-pos.vercel.app`, validar JWT del caller dentro de la función contra `users.role='admin'`.

### S5. Sin role checks client-side en operaciones críticas
- `AdminScreen.tsx`: cero `user.role === 'admin'`. Solo se oculta el tab en `TabNavigator.tsx:23`. Si esa lógica cambia accidentalmente, un cajero monta admin completo.
- `CajaScreen.tsx`: `handleAdd` (gastos), `delMov` (borrar movimientos), `openEditArqueo` no verifican rol.
- `OrderScreen.tsx:1256-1276`: cualquier cajero aplica `discount_value` arbitrario (incluso > 100%, mitigado solo por `Math.max(0, ...)`).
- **Acción**: guards `if (user.role !== 'admin') return Alert.alert('Solo admin');` + replicar en RLS.

### S6. `print-server.js` HTTP `:3333` sin auth, CORS `*`
- `print-server.js:489-554`: cualquier dispositivo en la WiFi del local puede enviar prints arbitrarios a cocina/barra/caja, generando tickets falsos.
- Posible SSRF: el cliente puede pasar `ip` y `port` arbitrarios → conectar a hosts internos.
- **Acción**: bind a `127.0.0.1` o whitelist de IPs locales; agregar shared secret `Authorization: Bearer ENV_VAR`; validar que `ip` esté en whitelist conocida.

### F6. CostosTab y PropinasTab IGNORAN delivery
- `CajaScreen.tsx:2063-2069` (CostosTab) consulta solo `from('orders')`. Pizzas/sushis vendidos por delivery NO aparecen en food cost del día.
- `CajaScreen.tsx:1808-1815` (PropinasTab) idem: el reporte de propinas para garzones no incluye las propinas de delivery.
- **Acción**: agregar UNION con `delivery_orders`/`delivery_payments` en ambas tabs.

### F7. ArqueosTab `todayOrders` solo carga mesas, no delivery
- `CajaScreen.tsx:800-801`: `from('orders').eq('status','cerrada')`. Pero línea 912 guarda `total_orders: todayOrders.length` en BD y 1217 muestra el listado al cerrar caja.
- El conteo de órdenes del turno y el listado visual del modal de cierre están subestimados (faltan deliveries). Solo el monto está bien por el fix del 10/04.
- **Acción**: incluir `delivery_orders` en `todayOrders` o renombrar y separar visualmente.

### F8. Inconsistencia entre fuentes de propinas (3 tabs distintas, 3 fuentes)
- VentasTab `totals.propinas` (`:257`): `orders.tip_amount`.
- PropinasTab (`:1827`): `orders.tip_amount`.
- ArqueosTab (`:849`): `payments.tip_amount`.
- En pagos split, `orders.tip_amount` solo guarda la propina del primer payment, mientras `payments.tip_amount` suma todos. Divergencia estructural — los tres tabs muestran números distintos para el mismo turno.
- **Acción**: definir UNA fuente de verdad (recomendado: `payments.tip_amount`) y refactorizar.

### F9. `findShiftRange` permite `closed_at = null` con `until = now + 24h`
- `CajaScreen.tsx:162` y `:1781`: si el arqueo está abierto, `until = now + 86400000`. Si quedó abierto del día anterior, consultar "ayer" mete ventas de hoy en el reporte.
- **Acción**: si `closed_at` es null, usar `now()` exacto, no `now + 24h`.

### F10. `confirmModifiers` no recalcula descuento sobre modificadores con upcharge
- `OrderScreen.tsx:363-398`: `getAutoDiscount` se aplica al precio base, no a `(precio + ajuste de mods)`. Mojito $5000 + agregado $1000 con HH -35% queda en $4250 (`5000*0.65 + 1000`), no $3900 (`6000*0.65`).
- **Acción**: aplicar descuento al precio efectivo total (base + mods) o documentar la regla actual.

### F11. Botón "Sin agregados" agrega items SIN aplicar descuento ni promo flash
- `OrderScreen.tsx:1095`: cuando `allOptional && Sin agregados` se presiona, hace `setCart(prev => [...prev, { product, quantity: 1, ... }])` directamente.
- No invoca `getAutoDiscount` ni revisa `PROMO_FLASH_PRODUCTS`. Items así agregados no reciben miércoles 40%, ni HH, ni promo.
- **Acción**: extraer la lógica de `addToCart` a una función pura y reutilizarla aquí.

### F12. `paySelected` no graba `discount_type/discount_value` al cerrar la orden
- `OrderScreen.tsx:765-776` vs `closeTable:832`: en pago parcial completo, la orden se cierra sin registro del descuento aplicado. Impacta reportes y arqueos.

### F13. `printByClient` propina hardcoded a 10%
- `OrderScreen.tsx:564`: `tip: clientOriginalSubtotal * 0.1`. Si la mesa tiene política 15%, el ticket por cliente imprime 10%. Inconsistente con el flujo principal.

### F14. `PROMO_FLASH_PRODUCTS` IDs hardcodeados sin validación
- `OrderScreen.tsx:98-103`: si el producto se elimina/recrea o se duplica el menú, la promo deja de aplicarse silenciosamente. Sin error log.
- **Acción**: mover a tabla `promo_flash_products` en BD, vinculada por `product_id`.

### A1. Mismatch React/types y deps con CVE
- `package.json`: `react@19.1.0` + `@types/react@~18.3.12` (desfasado) + `react-native-web@0.21` (oficialmente requiere React 18).
- `xlsx@0.18.5` tiene CVEs de prototype pollution conocidos.
- **Acción**: actualizar `@types/react@~19.0`. Considerar reemplazar `xlsx` por `exceljs` o restringir su uso.

### A2. DeliveryScreen no es portable a iOS/Android
- 142 `<div>` y 35 `<button>` en RN component. `onClick={(e) => e.stopPropagation()}` rompe en RNW (regla del propio CLAUDE.md).
- **Acción**: reescribir con `<View>`, `<Pressable>`, `StyleSheet.create`. (1-2 días)

---

## 🟡 MEDIA — Mes próximo

### F15. `toISOString().split('T')[0]` en 11+ lugares de CajaScreen
- Líneas 150, 176, 183, 890, 1166-1168, 2017, 2042, 2049, 2198. Especialmente `:1166` (botón "Ahora" del modal apertura): después de 21:00 Chile, precarga la fecha de mañana en UTC.
- **Acción**: reemplazar por `toLocaleDateString('en-CA')` (helper ya existente en el archivo).

### F16. `editOrder.subtotal` puede ser undefined al editar órdenes viejas
- `CajaScreen.tsx:546, 954`: `Math.max(0, (editOrder.subtotal || 0) - discount_value)`. Si BD tiene null, total queda 0.
- **Acción**: recomputar subtotal desde `order_items` antes de guardar.

### F17. `tip_amount` permite valores negativos sin validación
- `CajaScreen.tsx:529, 549, 559, 957, 967`: `parseInt(t) || 0`. Una propina negativa reduce artificialmente el total.

### F18. `EditArqueo` parser frágil para conteo de monedas en `notes`
- `CajaScreen.tsx:1003-1013`: regex `\{[^}]+\}` se rompe si el cajero escribe `{` en notas regulares.
- **Acción**: prefijo dedicado `__USERCOUNT__:{...}` o columna nueva.

### F19. `vip_expires_at` no se verifica en `getAutoDiscount`
- `OrderScreen.tsx:262`: `clientTier === 'vip'` aplica descuento aunque haya expirado.

### F20. `groupItemsForPrint` pierde modificadores
- `OrderScreen.tsx:518-531`: agrupa por nombre+precio. Items con mismos productos pero distintos mods se fusionan → boleta sin detalle.

### F21. `mergeFrom`/`splitToTable` no preservan discount/tip/cliente
- `OrderScreen.tsx:488-497, 507`: al fusionar/separar mesas, se pierde `discount_type`, `discount_value`, `tip_amount`, `client_id`.

### S7. `vercel.json` sin headers de seguridad
- Faltan: HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy, Permissions-Policy.
- App vulnerable a clickjacking, MIME-sniffing.

### S8. `dist/` versionado en Git
- Aumenta superficie de exposición de secretos (el token WhatsApp aparece en `src/` Y en `dist/`). Diffs binarios masivos en cada deploy.
- **Acción**: agregar `dist/` a `.gitignore`, configurar `buildCommand: "expo export --platform web"` en `vercel.json`, agregar script `build` en `package.json`.

### S9. Anon key duplicada en 7 archivos
- `lib/supabase.ts` correctamente; pero también en `FacturaScannerScreen.tsx:7-8`, `PurchasesScreen.tsx:8-9`, `print-server.js`, `scripts/{backup,health-check,import-fudo}.js`.
- **Acción**: importar desde `lib/supabase.ts`. Scripts Node deben leer de `process.env`.

### S10. `restoreSession` confía en role cacheado en AsyncStorage
- `AuthContext.tsx:38-62`: revalida que el usuario existe pero NO el `role`. Cambios de rol no se reflejan hasta que cierra sesión.

### A3. `toChileISO` duplicado 5 veces
- `CajaScreen.tsx:135, 1680, 1773, 2005` (4 copias en el mismo archivo) + `admin/ReportsScreen.tsx:13`.
- **Acción**: extraer a `src/lib/dates.ts` con `toChileISO`, `findShiftRange`, `getNowChile`.

### A4. CajaScreen es un god object con 7 sub-tabs en 1 archivo y `toChileISO` duplicado 4 veces internamente
- 103 hooks `useState/useEffect`. Imposible de mantener.
- **Acción**: extraer cada Tab a `src/screens/caja/*.tsx` manteniendo el blindaje documentado.

### A5. Sin tests
- `App.test.js` es default de Create-React-App (`screen.getByText(/learn react/i)`) — nunca corrió, no aplica.
- En un POS con fórmulas financieras blindadas, esto es un riesgo alto.
- **Acción**: setup `jest-expo` + tests para `dates`, `pricing` (getAutoDiscount), `caja sysTotal`.

### A6. 540 ocurrencias de `any` con `strict: true`
- Patrón típico: `useState<any[]>([])`, `catch (e: any)`. Tipos definidos en `src/types/` casi no se usan.

### A7. ScrollView + .map en lugar de FlatList
- 290 ScrollView vs 1 FlatList. CajaScreen tiene 84 `.map()` renderizando potencialmente cientos de órdenes/pagos. En mobile colapsa con datasets reales.

### A8. `print-server.js` y app upload `base64` sin validación de tamaño/MIME
- `FacturaScannerScreen.tsx:46-67`: imágenes a Edge Function sin cap de tamaño (límite Supabase 6MB). Una imagen mal puede saturar.

---

## 🟢 BAJA

- **B1.** `console.error/log/warn` en producción: 36 ocurrencias en `src/`, 4 críticas en `OrderScreen` (líneas 458, 619, 731, 1020). Sin gating por `__DEV__`.
- **B2.** 147 `alert(...)` mezclando `Alert.alert` (RN) y `window.alert` (web). Crear `src/lib/notify.ts`.
- **B3.** Funciones helpers duplicadas inline 4 veces en CajaScreen: `addDays`, `toChileISO`, `findShiftRange`.
- **B4.** Variables muertas en OrderScreen: `bloqueadas: string[] = []` (`:173`), `HH_CAT_ID` (`:212`), `isHHAllowed` (`:213-220`). `esMiercoles` calculado dos veces (`:74` y `:171`) — el de `:74` queda fijo si la pantalla se mantiene abierta cruzando medianoche.
- **B5.** `printByClient` early return sin reset `setIsPrinting(false)` (`:535-538`) → bloquea botón hasta recargar.
- **B6.** `dist/robots.txt` permite indexar todo el POS. Cambiar a `Disallow: /`.
- **B7.** `App.tsx:5-18` polling auto-reload de `version.txt` cada 5min sin cleanup, fuera de componente.
- **B8.** `loadAllArqueos` `.limit(50)` sin paginación. Consultar fechas previas a 50 turnos atrás (~1.5 meses) devuelve 0 ventas silenciosamente.
- **B9.** `delMov` en MovimientosTab usa `window.confirm` (`:628`) — en móvil nativo no existe y borra sin confirmar.
- **B10.** Sin debounce en `searchEditClient` y `searchGuestNames` (`OrderScreen:650-656, 1511-1518`) → resultados out-of-order en conexión lenta.
- **B11.** `package.json main: "index.ts"` en SDK 54 — funciona pero dificulta migrar a Expo Router.
- **B12.** Comentario incorrecto en `CajaScreen:899-911`: dice `total_credit` pero asigna `pedidosya` (campo legacy reutilizado).

---

## Resumen ejecutivo

| Severidad | # Hallazgos | Acción |
|-----------|-------------|--------|
| 🔴 Crítico | 9 (3 sec + 6 fin/lógica) | Hoy/mañana |
| 🟠 Alta | 14 | Esta semana |
| 🟡 Media | 17 | Mes próximo |
| 🟢 Baja | 12 | Backlog |

### Top 5 acciones inmediatas (HOY)

1. **Rotar el token WhatsApp en Meta Business** y borrar del repo (`AdminScreen.tsx:411,468`).
2. **Cambiar PINs `0000` de Nico/Rosangela** y verificar RLS de tabla `users` en Supabase.
3. **Bug consumo en arqueo (F1)**: alinear `closing_amount` y `diff` para que ambos excluyan consumo (regla #2 del blindaje).
4. **Flag `isSubmitting` en `sendCartToKitchen` y `closeTable`** para evitar doble-tap → doble cobro/pedido.
5. **Eliminar el auto-borrado del descuento 40% miércoles** (`OrderScreen.tsx:145-147`) o agregar `discount_source`.

### Top 5 acciones esta semana

6. Mover blast WhatsApp del cliente a la Edge Function (que ya existe correctamente implementada).
7. Auditar/commitear políticas RLS de Supabase.
8. RPC transaccional `close_cash_register(...)` para resolver F4 + race conditions.
9. Edición de pagos split: rehacer como `delete + reinsert` (F3).
10. Incluir `delivery_orders/payments` en CostosTab y PropinasTab (F6).

### Estado del arqueo (vs auditoría 10/04)

- ✅ Mesa + Delivery integrados en arqueo (corregido 10/04).
- ✅ Propina pre-descuento corregida en `closeTable`/`precuenta`/`printByClient` (commit `366a67b`, 25/04).
- ✅ Trigger `trg_prevent_items_closed` en BD evita items en órdenes cerradas.
- ⚠️ **NUEVO descuadre detectado**: `closing_amount` con consumo (F1) — alta prioridad.
- ⚠️ **NUEVO**: arqueos editados quedan inconsistentes (F2, F3).
- ⚠️ Sigue: edición split (hallazgo #11 del 10/04 confirmado y profundizado en F3).
- ⚠️ Sigue: `toISOString().split('T')[0]` no migrado (F15).
- ⚠️ Sigue: race condition al cerrar caja sin transacción atómica (F4 confirma hallazgo #15 del 10/04).
