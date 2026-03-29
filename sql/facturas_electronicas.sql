-- Tabla para rastrear el estado de cada factura electrónica emitida vía Factus
-- Ejecutar dentro del schema del tenant (ej: SET search_path = nous, public;)

CREATE TABLE IF NOT EXISTS facturas_electronicas (
  id                SERIAL PRIMARY KEY,
  venta_id          UUID           NOT NULL,  -- referencia a ventas(id)
  estado            VARCHAR(20)    NOT NULL DEFAULT 'pendiente',  -- pendiente | emitida | error
  numero_factura    VARCHAR(50),              -- número asignado por Factus/DIAN (ej: SETP-984000001)
  cufe              VARCHAR(200),             -- CUFE generado por la DIAN
  payload_enviado   JSONB,                    -- cuerpo enviado a Factus (para reintento / auditoría)
  respuesta_factus  JSONB,                    -- respuesta completa de Factus
  error_mensaje     TEXT,                     -- mensaje si estado = 'error'
  intentos          INTEGER        NOT NULL DEFAULT 0,
  creado_en         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fe_venta_id ON facturas_electronicas (venta_id);
CREATE INDEX IF NOT EXISTS idx_fe_estado   ON facturas_electronicas (estado);
