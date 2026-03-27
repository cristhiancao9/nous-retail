--
-- PostgreSQL database dump
--

\restrict 8sLUMNznSjkf6i2aIpnMhbcFksMMn2tP7XOeTjEXvHI8KwmuzTcHa0aYSBHHzxX

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.1

-- Started on 2026-03-26 07:51:04

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 7 (class 2615 OID 17744)
-- Name: nous; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA nous;


ALTER SCHEMA nous OWNER TO postgres;

--
-- TOC entry 2 (class 3079 OID 17036)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 5393 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 307 (class 1255 OID 17968)
-- Name: fn_actualizar_cache_inventario(); Type: FUNCTION; Schema: nous; Owner: postgres
--

CREATE FUNCTION nous.fn_actualizar_cache_inventario() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Aquí es donde estaba el error: le faltaba el prefijo 'nous.'
    INSERT INTO nous.inventario (sku_id, tienda_id, cantidad)
    VALUES (NEW.sku_id, NEW.tienda_id, NEW.cantidad)
    ON CONFLICT (sku_id, tienda_id)
    DO UPDATE SET
        cantidad       = nous.inventario.cantidad + NEW.cantidad,
        actualizado_en = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION nous.fn_actualizar_cache_inventario() OWNER TO postgres;

--
-- TOC entry 305 (class 1255 OID 17967)
-- Name: fn_recalcular_inventario(integer, integer); Type: FUNCTION; Schema: nous; Owner: postgres
--

CREATE FUNCTION nous.fn_recalcular_inventario(p_sku_id integer, p_tienda_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_cantidad INT;
BEGIN
    SELECT COALESCE(SUM(cantidad), 0)
    INTO v_cantidad
    FROM kardex
    WHERE sku_id = p_sku_id AND tienda_id = p_tienda_id;

    INSERT INTO inventario (sku_id, tienda_id, cantidad)
    VALUES (p_sku_id, p_tienda_id, v_cantidad)
    ON CONFLICT (sku_id, tienda_id)
    DO UPDATE SET
        cantidad = EXCLUDED.cantidad,
        actualizado_en = NOW();
END;
$$;


ALTER FUNCTION nous.fn_recalcular_inventario(p_sku_id integer, p_tienda_id integer) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 254 (class 1259 OID 18288)
-- Name: ajuste_items; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.ajuste_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ajuste_id uuid NOT NULL,
    sku_id integer NOT NULL,
    cantidad_sistema integer NOT NULL,
    cantidad_real integer NOT NULL,
    diferencia integer GENERATED ALWAYS AS ((cantidad_real - cantidad_sistema)) STORED,
    creado_en timestamp with time zone DEFAULT now()
);


ALTER TABLE nous.ajuste_items OWNER TO postgres;

--
-- TOC entry 253 (class 1259 OID 18267)
-- Name: ajustes_inventario; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.ajustes_inventario (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id integer NOT NULL,
    usuario_id integer NOT NULL,
    motivo character varying(200) NOT NULL,
    creado_en timestamp with time zone DEFAULT now()
);


ALTER TABLE nous.ajustes_inventario OWNER TO postgres;

--
-- TOC entry 245 (class 1259 OID 18020)
-- Name: cajas; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.cajas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id integer NOT NULL,
    usuario_id integer NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    base_apertura integer DEFAULT 0 NOT NULL,
    total_efectivo integer DEFAULT 0,
    total_tarjeta integer DEFAULT 0,
    total_transferencia integer DEFAULT 0,
    estado character varying(20) DEFAULT 'abierta'::character varying,
    abierta_en timestamp with time zone DEFAULT now(),
    cerrada_en timestamp with time zone,
    CONSTRAINT cajas_estado_check CHECK (((estado)::text = ANY ((ARRAY['abierta'::character varying, 'cerrada'::character varying])::text[])))
);


ALTER TABLE nous.cajas OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 17785)
-- Name: clientes; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.clientes (
    id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    documento character varying(20),
    telefono character varying(20),
    email character varying(200),
    creado_en timestamp with time zone DEFAULT now()
);


ALTER TABLE nous.clientes OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 17784)
-- Name: clientes_id_seq; Type: SEQUENCE; Schema: nous; Owner: postgres
--

CREATE SEQUENCE nous.clientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE nous.clientes_id_seq OWNER TO postgres;

--
-- TOC entry 5394 (class 0 OID 0)
-- Dependencies: 229
-- Name: clientes_id_seq; Type: SEQUENCE OWNED BY; Schema: nous; Owner: postgres
--

ALTER SEQUENCE nous.clientes_id_seq OWNED BY nous.clientes.id;


--
-- TOC entry 232 (class 1259 OID 17795)
-- Name: colores; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.colores (
    id integer NOT NULL,
    codigo character varying(10) NOT NULL,
    nombre character varying(100) NOT NULL,
    hex_referencia character varying(7),
    creado_en timestamp with time zone DEFAULT now()
);


ALTER TABLE nous.colores OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 17794)
-- Name: colores_id_seq; Type: SEQUENCE; Schema: nous; Owner: postgres
--

CREATE SEQUENCE nous.colores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE nous.colores_id_seq OWNER TO postgres;

--
-- TOC entry 5395 (class 0 OID 0)
-- Dependencies: 231
-- Name: colores_id_seq; Type: SEQUENCE OWNED BY; Schema: nous; Owner: postgres
--

ALTER SEQUENCE nous.colores_id_seq OWNED BY nous.colores.id;


--
-- TOC entry 249 (class 1259 OID 18163)
-- Name: devolucion_items_entrada; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.devolucion_items_entrada (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    devolucion_id uuid NOT NULL,
    sku_id integer NOT NULL,
    venta_item_id uuid,
    cantidad integer DEFAULT 1 NOT NULL,
    precio_original integer NOT NULL,
    creado_en timestamp with time zone DEFAULT now()
);


ALTER TABLE nous.devolucion_items_entrada OWNER TO postgres;

--
-- TOC entry 250 (class 1259 OID 18191)
-- Name: devolucion_items_salida; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.devolucion_items_salida (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    devolucion_id uuid NOT NULL,
    sku_id integer NOT NULL,
    cantidad integer DEFAULT 1 NOT NULL,
    precio_venta integer NOT NULL,
    creado_en timestamp with time zone DEFAULT now()
);


ALTER TABLE nous.devolucion_items_salida OWNER TO postgres;

--
-- TOC entry 248 (class 1259 OID 18127)
-- Name: devoluciones; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.devoluciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venta_id uuid NOT NULL,
    tienda_id integer NOT NULL,
    usuario_id integer NOT NULL,
    cliente_id integer,
    tipo character varying(20) NOT NULL,
    diferencia_precio integer DEFAULT 0,
    motivo text,
    creado_en timestamp with time zone DEFAULT now(),
    CONSTRAINT devoluciones_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['cambio'::character varying, 'devolucion'::character varying])::text[])))
);


ALTER TABLE nous.devoluciones OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 17946)
-- Name: inventario; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.inventario (
    sku_id integer NOT NULL,
    tienda_id integer NOT NULL,
    cantidad integer DEFAULT 0 NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now()
);


ALTER TABLE nous.inventario OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 17911)
-- Name: kardex; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.kardex (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sku_id integer NOT NULL,
    tienda_id integer NOT NULL,
    tipo character varying(100) NOT NULL,
    cantidad integer NOT NULL,
    referencia_id uuid,
    referencia_tipo character varying(30),
    usuario_id integer,
    notas text,
    creado_en timestamp with time zone DEFAULT now(),
    tipo_movimiento character varying(50),
    referencia_documento character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kardex_cantidad_check CHECK ((cantidad <> 0)),
    CONSTRAINT kardex_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('entrada_compra'::character varying)::text, ('venta'::character varying)::text, ('devolucion_cliente'::character varying)::text, ('devolucion_proveedor'::character varying)::text, ('ajuste_positivo'::character varying)::text, ('ajuste_negativo'::character varying)::text])))
);


ALTER TABLE nous.kardex OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 17881)
-- Name: precios; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.precios (
    id integer NOT NULL,
    sku_id integer NOT NULL,
    tienda_id integer NOT NULL,
    precio_venta integer NOT NULL,
    activo_desde date DEFAULT CURRENT_DATE NOT NULL,
    creado_por integer,
    creado_en timestamp with time zone DEFAULT now()
);


ALTER TABLE nous.precios OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 17880)
-- Name: precios_id_seq; Type: SEQUENCE; Schema: nous; Owner: postgres
--

CREATE SEQUENCE nous.precios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE nous.precios_id_seq OWNER TO postgres;

--
-- TOC entry 5396 (class 0 OID 0)
-- Dependencies: 239
-- Name: precios_id_seq; Type: SEQUENCE OWNED BY; Schema: nous; Owner: postgres
--

ALTER SEQUENCE nous.precios_id_seq OWNED BY nous.precios.id;


--
-- TOC entry 236 (class 1259 OID 17823)
-- Name: productos; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.productos (
    id integer NOT NULL,
    referencia_base character varying(20) NOT NULL,
    color_id integer NOT NULL,
    referencia_full character varying(30) NOT NULL,
    genero character varying(10) NOT NULL,
    familia character varying(20) NOT NULL,
    categoria_codigo character varying(5),
    sublinea_codigo character varying(5),
    nombre_koaj character varying(200),
    nombre_diseno character varying(100),
    temporada character varying(10),
    precio_lista_koaj integer NOT NULL,
    imagen_url text,
    activo boolean DEFAULT true,
    creado_en timestamp with time zone DEFAULT now(),
    actualizado_en timestamp with time zone DEFAULT now(),
    CONSTRAINT productos_genero_check CHECK (((genero)::text = ANY ((ARRAY['hombre'::character varying, 'mujer'::character varying, 'unisex'::character varying])::text[])))
);


ALTER TABLE nous.productos OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 17822)
-- Name: productos_id_seq; Type: SEQUENCE; Schema: nous; Owner: postgres
--

CREATE SEQUENCE nous.productos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE nous.productos_id_seq OWNER TO postgres;

--
-- TOC entry 5397 (class 0 OID 0)
-- Dependencies: 235
-- Name: productos_id_seq; Type: SEQUENCE OWNED BY; Schema: nous; Owner: postgres
--

ALTER SEQUENCE nous.productos_id_seq OWNED BY nous.productos.id;


--
-- TOC entry 244 (class 1259 OID 17998)
-- Name: recepcion_items; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.recepcion_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recepcion_id uuid NOT NULL,
    sku_id integer NOT NULL,
    precio_lista integer NOT NULL,
    precio_costo integer NOT NULL,
    ean_escaneado character varying(13),
    creado_en timestamp with time zone DEFAULT now(),
    verificado_por_empleado boolean DEFAULT false,
    fecha_verificacion timestamp with time zone
);


ALTER TABLE nous.recepcion_items OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 17970)
-- Name: recepciones; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.recepciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id integer NOT NULL,
    usuario_id integer NOT NULL,
    factura_koaj character varying(100),
    fecha_factura date,
    descuento_pct numeric(5,2) NOT NULL,
    proveedor character varying(100) DEFAULT 'KOAJ'::character varying,
    total_unidades integer DEFAULT 0,
    total_costo integer DEFAULT 0,
    estado character varying(100) DEFAULT 'abierta'::character varying,
    notas text,
    creado_en timestamp with time zone DEFAULT now(),
    total_unidades_recibidas integer DEFAULT 0,
    fecha_cierre timestamp with time zone,
    numero_entrega integer DEFAULT 1,
    CONSTRAINT recepciones_estado_check CHECK (((estado)::text = ANY ((ARRAY['abierta'::character varying, 'finalizada'::character varying, 'finalizada_con_discrepancia'::character varying, 'anulada'::character varying])::text[])))
);


ALTER TABLE nous.recepciones OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 17853)
-- Name: skus; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.skus (
    id integer NOT NULL,
    producto_id integer NOT NULL,
    talla_id integer NOT NULL,
    ean13 character varying(13),
    activo boolean DEFAULT true,
    creado_en timestamp with time zone DEFAULT now(),
    ean character varying(20)
);


ALTER TABLE nous.skus OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 17852)
-- Name: skus_id_seq; Type: SEQUENCE; Schema: nous; Owner: postgres
--

CREATE SEQUENCE nous.skus_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE nous.skus_id_seq OWNER TO postgres;

--
-- TOC entry 5398 (class 0 OID 0)
-- Dependencies: 237
-- Name: skus_id_seq; Type: SEQUENCE OWNED BY; Schema: nous; Owner: postgres
--

ALTER SEQUENCE nous.skus_id_seq OWNED BY nous.skus.id;


--
-- TOC entry 234 (class 1259 OID 17808)
-- Name: tallas; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.tallas (
    id integer NOT NULL,
    codigo character varying(10) NOT NULL,
    tipo character varying(20) NOT NULL,
    orden integer NOT NULL,
    creado_en timestamp with time zone DEFAULT now(),
    CONSTRAINT tallas_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['ropa'::character varying, 'jean'::character varying, 'calzado'::character varying, 'otro'::character varying])::text[])))
);


ALTER TABLE nous.tallas OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 17807)
-- Name: tallas_id_seq; Type: SEQUENCE; Schema: nous; Owner: postgres
--

CREATE SEQUENCE nous.tallas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE nous.tallas_id_seq OWNER TO postgres;

--
-- TOC entry 5399 (class 0 OID 0)
-- Dependencies: 233
-- Name: tallas_id_seq; Type: SEQUENCE OWNED BY; Schema: nous; Owner: postgres
--

ALTER SEQUENCE nous.tallas_id_seq OWNED BY nous.tallas.id;


--
-- TOC entry 226 (class 1259 OID 17746)
-- Name: tiendas; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.tiendas (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    ciudad character varying(100) NOT NULL,
    departamento character varying(100) NOT NULL,
    direccion text,
    telefono character varying(20),
    email character varying(200),
    matricula_merc character varying(30),
    activa boolean DEFAULT true,
    creado_en timestamp with time zone DEFAULT now()
);


ALTER TABLE nous.tiendas OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 17745)
-- Name: tiendas_id_seq; Type: SEQUENCE; Schema: nous; Owner: postgres
--

CREATE SEQUENCE nous.tiendas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE nous.tiendas_id_seq OWNER TO postgres;

--
-- TOC entry 5400 (class 0 OID 0)
-- Dependencies: 225
-- Name: tiendas_id_seq; Type: SEQUENCE OWNED BY; Schema: nous; Owner: postgres
--

ALTER SEQUENCE nous.tiendas_id_seq OWNED BY nous.tiendas.id;


--
-- TOC entry 252 (class 1259 OID 18245)
-- Name: traslado_items; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.traslado_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    traslado_id uuid NOT NULL,
    sku_id integer NOT NULL,
    cantidad integer NOT NULL,
    creado_en timestamp with time zone DEFAULT now(),
    CONSTRAINT traslado_items_cantidad_check CHECK ((cantidad > 0))
);


ALTER TABLE nous.traslado_items OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 18214)
-- Name: traslados; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.traslados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_origen integer NOT NULL,
    tienda_destino integer NOT NULL,
    usuario_id integer NOT NULL,
    estado character varying(20) DEFAULT 'pendiente'::character varying,
    notas text,
    creado_en timestamp with time zone DEFAULT now(),
    recibido_en timestamp with time zone,
    CONSTRAINT traslados_check CHECK ((tienda_origen <> tienda_destino)),
    CONSTRAINT traslados_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'en_transito'::character varying, 'recibido'::character varying, 'anulado'::character varying])::text[])))
);


ALTER TABLE nous.traslados OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 17761)
-- Name: usuarios; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.usuarios (
    id integer NOT NULL,
    tienda_id integer,
    nombre character varying(200) NOT NULL,
    email character varying(200) NOT NULL,
    password_hash text NOT NULL,
    rol character varying(20) NOT NULL,
    activo boolean DEFAULT true,
    creado_en timestamp with time zone DEFAULT now(),
    CONSTRAINT usuarios_rol_check CHECK (((rol)::text = ANY ((ARRAY['admin'::character varying, 'vendedor'::character varying, 'bodega'::character varying])::text[])))
);


ALTER TABLE nous.usuarios OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 17760)
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: nous; Owner: postgres
--

CREATE SEQUENCE nous.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE nous.usuarios_id_seq OWNER TO postgres;

--
-- TOC entry 5401 (class 0 OID 0)
-- Dependencies: 227
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: nous; Owner: postgres
--

ALTER SEQUENCE nous.usuarios_id_seq OWNED BY nous.usuarios.id;


--
-- TOC entry 257 (class 1259 OID 18337)
-- Name: v_kardex_detalle; Type: VIEW; Schema: nous; Owner: postgres
--

CREATE VIEW nous.v_kardex_detalle AS
 SELECT k.id,
    k.sku_id,
    k.tienda_id,
    k.tipo,
    k.cantidad,
    k.referencia_id,
    k.referencia_tipo,
    k.usuario_id,
    k.notas,
    k.creado_en,
    k.tipo_movimiento,
    k.referencia_documento,
    p.nombre_koaj,
    t.codigo AS talla,
    c.nombre AS color
   FROM ((((nous.kardex k
     JOIN nous.skus s ON ((s.id = k.sku_id)))
     JOIN nous.productos p ON ((p.id = s.producto_id)))
     JOIN nous.tallas t ON ((t.id = s.talla_id)))
     JOIN nous.colores c ON ((c.id = p.color_id)));


ALTER VIEW nous.v_kardex_detalle OWNER TO postgres;

--
-- TOC entry 255 (class 1259 OID 18311)
-- Name: v_stock; Type: VIEW; Schema: nous; Owner: postgres
--

CREATE VIEW nous.v_stock AS
 SELECT p.referencia_full,
    p.nombre_diseno,
    p.genero,
    p.familia,
    c.nombre AS color,
    t.codigo AS talla,
    ti.nombre AS tienda,
    COALESCE(i.cantidad, 0) AS stock,
    pr.precio_venta,
    p.precio_lista_koaj
   FROM ((((((nous.productos p
     JOIN nous.colores c ON ((c.id = p.color_id)))
     JOIN nous.skus s ON ((s.producto_id = p.id)))
     JOIN nous.tallas t ON ((t.id = s.talla_id)))
     CROSS JOIN nous.tiendas ti)
     LEFT JOIN nous.inventario i ON (((i.sku_id = s.id) AND (i.tienda_id = ti.id))))
     LEFT JOIN nous.precios pr ON (((pr.sku_id = s.id) AND (pr.tienda_id = ti.id))))
  WHERE ((p.activo = true) AND (s.activo = true) AND (ti.activa = true));


ALTER VIEW nous.v_stock OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 18100)
-- Name: venta_items; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.venta_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venta_id uuid NOT NULL,
    sku_id integer NOT NULL,
    cantidad integer DEFAULT 1 NOT NULL,
    precio_unitario integer NOT NULL,
    precio_costo integer NOT NULL,
    descuento integer DEFAULT 0,
    total_linea integer NOT NULL,
    creado_en timestamp with time zone DEFAULT now(),
    CONSTRAINT venta_items_cantidad_check CHECK ((cantidad > 0))
);


ALTER TABLE nous.venta_items OWNER TO postgres;

--
-- TOC entry 246 (class 1259 OID 18051)
-- Name: ventas; Type: TABLE; Schema: nous; Owner: postgres
--

CREATE TABLE nous.ventas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tienda_id integer NOT NULL,
    caja_id uuid NOT NULL,
    usuario_id integer NOT NULL,
    cliente_id integer,
    numero_factura character varying(50),
    cufe text,
    estado_dian character varying(20) DEFAULT 'pendiente'::character varying,
    subtotal integer NOT NULL,
    descuento_total integer DEFAULT 0,
    total integer NOT NULL,
    forma_pago character varying(20) NOT NULL,
    valor_efectivo integer DEFAULT 0,
    valor_tarjeta integer DEFAULT 0,
    valor_transferencia integer DEFAULT 0,
    cambio integer DEFAULT 0,
    estado character varying(20) DEFAULT 'completada'::character varying,
    notas text,
    creado_en timestamp with time zone DEFAULT now(),
    CONSTRAINT ventas_estado_check CHECK (((estado)::text = ANY ((ARRAY['completada'::character varying, 'anulada'::character varying])::text[]))),
    CONSTRAINT ventas_estado_dian_check CHECK (((estado_dian)::text = ANY ((ARRAY['pendiente'::character varying, 'validada'::character varying, 'rechazada'::character varying])::text[]))),
    CONSTRAINT ventas_forma_pago_check CHECK (((forma_pago)::text = ANY ((ARRAY['efectivo'::character varying, 'tarjeta'::character varying, 'transferencia'::character varying, 'mixto'::character varying])::text[])))
);


ALTER TABLE nous.ventas OWNER TO postgres;

--
-- TOC entry 256 (class 1259 OID 18316)
-- Name: v_ventas_hoy; Type: VIEW; Schema: nous; Owner: postgres
--

CREATE VIEW nous.v_ventas_hoy AS
 SELECT ti.nombre AS tienda,
    (v.creado_en)::date AS fecha,
    p.referencia_full,
    p.nombre_diseno,
    c.nombre AS color,
    ta.codigo AS talla,
    vi.cantidad,
    vi.precio_unitario,
    vi.precio_costo,
    (vi.precio_unitario - vi.precio_costo) AS margen_unit,
    ((vi.precio_unitario - vi.precio_costo) * vi.cantidad) AS margen_total,
    v.forma_pago,
    v.estado
   FROM ((((((nous.ventas v
     JOIN nous.tiendas ti ON ((ti.id = v.tienda_id)))
     JOIN nous.venta_items vi ON ((vi.venta_id = v.id)))
     JOIN nous.skus s ON ((s.id = vi.sku_id)))
     JOIN nous.productos p ON ((p.id = s.producto_id)))
     JOIN nous.colores c ON ((c.id = p.color_id)))
     JOIN nous.tallas ta ON ((ta.id = s.talla_id)))
  WHERE (((v.creado_en)::date = CURRENT_DATE) AND ((v.estado)::text = 'completada'::text));


ALTER VIEW nous.v_ventas_hoy OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 17717)
-- Name: empresas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.empresas (
    id integer NOT NULL,
    schema_name character varying(63) NOT NULL,
    nombre character varying(200) NOT NULL,
    nit character varying(20) NOT NULL,
    razon_social character varying(200) NOT NULL,
    email character varying(200) NOT NULL,
    telefono character varying(20),
    plan_id integer,
    activo boolean DEFAULT true,
    trial_hasta date,
    creado_en timestamp with time zone DEFAULT now()
);


ALTER TABLE public.empresas OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 17716)
-- Name: empresas_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.empresas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.empresas_id_seq OWNER TO postgres;

--
-- TOC entry 5402 (class 0 OID 0)
-- Dependencies: 223
-- Name: empresas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.empresas_id_seq OWNED BY public.empresas.id;


--
-- TOC entry 222 (class 1259 OID 17703)
-- Name: planes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.planes (
    id integer NOT NULL,
    nombre character varying(50) NOT NULL,
    max_tiendas integer NOT NULL,
    max_usuarios integer NOT NULL,
    precio_mes integer NOT NULL,
    activo boolean DEFAULT true,
    creado_en timestamp with time zone DEFAULT now()
);


ALTER TABLE public.planes OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 17702)
-- Name: planes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.planes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.planes_id_seq OWNER TO postgres;

--
-- TOC entry 5403 (class 0 OID 0)
-- Dependencies: 221
-- Name: planes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.planes_id_seq OWNED BY public.planes.id;


--
-- TOC entry 5022 (class 2604 OID 17788)
-- Name: clientes id; Type: DEFAULT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.clientes ALTER COLUMN id SET DEFAULT nextval('nous.clientes_id_seq'::regclass);


--
-- TOC entry 5024 (class 2604 OID 17798)
-- Name: colores id; Type: DEFAULT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.colores ALTER COLUMN id SET DEFAULT nextval('nous.colores_id_seq'::regclass);


--
-- TOC entry 5035 (class 2604 OID 17884)
-- Name: precios id; Type: DEFAULT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.precios ALTER COLUMN id SET DEFAULT nextval('nous.precios_id_seq'::regclass);


--
-- TOC entry 5028 (class 2604 OID 17826)
-- Name: productos id; Type: DEFAULT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.productos ALTER COLUMN id SET DEFAULT nextval('nous.productos_id_seq'::regclass);


--
-- TOC entry 5032 (class 2604 OID 17856)
-- Name: skus id; Type: DEFAULT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.skus ALTER COLUMN id SET DEFAULT nextval('nous.skus_id_seq'::regclass);


--
-- TOC entry 5026 (class 2604 OID 17811)
-- Name: tallas id; Type: DEFAULT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.tallas ALTER COLUMN id SET DEFAULT nextval('nous.tallas_id_seq'::regclass);


--
-- TOC entry 5016 (class 2604 OID 17749)
-- Name: tiendas id; Type: DEFAULT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.tiendas ALTER COLUMN id SET DEFAULT nextval('nous.tiendas_id_seq'::regclass);


--
-- TOC entry 5019 (class 2604 OID 17764)
-- Name: usuarios id; Type: DEFAULT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.usuarios ALTER COLUMN id SET DEFAULT nextval('nous.usuarios_id_seq'::regclass);


--
-- TOC entry 5013 (class 2604 OID 17720)
-- Name: empresas id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.empresas ALTER COLUMN id SET DEFAULT nextval('public.empresas_id_seq'::regclass);


--
-- TOC entry 5010 (class 2604 OID 17706)
-- Name: planes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.planes ALTER COLUMN id SET DEFAULT nextval('public.planes_id_seq'::regclass);


--
-- TOC entry 5193 (class 2606 OID 18300)
-- Name: ajuste_items ajuste_items_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.ajuste_items
    ADD CONSTRAINT ajuste_items_pkey PRIMARY KEY (id);


--
-- TOC entry 5191 (class 2606 OID 18277)
-- Name: ajustes_inventario ajustes_inventario_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.ajustes_inventario
    ADD CONSTRAINT ajustes_inventario_pkey PRIMARY KEY (id);


--
-- TOC entry 5170 (class 2606 OID 18038)
-- Name: cajas cajas_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.cajas
    ADD CONSTRAINT cajas_pkey PRIMARY KEY (id);


--
-- TOC entry 5172 (class 2606 OID 18040)
-- Name: cajas cajas_tienda_id_fecha_key; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.cajas
    ADD CONSTRAINT cajas_tienda_id_fecha_key UNIQUE (tienda_id, fecha);


--
-- TOC entry 5126 (class 2606 OID 17793)
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- TOC entry 5128 (class 2606 OID 17806)
-- Name: colores colores_codigo_key; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.colores
    ADD CONSTRAINT colores_codigo_key UNIQUE (codigo);


--
-- TOC entry 5130 (class 2606 OID 17804)
-- Name: colores colores_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.colores
    ADD CONSTRAINT colores_pkey PRIMARY KEY (id);


--
-- TOC entry 5183 (class 2606 OID 18175)
-- Name: devolucion_items_entrada devolucion_items_entrada_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.devolucion_items_entrada
    ADD CONSTRAINT devolucion_items_entrada_pkey PRIMARY KEY (id);


--
-- TOC entry 5185 (class 2606 OID 18203)
-- Name: devolucion_items_salida devolucion_items_salida_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.devolucion_items_salida
    ADD CONSTRAINT devolucion_items_salida_pkey PRIMARY KEY (id);


--
-- TOC entry 5181 (class 2606 OID 18142)
-- Name: devoluciones devoluciones_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.devoluciones
    ADD CONSTRAINT devoluciones_pkey PRIMARY KEY (id);


--
-- TOC entry 5164 (class 2606 OID 17955)
-- Name: inventario inventario_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.inventario
    ADD CONSTRAINT inventario_pkey PRIMARY KEY (sku_id, tienda_id);


--
-- TOC entry 5161 (class 2606 OID 17926)
-- Name: kardex kardex_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.kardex
    ADD CONSTRAINT kardex_pkey PRIMARY KEY (id);


--
-- TOC entry 5153 (class 2606 OID 17893)
-- Name: precios precios_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.precios
    ADD CONSTRAINT precios_pkey PRIMARY KEY (id);


--
-- TOC entry 5155 (class 2606 OID 17895)
-- Name: precios precios_sku_id_tienda_id_key; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.precios
    ADD CONSTRAINT precios_sku_id_tienda_id_key UNIQUE (sku_id, tienda_id);


--
-- TOC entry 5139 (class 2606 OID 17841)
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id);


--
-- TOC entry 5141 (class 2606 OID 17843)
-- Name: productos productos_referencia_full_key; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.productos
    ADD CONSTRAINT productos_referencia_full_key UNIQUE (referencia_full);


--
-- TOC entry 5168 (class 2606 OID 18009)
-- Name: recepcion_items recepcion_items_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.recepcion_items
    ADD CONSTRAINT recepcion_items_pkey PRIMARY KEY (id);


--
-- TOC entry 5166 (class 2606 OID 17987)
-- Name: recepciones recepciones_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.recepciones
    ADD CONSTRAINT recepciones_pkey PRIMARY KEY (id);


--
-- TOC entry 5145 (class 2606 OID 17865)
-- Name: skus skus_ean13_key; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.skus
    ADD CONSTRAINT skus_ean13_key UNIQUE (ean13);


--
-- TOC entry 5147 (class 2606 OID 18329)
-- Name: skus skus_ean_key; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.skus
    ADD CONSTRAINT skus_ean_key UNIQUE (ean);


--
-- TOC entry 5149 (class 2606 OID 17863)
-- Name: skus skus_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.skus
    ADD CONSTRAINT skus_pkey PRIMARY KEY (id);


--
-- TOC entry 5151 (class 2606 OID 17867)
-- Name: skus skus_producto_id_talla_id_key; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.skus
    ADD CONSTRAINT skus_producto_id_talla_id_key UNIQUE (producto_id, talla_id);


--
-- TOC entry 5132 (class 2606 OID 17821)
-- Name: tallas tallas_codigo_tipo_key; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.tallas
    ADD CONSTRAINT tallas_codigo_tipo_key UNIQUE (codigo, tipo);


--
-- TOC entry 5134 (class 2606 OID 17819)
-- Name: tallas tallas_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.tallas
    ADD CONSTRAINT tallas_pkey PRIMARY KEY (id);


--
-- TOC entry 5120 (class 2606 OID 17759)
-- Name: tiendas tiendas_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.tiendas
    ADD CONSTRAINT tiendas_pkey PRIMARY KEY (id);


--
-- TOC entry 5189 (class 2606 OID 18256)
-- Name: traslado_items traslado_items_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.traslado_items
    ADD CONSTRAINT traslado_items_pkey PRIMARY KEY (id);


--
-- TOC entry 5187 (class 2606 OID 18229)
-- Name: traslados traslados_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.traslados
    ADD CONSTRAINT traslados_pkey PRIMARY KEY (id);


--
-- TOC entry 5122 (class 2606 OID 17778)
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- TOC entry 5124 (class 2606 OID 17776)
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- TOC entry 5179 (class 2606 OID 18116)
-- Name: venta_items venta_items_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.venta_items
    ADD CONSTRAINT venta_items_pkey PRIMARY KEY (id);


--
-- TOC entry 5177 (class 2606 OID 18076)
-- Name: ventas ventas_pkey; Type: CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.ventas
    ADD CONSTRAINT ventas_pkey PRIMARY KEY (id);


--
-- TOC entry 5112 (class 2606 OID 17738)
-- Name: empresas empresas_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_email_key UNIQUE (email);


--
-- TOC entry 5114 (class 2606 OID 17736)
-- Name: empresas empresas_nit_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_nit_key UNIQUE (nit);


--
-- TOC entry 5116 (class 2606 OID 17732)
-- Name: empresas empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_pkey PRIMARY KEY (id);


--
-- TOC entry 5118 (class 2606 OID 17734)
-- Name: empresas empresas_schema_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_schema_name_key UNIQUE (schema_name);


--
-- TOC entry 5110 (class 2606 OID 17715)
-- Name: planes planes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.planes
    ADD CONSTRAINT planes_pkey PRIMARY KEY (id);


--
-- TOC entry 5162 (class 1259 OID 17966)
-- Name: idx_inventario_tienda; Type: INDEX; Schema: nous; Owner: postgres
--

CREATE INDEX idx_inventario_tienda ON nous.inventario USING btree (tienda_id);


--
-- TOC entry 5156 (class 1259 OID 17944)
-- Name: idx_kardex_fecha; Type: INDEX; Schema: nous; Owner: postgres
--

CREATE INDEX idx_kardex_fecha ON nous.kardex USING btree (creado_en);


--
-- TOC entry 5157 (class 1259 OID 17945)
-- Name: idx_kardex_referencia; Type: INDEX; Schema: nous; Owner: postgres
--

CREATE INDEX idx_kardex_referencia ON nous.kardex USING btree (referencia_id);


--
-- TOC entry 5158 (class 1259 OID 17942)
-- Name: idx_kardex_sku_tienda; Type: INDEX; Schema: nous; Owner: postgres
--

CREATE INDEX idx_kardex_sku_tienda ON nous.kardex USING btree (sku_id, tienda_id);


--
-- TOC entry 5159 (class 1259 OID 18332)
-- Name: idx_kardex_tipo; Type: INDEX; Schema: nous; Owner: postgres
--

CREATE INDEX idx_kardex_tipo ON nous.kardex USING btree (tipo);


--
-- TOC entry 5135 (class 1259 OID 17851)
-- Name: idx_productos_familia; Type: INDEX; Schema: nous; Owner: postgres
--

CREATE INDEX idx_productos_familia ON nous.productos USING btree (familia);


--
-- TOC entry 5136 (class 1259 OID 17850)
-- Name: idx_productos_genero; Type: INDEX; Schema: nous; Owner: postgres
--

CREATE INDEX idx_productos_genero ON nous.productos USING btree (genero);


--
-- TOC entry 5137 (class 1259 OID 17849)
-- Name: idx_productos_referencia_base; Type: INDEX; Schema: nous; Owner: postgres
--

CREATE INDEX idx_productos_referencia_base ON nous.productos USING btree (referencia_base);


--
-- TOC entry 5142 (class 1259 OID 17878)
-- Name: idx_skus_ean13; Type: INDEX; Schema: nous; Owner: postgres
--

CREATE INDEX idx_skus_ean13 ON nous.skus USING btree (ean13);


--
-- TOC entry 5143 (class 1259 OID 17879)
-- Name: idx_skus_producto; Type: INDEX; Schema: nous; Owner: postgres
--

CREATE INDEX idx_skus_producto ON nous.skus USING btree (producto_id);


--
-- TOC entry 5173 (class 1259 OID 18099)
-- Name: idx_ventas_estado; Type: INDEX; Schema: nous; Owner: postgres
--

CREATE INDEX idx_ventas_estado ON nous.ventas USING btree (estado);


--
-- TOC entry 5174 (class 1259 OID 18098)
-- Name: idx_ventas_fecha; Type: INDEX; Schema: nous; Owner: postgres
--

CREATE INDEX idx_ventas_fecha ON nous.ventas USING btree (creado_en);


--
-- TOC entry 5175 (class 1259 OID 18097)
-- Name: idx_ventas_tienda; Type: INDEX; Schema: nous; Owner: postgres
--

CREATE INDEX idx_ventas_tienda ON nous.ventas USING btree (tienda_id);


--
-- TOC entry 5237 (class 2620 OID 17969)
-- Name: kardex trg_kardex_actualizar_cache; Type: TRIGGER; Schema: nous; Owner: postgres
--

CREATE TRIGGER trg_kardex_actualizar_cache AFTER INSERT ON nous.kardex FOR EACH ROW EXECUTE FUNCTION nous.fn_actualizar_cache_inventario();


--
-- TOC entry 5235 (class 2606 OID 18301)
-- Name: ajuste_items ajuste_items_ajuste_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.ajuste_items
    ADD CONSTRAINT ajuste_items_ajuste_id_fkey FOREIGN KEY (ajuste_id) REFERENCES nous.ajustes_inventario(id);


--
-- TOC entry 5236 (class 2606 OID 18306)
-- Name: ajuste_items ajuste_items_sku_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.ajuste_items
    ADD CONSTRAINT ajuste_items_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES nous.skus(id);


--
-- TOC entry 5233 (class 2606 OID 18278)
-- Name: ajustes_inventario ajustes_inventario_tienda_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.ajustes_inventario
    ADD CONSTRAINT ajustes_inventario_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES nous.tiendas(id);


--
-- TOC entry 5234 (class 2606 OID 18283)
-- Name: ajustes_inventario ajustes_inventario_usuario_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.ajustes_inventario
    ADD CONSTRAINT ajustes_inventario_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES nous.usuarios(id);


--
-- TOC entry 5211 (class 2606 OID 18041)
-- Name: cajas cajas_tienda_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.cajas
    ADD CONSTRAINT cajas_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES nous.tiendas(id);


--
-- TOC entry 5212 (class 2606 OID 18046)
-- Name: cajas cajas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.cajas
    ADD CONSTRAINT cajas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES nous.usuarios(id);


--
-- TOC entry 5223 (class 2606 OID 18176)
-- Name: devolucion_items_entrada devolucion_items_entrada_devolucion_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.devolucion_items_entrada
    ADD CONSTRAINT devolucion_items_entrada_devolucion_id_fkey FOREIGN KEY (devolucion_id) REFERENCES nous.devoluciones(id);


--
-- TOC entry 5224 (class 2606 OID 18181)
-- Name: devolucion_items_entrada devolucion_items_entrada_sku_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.devolucion_items_entrada
    ADD CONSTRAINT devolucion_items_entrada_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES nous.skus(id);


--
-- TOC entry 5225 (class 2606 OID 18186)
-- Name: devolucion_items_entrada devolucion_items_entrada_venta_item_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.devolucion_items_entrada
    ADD CONSTRAINT devolucion_items_entrada_venta_item_id_fkey FOREIGN KEY (venta_item_id) REFERENCES nous.venta_items(id);


--
-- TOC entry 5226 (class 2606 OID 18204)
-- Name: devolucion_items_salida devolucion_items_salida_devolucion_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.devolucion_items_salida
    ADD CONSTRAINT devolucion_items_salida_devolucion_id_fkey FOREIGN KEY (devolucion_id) REFERENCES nous.devoluciones(id);


--
-- TOC entry 5227 (class 2606 OID 18209)
-- Name: devolucion_items_salida devolucion_items_salida_sku_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.devolucion_items_salida
    ADD CONSTRAINT devolucion_items_salida_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES nous.skus(id);


--
-- TOC entry 5219 (class 2606 OID 18158)
-- Name: devoluciones devoluciones_cliente_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.devoluciones
    ADD CONSTRAINT devoluciones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES nous.clientes(id);


--
-- TOC entry 5220 (class 2606 OID 18148)
-- Name: devoluciones devoluciones_tienda_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.devoluciones
    ADD CONSTRAINT devoluciones_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES nous.tiendas(id);


--
-- TOC entry 5221 (class 2606 OID 18153)
-- Name: devoluciones devoluciones_usuario_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.devoluciones
    ADD CONSTRAINT devoluciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES nous.usuarios(id);


--
-- TOC entry 5222 (class 2606 OID 18143)
-- Name: devoluciones devoluciones_venta_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.devoluciones
    ADD CONSTRAINT devoluciones_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES nous.ventas(id);


--
-- TOC entry 5205 (class 2606 OID 17956)
-- Name: inventario inventario_sku_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.inventario
    ADD CONSTRAINT inventario_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES nous.skus(id);


--
-- TOC entry 5206 (class 2606 OID 17961)
-- Name: inventario inventario_tienda_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.inventario
    ADD CONSTRAINT inventario_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES nous.tiendas(id);


--
-- TOC entry 5202 (class 2606 OID 17927)
-- Name: kardex kardex_sku_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.kardex
    ADD CONSTRAINT kardex_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES nous.skus(id);


--
-- TOC entry 5203 (class 2606 OID 17932)
-- Name: kardex kardex_tienda_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.kardex
    ADD CONSTRAINT kardex_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES nous.tiendas(id);


--
-- TOC entry 5204 (class 2606 OID 17937)
-- Name: kardex kardex_usuario_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.kardex
    ADD CONSTRAINT kardex_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES nous.usuarios(id);


--
-- TOC entry 5199 (class 2606 OID 17906)
-- Name: precios precios_creado_por_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.precios
    ADD CONSTRAINT precios_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES nous.usuarios(id);


--
-- TOC entry 5200 (class 2606 OID 17896)
-- Name: precios precios_sku_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.precios
    ADD CONSTRAINT precios_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES nous.skus(id);


--
-- TOC entry 5201 (class 2606 OID 17901)
-- Name: precios precios_tienda_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.precios
    ADD CONSTRAINT precios_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES nous.tiendas(id);


--
-- TOC entry 5196 (class 2606 OID 17844)
-- Name: productos productos_color_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.productos
    ADD CONSTRAINT productos_color_id_fkey FOREIGN KEY (color_id) REFERENCES nous.colores(id);


--
-- TOC entry 5209 (class 2606 OID 18010)
-- Name: recepcion_items recepcion_items_recepcion_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.recepcion_items
    ADD CONSTRAINT recepcion_items_recepcion_id_fkey FOREIGN KEY (recepcion_id) REFERENCES nous.recepciones(id);


--
-- TOC entry 5210 (class 2606 OID 18015)
-- Name: recepcion_items recepcion_items_sku_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.recepcion_items
    ADD CONSTRAINT recepcion_items_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES nous.skus(id);


--
-- TOC entry 5207 (class 2606 OID 17988)
-- Name: recepciones recepciones_tienda_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.recepciones
    ADD CONSTRAINT recepciones_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES nous.tiendas(id);


--
-- TOC entry 5208 (class 2606 OID 17993)
-- Name: recepciones recepciones_usuario_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.recepciones
    ADD CONSTRAINT recepciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES nous.usuarios(id);


--
-- TOC entry 5197 (class 2606 OID 17868)
-- Name: skus skus_producto_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.skus
    ADD CONSTRAINT skus_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES nous.productos(id);


--
-- TOC entry 5198 (class 2606 OID 17873)
-- Name: skus skus_talla_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.skus
    ADD CONSTRAINT skus_talla_id_fkey FOREIGN KEY (talla_id) REFERENCES nous.tallas(id);


--
-- TOC entry 5231 (class 2606 OID 18262)
-- Name: traslado_items traslado_items_sku_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.traslado_items
    ADD CONSTRAINT traslado_items_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES nous.skus(id);


--
-- TOC entry 5232 (class 2606 OID 18257)
-- Name: traslado_items traslado_items_traslado_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.traslado_items
    ADD CONSTRAINT traslado_items_traslado_id_fkey FOREIGN KEY (traslado_id) REFERENCES nous.traslados(id);


--
-- TOC entry 5228 (class 2606 OID 18235)
-- Name: traslados traslados_tienda_destino_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.traslados
    ADD CONSTRAINT traslados_tienda_destino_fkey FOREIGN KEY (tienda_destino) REFERENCES nous.tiendas(id);


--
-- TOC entry 5229 (class 2606 OID 18230)
-- Name: traslados traslados_tienda_origen_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.traslados
    ADD CONSTRAINT traslados_tienda_origen_fkey FOREIGN KEY (tienda_origen) REFERENCES nous.tiendas(id);


--
-- TOC entry 5230 (class 2606 OID 18240)
-- Name: traslados traslados_usuario_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.traslados
    ADD CONSTRAINT traslados_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES nous.usuarios(id);


--
-- TOC entry 5195 (class 2606 OID 17779)
-- Name: usuarios usuarios_tienda_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.usuarios
    ADD CONSTRAINT usuarios_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES nous.tiendas(id);


--
-- TOC entry 5217 (class 2606 OID 18122)
-- Name: venta_items venta_items_sku_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.venta_items
    ADD CONSTRAINT venta_items_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES nous.skus(id);


--
-- TOC entry 5218 (class 2606 OID 18117)
-- Name: venta_items venta_items_venta_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.venta_items
    ADD CONSTRAINT venta_items_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES nous.ventas(id);


--
-- TOC entry 5213 (class 2606 OID 18082)
-- Name: ventas ventas_caja_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.ventas
    ADD CONSTRAINT ventas_caja_id_fkey FOREIGN KEY (caja_id) REFERENCES nous.cajas(id);


--
-- TOC entry 5214 (class 2606 OID 18092)
-- Name: ventas ventas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.ventas
    ADD CONSTRAINT ventas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES nous.clientes(id);


--
-- TOC entry 5215 (class 2606 OID 18077)
-- Name: ventas ventas_tienda_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.ventas
    ADD CONSTRAINT ventas_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES nous.tiendas(id);


--
-- TOC entry 5216 (class 2606 OID 18087)
-- Name: ventas ventas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: nous; Owner: postgres
--

ALTER TABLE ONLY nous.ventas
    ADD CONSTRAINT ventas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES nous.usuarios(id);


--
-- TOC entry 5194 (class 2606 OID 17739)
-- Name: empresas empresas_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.planes(id);


-- Completed on 2026-03-26 07:51:05

--
-- PostgreSQL database dump complete
--

\unrestrict 8sLUMNznSjkf6i2aIpnMhbcFksMMn2tP7XOeTjEXvHI8KwmuzTcHa0aYSBHHzxX

