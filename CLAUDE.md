# Almíbar POS

## Proyecto
Sistema POS para **Almíbar** — bar-restaurant Nikkei, Francisco Moreno 418, Curicó, Chile.
Empresa: Inversiones Alma SpA. Dueño: Hector Maluenda.

## Stack
- **Framework**: React Native + Expo SDK 54 + TypeScript
- **Web**: Expo Web (React Native Web) desplegado en Vercel (`almibar-pos.vercel.app`)
- **Backend**: Supabase (sa-east-1) — `czdnllosfvakyibdijmb.supabase.co`
- **Print Server**: Node.js en `:3333`, impresoras en `:9101-9103`

## Estructura
```
AlmibarPOS/
├── App.tsx              # Entry point, TabNavigator, role routing
├── index.ts             # Expo registerRootComponent
├── src/
│   ├── screens/         # Pantallas principales
│   │   ├── TableMapScreen.tsx    # Mapa de mesas
│   │   ├── OrderScreen.tsx       # Pedido/cocina
│   │   ├── CajaScreen.tsx        # Caja, ventas, arqueos, propinas, anulaciones
│   │   ├── DeliveryScreen.tsx    # Delivery
│   │   ├── MobileTableScreen.tsx # Vista móvil garzón
│   │   └── admin/                # Admin screens
│   │       ├── ProductsScreen.tsx
│   │       ├── ModifiersScreen.tsx
│   │       ├── ReportsScreen.tsx
│   │       ├── ClientsScreen.tsx
│   │       ├── IngredientsScreen.tsx
│   │       └── ...
│   ├── components/      # TableCard, TabNavigator, AppOrdersPanel
│   ├── contexts/        # AuthContext, ConnectivityContext
│   ├── lib/             # supabase.ts (client init)
│   ├── theme.ts         # COLORS (tema claro, primary: #059669 emerald)
│   └── types/           # TypeScript interfaces
├── dist/                # Build web para Vercel
├── print-server.js      # Servidor de impresión ESC/POS
└── vercel.json          # Config deploy
```

## Reglas importantes

### Timezone
- Supabase almacena en UTC. Chile es UTC-3 (verano) / UTC-4 (invierno).
- **SIEMPRE** usar `toLocaleDateString('en-CA')` para fechas locales, NO `toISOString().split('T')[0]`.
- Para queries de rango, generar timestamps con offset de Chile: `YYYY-MM-DDT00:00:00-03:00`.
- Función helper `toChileISO(dateStr)` disponible en CajaScreen y ReportsScreen.

### Tema y colores
- Primary: `#059669` (emerald)
- Background: `#F1F5F9`, Card: `#FFFFFF`, Text: `#0F172A`
- El tema es claro (Fudo-style).

### React Native Web
- **NO usar** `e.stopPropagation()` en eventos de TouchableOpacity — no existe en RNW y crashea.
- **NO usar** `ScrollView horizontal` como contenedor flex — se expande en web. Usar `View` con `flexDirection: 'row'`.
- `flex: 1` puede comportarse diferente en web. Preferir `ScrollView` como raíz si hay problemas de espacio.
- El `dist/index.html` debe tener: `html,body{height:100%;margin:0;padding:0}` y `#root{display:flex;height:100%;flex:1}`.

### Deploy
- **POS**: `npx expo export --platform web` → `dist/` → push a GitHub → Vercel auto-deploy
- **App cliente**: `npx expo export --platform web` en `~/AlmibarApp` → copiar dist a `/tmp/almibarcurico-ai.github.io/` → push a GitHub Pages
- Vercel comprime gzip automáticamente — NO agregar `Content-Encoding: gzip` manual.

### Base de datos (Supabase)
Tablas principales:
- `users` — roles: admin, cajero, garzon, cocina, barra
- `tables`, `sectors` — mesas y sectores
- `orders`, `order_items` — pedidos
- `payments` — pagos (multi-método, propinas)
- `cash_registers`, `cash_movements` — arqueos de caja
- `products`, `categories` — menú
- `modifier_groups`, `modifier_options`, `product_modifier_groups`, `order_item_modifiers` — modificadores
- `clients`, `client_visits` — socios/miembros
- `delivery_orders`, `delivery_order_items`, `delivery_payments` — delivery
- `promo_banners` — banners promocionales y promo flash
- `ingredients`, `recipes`, `recipe_items` — recetas e inventario

### Promo Flash
- Productos con precio reducido: Shot Tequila ($1.000), Mojito Cubano ($2.500), Schop Patagonia ($2.500)
- IDs hardcodeados en `OrderScreen.tsx` → `PROMO_FLASH_PRODUCTS`
- Items promo se marcan con `[PROMO]` en notes y se excluyen del descuento del día
- Se activa/desactiva desde Admin > Clientes en Local

### Descuentos
- Miércoles: 40% automático (excluye items [PROMO], HH y Combos)
- Happy Hour: Lun-Sáb 17:00-21:00 (excepto miércoles)
- Los productos HH ya tienen precio reducido en la tabla products

## App Cliente (AlmibarApp)
- Repo: `~/AlmibarApp/` — PWA desplegada en `almibarcurico-ai.github.io`
- Tema: **Arena Nikkei** (claro cálido: fondo `#FAF6F0`, cards blancas, texto oscuro `#2D2A26`, dorado `#C8952A`)
- Comparte la misma BD Supabase
- Funcionalidades: menú con modificadores, carrito, pedido desde mesa, delivery, club de socios, reservas
