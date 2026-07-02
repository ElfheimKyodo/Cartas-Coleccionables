-- Migration: daily-wheel
-- Propósito: Ruleta diaria de recompensas aleatorias

-- Tabla para registrar las ruletas diarias
CREATE TABLE IF NOT EXISTS ruleta_diaria (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    recompensa INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_ruleta_diaria_user_id ON ruleta_diaria(user_id);


CREATE OR REPLACE FUNCTION tirar_ruleta_diaria(p_user_id UUID, p_fecha DATE)
RETURNS TABLE(recompensa INTEGER, nuevo_saldo INTEGER, mensaje TEXT, ya_tirado BOOLEAN) AS $$
DECLARE
    v_recompensa INTEGER;
    v_nuevo_saldo INTEGER;
BEGIN
    -- Verificar si ya tiró hoy
    IF EXISTS (SELECT 1 FROM ruleta_diaria WHERE user_id = p_user_id AND fecha = p_fecha) THEN
        mensaje := 'Ya tiraste la ruleta hoy';
        recompensa := 0;
        ya_tirado := TRUE;
        SELECT monedas INTO nuevo_saldo FROM profiles WHERE id = p_user_id;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Seleccionar recompensa aleatoria (100, 200, 300, 400, 500)
    v_recompensa := (FLOOR(RANDOM() * 5) * 100 + 100)::INTEGER;

    -- Actualizar monedas
    UPDATE profiles SET monedas = monedas + v_recompensa WHERE id = p_user_id;
    SELECT monedas INTO v_nuevo_saldo FROM profiles WHERE id = p_user_id;

    -- Registrar la tirada usando la fecha del cliente
    INSERT INTO ruleta_diaria (user_id, fecha, recompensa)
    VALUES (p_user_id, p_fecha, v_recompensa);

    -- Registrar transacción
    INSERT INTO transacciones_monedas (user_id, delta, motivo, saldo_resultante)
    VALUES (p_user_id, v_recompensa, 'ruleta_diaria', v_nuevo_saldo);

    mensaje := '¡Ganaste ' || v_recompensa || ' monedas!';
    recompensa := v_recompensa;
    nuevo_saldo := v_nuevo_saldo;
    ya_tirado := FALSE;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION tirar_ruleta_diaria(UUID, DATE) TO authenticated;
GRANT SELECT, INSERT ON ruleta_diaria TO authenticated;