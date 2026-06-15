-- Migration: secure-economy-v1
-- Fecha: 2026-06-15
-- Propósito: Proteger la economia del juego contra manipulacion client-side.

-- ============================================================================
-- 1. Tablas y restricciones
-- ============================================================================

CREATE TABLE IF NOT EXISTS transacciones_monedas (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id),
    delta INTEGER NOT NULL,
    motivo TEXT NOT NULL,
    saldo_resultante INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles
  ADD CONSTRAINT chk_monedas_no_negativas
    CHECK (monedas >= 0);

ALTER TABLE inventory
  ADD CONSTRAINT chk_cantidad_no_negativa
    CHECK (cantidad >= 0);

CREATE INDEX IF NOT EXISTS idx_transacciones_monedas_user_id ON transacciones_monedas(user_id);


-- ============================================================================
-- 2. Limpiar objetos previos (para refrescar cache de PostgREST)
-- ============================================================================

DROP FUNCTION IF EXISTS modificar_monedas(UUID, INTEGER, TEXT) CASCADE;
DROP FUNCTION IF EXISTS reclamar_monedas_diarias(UUID) CASCADE;
DROP TYPE IF EXISTS resultado_abrir_sobre CASCADE;

CREATE TYPE resultado_abrir_sobre AS (
    cartas JSONB,
    nuevo_saldo INTEGER,
    ok BOOLEAN,
    mensaje TEXT
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'abrir_sobre') THEN
    EXECUTE 'DROP FUNCTION abrir_sobre(UUID, TEXT, JSONB) CASCADE';
    EXECUTE 'DROP FUNCTION abrir_sobre(UUID, TEXT, JSONB, INTEGER, TEXT[]) CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'vender_carta') THEN
    EXECUTE 'DROP FUNCTION vender_carta(UUID, TEXT, INTEGER, INTEGER) CASCADE';
  END IF;
END $$;


-- ============================================================================
-- 3. Funciones RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION modificar_monedas(
    p_user_id UUID,
    p_delta INTEGER,
    p_motivo TEXT
) RETURNS TABLE(nuevo_saldo INTEGER) AS $$
DECLARE
    v_actual INTEGER;
BEGIN
    IF p_delta = 0 THEN
        SELECT monedas INTO v_actual FROM profiles WHERE id = p_user_id;
        nuevo_saldo := v_actual;
        RETURN NEXT;
        RETURN;
    END IF;

    IF p_delta < 0 THEN
        SELECT monedas INTO v_actual FROM profiles WHERE id = p_user_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Perfil no encontrado';
        END IF;
        IF v_actual + p_delta < 0 THEN
            RAISE EXCEPTION 'Saldo insuficiente';
        END IF;
        UPDATE profiles SET monedas = v_actual + p_delta, updated_at = NOW() WHERE id = p_user_id;
        nuevo_saldo := v_actual + p_delta;
    ELSE
        UPDATE profiles SET monedas = monedas + p_delta, updated_at = NOW() WHERE id = p_user_id;
        SELECT monedas INTO nuevo_saldo FROM profiles WHERE id = p_user_id;
    END IF;

    INSERT INTO transacciones_monedas (user_id, delta, motivo, saldo_resultante)
    VALUES (p_user_id, p_delta, p_motivo, nuevo_saldo);

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION reclamar_monedas_diarias(p_user_id UUID)
RETURNS TABLE(obtenido INTEGER, nuevo_saldo INTEGER, proxima_en INTEGER, updated_at TIMESTAMPTZ) AS $$
DECLARE
    v_ultima TIMESTAMPTZ;
    v_cooldown INTERVAL := INTERVAL '1 hour';
    v_bonus INTEGER := 100;
    v_nuevo_saldo INTEGER;
BEGIN
    SELECT monedas, updated_at INTO v_nuevo_saldo, v_ultima FROM profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Perfil no encontrado';
    END IF;

    IF v_ultima IS NOT NULL AND NOW() - v_ultima < v_cooldown THEN
        proxima_en := EXTRACT(EPOCH FROM (v_ultima + v_cooldown - NOW()))::INTEGER;
        IF proxima_en < 0 THEN proxima_en := 0; END IF;
        obtenido := 0;
        nuevo_saldo := v_nuevo_saldo;
        updated_at := v_ultima;
        RETURN NEXT;
        RETURN;
    END IF;

    UPDATE profiles SET monedas = monedas + v_bonus, updated_at = NOW() WHERE id = p_user_id;
    SELECT monedas, updated_at INTO v_nuevo_saldo, v_ultima FROM profiles WHERE id = p_user_id;

    INSERT INTO transacciones_monedas (user_id, delta, motivo, saldo_resultante)
    VALUES (p_user_id, v_bonus, 'recompensa_diaria', v_nuevo_saldo);

    obtenido := v_bonus;
    nuevo_saldo := v_nuevo_saldo;
    proxima_en := 0;
    updated_at := v_ultima;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION abrir_sobre(
    p_user_id UUID,
    p_sobre_tipo TEXT,
    p_cartas TEXT,
    p_precio INTEGER,
    p_regiones TEXT[]
) RETURNS resultado_abrir_sobre AS $$
DECLARE
    v_res resultado_abrir_sobre;
    v_actual INTEGER;
    v_cartas_jsonb JSONB := p_cartas::JSONB;
BEGIN
    IF v_cartas_jsonb IS NULL OR jsonb_array_length(v_cartas_jsonb) IS NULL OR jsonb_array_length(v_cartas_jsonb) <= 0 THEN
        v_res := (NULL::JSONB, 0::INTEGER, FALSE, 'Cartas invalidas');
        RETURN v_res;
    END IF;

    SELECT monedas INTO v_actual FROM profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        v_res := (NULL::JSONB, 0::INTEGER, FALSE, 'Perfil no encontrado');
        RETURN v_res;
    END IF;

    IF p_precio IS NULL OR p_precio < 0 THEN
        v_res := (NULL::JSONB, v_actual, FALSE, 'Sobre no disponible');
        RETURN v_res;
    END IF;

    IF v_actual < p_precio THEN
        v_res := (NULL::JSONB, v_actual, FALSE, 'Saldo insuficiente');
        RETURN v_res;
    END IF;

    UPDATE profiles SET monedas = monedas - p_precio WHERE id = p_user_id;
    SELECT monedas INTO v_actual FROM profiles WHERE id = p_user_id;

    INSERT INTO transacciones_monedas (user_id, delta, motivo, saldo_resultante)
    VALUES (p_user_id, -p_precio, 'abrir_sobre:' || p_sobre_tipo, v_actual);

    WITH parsed AS (
        SELECT jsonb_array_elements(v_cartas_jsonb)->>'id' AS carta_id
    ), grouped AS (
        SELECT carta_id, COUNT(*)::INTEGER AS cantidad FROM parsed GROUP BY carta_id
    )
    UPDATE inventory i
    SET cantidad = i.cantidad + g.cantidad
    FROM grouped g
    WHERE i.user_id = p_user_id AND i.carta_id = g.carta_id;

    WITH parsed AS (
        SELECT jsonb_array_elements(v_cartas_jsonb)->>'id' AS carta_id
    ), grouped AS (
        SELECT carta_id, COUNT(*)::INTEGER AS cantidad FROM parsed GROUP BY carta_id
    )
    INSERT INTO inventory (user_id, carta_id, cantidad)
    SELECT p_user_id, g.carta_id, g.cantidad
    FROM grouped g
    WHERE NOT EXISTS (
        SELECT 1 FROM inventory WHERE user_id = p_user_id AND carta_id = g.carta_id
    );

    v_res := (v_cartas_jsonb, v_actual, TRUE, 'ok');
    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION vender_carta(
    p_user_id UUID,
    p_carta_id TEXT,
    p_cantidad INTEGER,
    p_valor_unitario INTEGER
) RETURNS TABLE(nuevo_saldo INTEGER, vendidas INTEGER) AS $$
DECLARE
    v_actual INTEGER;
    v_cantidad INTEGER;
BEGIN
    IF p_cantidad <= 0 THEN
        RAISE EXCEPTION 'Cantidad invalida';
    END IF;

    SELECT cantidad INTO v_cantidad FROM inventory WHERE user_id = p_user_id AND carta_id = p_carta_id FOR UPDATE;
    IF NOT FOUND OR v_cantidad IS NULL OR v_cantidad < p_cantidad THEN
        RAISE EXCEPTION 'Inventario insuficiente';
    END IF;

    IF v_cantidad <= p_cantidad THEN
        DELETE FROM inventory WHERE user_id = p_user_id AND carta_id = p_carta_id;
    ELSE
        UPDATE inventory SET cantidad = cantidad - p_cantidad WHERE user_id = p_user_id AND carta_id = p_carta_id;
    END IF;

    PERFORM modificar_monedas(p_user_id, p_valor_unitario * p_cantidad, 'venta:' || p_carta_id);
    SELECT monedas INTO nuevo_saldo FROM profiles WHERE id = p_user_id;
    vendidas := p_cantidad;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 4. Restricciones e integridad (despues de crear tipos para evitar conflictos)
-- ============================================================================

ALTER TABLE profiles
  ADD CONSTRAINT chk_monedas_no_negativas
    CHECK (monedas >= 0);

ALTER TABLE inventory
  ADD CONSTRAINT chk_cantidad_no_negativa
    CHECK (cantidad >= 0);


-- ============================================================================
-- 5. Politicas RLS
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read_own" ON profiles;
DROP POLICY IF EXISTS "profiles_write_own" ON profiles;
DROP POLICY IF EXISTS "inventory_read_own" ON inventory;
DROP POLICY IF EXISTS "inventory_insert_own" ON inventory;
DROP POLICY IF EXISTS "inventory_update_own" ON inventory;
DROP POLICY IF EXISTS "inventory_delete_own" ON inventory;
DROP POLICY IF EXISTS "profiles_search_by_username" ON profiles;

CREATE POLICY "profiles_read_own"
    ON profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "profiles_write_own"
    ON profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND monedas >= 0);

CREATE POLICY "inventory_read_own"
    ON inventory FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "inventory_insert_own"
    ON inventory FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "inventory_update_own"
    ON inventory FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "inventory_delete_own"
    ON inventory FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "profiles_search_by_username"
    ON profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);


-- ============================================================================
-- 6. Permisos granulares
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION modificar_monedas(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION reclamar_monedas_diarias(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION abrir_sobre(UUID, TEXT, JSONB, INTEGER, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION vender_carta(UUID, TEXT, INTEGER, INTEGER) TO authenticated;

GRANT SELECT ON profiles TO authenticated;
GRANT SELECT ON inventory TO authenticated;
GRANT UPDATE (monedas, updated_at) ON profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON inventory TO authenticated;
