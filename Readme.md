# NOUS - Sistema de Gestión de Inventario y POS (Backend)

NOUS es una API RESTful construida con Node.js, Express y PostgreSQL. Su objetivo principal es la gestión centralizada de inventario retail, garantizando trazabilidad absoluta mediante un sistema de Kardex inmutable y soportando operaciones de Punto de Venta (POS) y logística de proveedores (facturas XML).

---

## 🏗️ 1. Arquitectura de Base de Datos (Esquema `nous`)

El sistema utiliza una base de datos relacional estricta para garantizar que nunca haya "productos fantasma" o inventario descuadrado. Todas las tablas viven bajo el esquema `nous`.

### Relaciones Principales (Entity-Relationship)
* Un **Producto** tiene un **Color**.
* Un **SKU** une un **Producto** con una **Talla** y le asigna un **Código de Barras (EAN)**.
* El **Kardex** registra movimientos históricos de un **SKU** en una **Tienda**.
* El **Inventario** es una tabla de consulta rápida que resume el saldo actual de un **SKU** basándose en el **Kardex**.

### Explicación Detallada de Tablas

#### Catálogo y Definiciones
1. **`tiendas`**
   * **Propósito:** Define las sucursales físicas o almacenes.
   * **Columnas clave:** `id` (PK), `nombre`, `direccion`.
   * **Relaciones:** Un movimiento en el Kardex o en el Inventario siempre pertenece a una tienda específica.

2. **`colores`** y **`tallas`**
   * **Propósito:** Tablas de diccionario para normalizar los atributos de la ropa.
   * **Columnas clave:** `id` (PK), `nombre` (en colores), `codigo` (en tallas).

3. **`productos`**
   * **Propósito:** Almacena la información base o "modelo" de la prenda, independiente de si es talla S o L.
   * **Columnas clave:** `id` (PK), `nombre_koaj` (ej. "CAMISETA KOAJ"), `referencia_base` (ej. "1052057611"), `color_id` (FK -> colores.id).
   * **Relaciones:** Un producto pertenece a un solo color. Si la misma camisa viene en rojo y azul, son dos `productos` distintos en este modelo.

4. **`skus` (Stock Keeping Unit)**
   * **Propósito:** Es la tabla puente que define el artículo físico exacto que se puede escanear en caja.
   * **Columnas clave:** `id` (PK), `producto_id` (FK), `talla_id` (FK), `ean` (VARCHAR, UNIQUE).
   * **Relaciones:** Conecta el catálogo con el mundo real a través del código de barras (`ean`).

#### Logística y Operación
5. **`recepciones`**
   * **Propósito:** Almacena la cabecera de las facturas XML que envía el proveedor (KOAJ) y controla si un camión llegó incompleto.
   * **Columnas clave:** `id` (PK), `tienda_id` (FK), `factura_koaj`, `numero_entrega` (control de entregas parciales), `estado` (abierta, finalizada, etc.).

6. **`kardex` (El Libro Mayor)**
   * **Propósito:** Es el corazón del sistema. Es una tabla **inmutable**; los registros nunca se actualizan o borran, solo se insertan nuevos movimientos (entradas o salidas).
   * **Columnas clave:** * `id` (PK)
     * `sku_id` (FK), `tienda_id` (FK)
     * `tipo` (VARCHAR, restringido a: 'entrada_compra', 'venta', 'ajuste_positivo', etc.)
     * `cantidad` (INTEGER): Positivo para entradas (ej. 10), negativo para salidas (ej. -1).
     * `created_at` (TIMESTAMPTZ): Fecha y hora exacta del movimiento.

7. **`inventario` (Caché de Stock)**
   * **Propósito:** Tabla optimizada para consultas de lectura rápida (usada en el Punto de Venta). Evita tener que sumar miles de filas del Kardex cada vez que se busca un producto.
   * **Columnas clave:** `sku_id` (FK), `tienda_id` (FK), `cantidad` (INTEGER), `actualizado_en` (TIMESTAMPTZ).
   * **Automatización:** Se actualiza **sola** mediante el trigger de base de datos `fn_actualizar_cache_inventario()` cada vez que se inserta una fila en el `kardex`.

---

## 🚀 2. Documentación de la API (Endpoints)

Todas las rutas operan bajo `http://localhost:3000/api` y requieren autenticación mediante JWT (roles: `admin`, `vendedor`).

### 📦 Módulo: Recepciones (`/recepciones`)

* **POST `/upload`**
  * **Descripción:** Procesa un archivo XML de KOAJ. Si la factura ya existe, crea una nueva entrega parcial.
  * **Body (form-data):** `xml` (File), `tienda_id` (Integer), `margen_objetivo` (Float).
  * **Respuesta (200 OK):**
    ```json
    { "message": "XML procesado", "factura_koaj": "FE-123", "entrega_numero": 1 }
    ```

* **POST `/cerrar`**
  * **Descripción:** Finaliza una recepción, calcula faltantes e inserta la mercancía física en el Kardex.
  * **Body (JSON):** `{ "recepcion_id": 102 }`

* **GET `/trazabilidad/:factura_koaj`**
  * **Descripción:** Devuelve un resumen consolidado de todas las entregas parciales de una factura específica vs lo esperado en el XML.

### 📊 Módulo: Inventario (`/inventario`)

* **GET `/stock/:tienda_id`**
  * **Descripción:** Lista todo el inventario disponible y sumado en la tienda especificada.
  * **Respuesta (200 OK):**
    ```json
    [
      {
        "referencia_base": "10520",
        "nombre_koaj": "CAMISETA KOAJ",
        "talla": "S",
        "color": "Café",
        "stock_disponible": 9
      }
    ]
    ```

* **GET `/kardex/:sku_id?tienda_id=1`**
  * **Descripción:** Auditoría detallada. Muestra la historia cronológica de un producto específico.

### 🛒 Módulo: Ventas (`/ventas`)

* **POST `/venta-rapida`**
  * **Descripción:** Escanea un código EAN, valida existencias (> 0) y descuenta 1 unidad del inventario insertando un registro negativo en el Kardex.
  * **Body (JSON):** `{ "ean": "770123456789", "tienda_id": 1 }`
  * **Respuesta (200 OK):**
    ```json
    {
      "status": "success",
      "message": "Venta exitosa de CAMISETA KOAJ. Stock restante: 8"
    }
    ```
  * **Respuesta Error (400):** Si no hay stock disponible, el sistema hace rollback.

---
*Documentación generada para NOUS v1.0.*