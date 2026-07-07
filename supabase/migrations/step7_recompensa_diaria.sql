ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ultima_recompensa_diaria TIMESTAMPTZ;

UPDATE profiles
SET ultima_recompensa_diaria = updated_at
WHERE ultima_recompensa_diaria IS NULL;

CREATE OR REPLACE FUNCTION reclamar_monedas_diarias(p_user_id UUID)
RETURNS TABLE(obtenido INTEGER, nuevo_saldo INTEGER, proxima_en INTEGER, ultima_actualizacion TIMESTAMPTZ) AS $$
DECLARE
    v_ultima TIMESTAMPTZ;
    v_cooldown INTERVAL := INTERVAL '1 hour';
    v_bonus INTEGER := 100;
    v_nuevo_saldo INTEGER;
BEGIN
    SELECT p.monedas, p.ultima_recompensa_diaria INTO v_nuevo_saldo, v_ultima FROM profiles p WHERE p.id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Perfil no encontrado';
    END IF;

    IF v_ultima IS NOT NULL AND NOW() - v_ultima < v_cooldown THEN
        proxima_en := EXTRACT(EPOCH FROM (v_ultima + v_cooldown - NOW()))::INTEGER;
        IF proxima_en < 0 THEN proxima_en := 0; END IF;
        obtenido := 0;
        nuevo_saldo := v_nuevo_saldo;
        ultima_actualizacion := v_ultima;
        RETURN NEXT;
        RETURN;
    END IF;

    UPDATE profiles p SET monedas = p.monedas + v_bonus, ultima_recompensa_diaria = NOW() WHERE p.id = p_user_id;
    SELECT p.monedas, p.ultima_recompensa_diaria INTO v_nuevo_saldo, v_ultima FROM profiles p WHERE p.id = p_user_id;

    INSERT INTO transacciones_monedas (user_id, delta, motivo, saldo_resultante)
    VALUES (p_user_id, v_bonus, 'recompensa_diaria', v_nuevo_saldo);

    obtenido := v_bonus;
    nuevo_saldo := v_nuevo_saldo;
    proxima_en := 0;
    ultima_actualizacion := v_ultima;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
