# Auditoría AlmibarPOS — 10 Abril 2026

## Bugs corregidos

### CRITICO
1. **Delivery payments no se integraban al arqueo** — `CajaScreen.tsx:830`
   - `shiftDelivPayments` se cargaba pero nunca se usaba en los cálculos de `totalByMethod`
   - FIX: Unificado `shiftPayments + shiftDelivPayments` en `allShiftPayments` para que todos los cálculos del arqueo incluyan delivery

2. **Items podían agregarse a ordenes cerradas** — `OrderScreen.tsx:429`, BD trigger
   - Moises agregó una Piña Colada a mesa cerrada 35 min después del cierre
   - FIX: Validación en `sendCartToKitchen` + trigger `trg_prevent_items_closed` en BD

3. **Bug de conversión de unidades en recetas** — BD `recipe_items`
   - Recetas en g/ml pero ingredientes en kg/lt. El sistema descontaba 180 kg en vez de 0.18 kg
   - FIX: Convertidas 93 recetas + corregido "Mojito Sandia" (unit NULL) + reseteados 35 stocks

### ALTO
4. **Stock no se descontaba en pedidos de App Cliente** — `CartScreen.js:93`
   - La App insertaba items pero no llamaba `send_order_and_deduct_stock`
   - FIX: Agregada llamada al RPC después de insertar items

5. **Modificadores de App sin option_name** — `CartScreen.js:88`
   - App guardaba `modifier_option_id` pero no `option_name`. POS no mostraba nombre
   - FIX: Agregado `option_id` y `option_name` al INSERT de modificadores

6. **Payment method incorrecto Mesa 4** — BD `orders` y `payments`
   - Registrada como efectivo pero cobrada con tarjeta
   - FIX: Corregido en ambas tablas

## Bugs encontrados NO corregidos

### ALTO
7. **Propina en pago full se calcula sobre total CON descuento** — `OrderScreen.tsx:584`
   - En pago parcial se calcula sobre subtotal (correcto). En pago full sobre total con descuento (incorrecto según la regla)
   - NO CORREGIDO: Requiere validar con el dueño si la regla aplica solo en pago parcial o en ambos

### MEDIO
8. **Descuento miércoles 40% puede ser removido manualmente** — `OrderScreen.tsx:1066-1079`
   - Un cajero puede cambiar el descuento a 0% o a otro valor
   - NO CORREGIDO: Puede ser intencional (ej: cortesía que no lleva 40%)

9. **No hay realtime/refresh en App Cliente** — Toda la app
   - El menú se carga una vez y nunca se refresca. Precios desactualizados si cambian
   - NO CORREGIDO: Requiere implementar service worker o polling (Fase 2 del plan original)

10. **DeliveryScreen usa HTML nativo** — `DeliveryScreen.tsx`
    - Usa `<div>`, `<button>` en vez de React Native components. No compilará en móvil nativo
    - NO CORREGIDO: Solo afecta si se compila para iOS/Android

11. **Edit de venta solo actualiza primer payment** — `CajaScreen.tsx:554-561`
    - Si la orden tuvo pago split, solo se modifica el primero
    - NO CORREGIDO: Edición manual poco frecuente

12. **Uso de toISOString().split('T')[0]** — `CajaScreen.tsx:888, 1160-1162`
    - Debería usar `toLocaleDateString('en-CA')` para evitar edge case timezone
    - NO CORREGIDO: Impacto mínimo, solo después de medianoche UTC

### BAJO
13. `console.error` en ProductsScreen y PurchasesScreen (producción)
14. `e.stopPropagation` en divs de DeliveryScreen (OK en web, no en nativo)
15. Race condition teórica al cerrar caja (sin transacción atómica)

## Estado del arqueo
⚠️ CON ADVERTENCIAS
- Fórmula de diferencia: ✅ Correcta
- Mesa + Delivery: ✅ Corregido (delivery ahora se incluye)
- Métodos de pago: ✅ Correctos (methodAlias debito/credito → tarjeta)
- Propinas: ⚠️ Inconsistencia pago full vs parcial (hallazgo 7)
- Integridad orders → payments: ✅ OK (excepto edición split, hallazgo 11)

## Recomendaciones
1. Hacer deploy del POS para aplicar fix de delivery en arqueo
2. Hacer deploy de App Cliente para fix de stock + modifiers
3. Validar si propina debe ser siempre sobre subtotal sin descuento
4. Implementar auto-refresh en App Cliente (polling cada 5 min o realtime)
5. Asignar PINs únicos a Nico y Rosangela (ambos usan 0000 = admin)
6. Investigar los $111.150 faltantes en efectivo del turno 09/04
