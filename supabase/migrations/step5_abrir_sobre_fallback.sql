CREATE OR REPLACE FUNCTION abrir_sobre(
    p_user_id UUID,
    p_sobre_tipo TEXT,
    p_cartas JSONB,
    p_precio INTEGER,
    p_regiones TEXT[]
) RETURNS resultado_abrir_sobre AS $$
DECLARE
    v_res resultado_abrir_sobre;
    v_actual INTEGER;
    v_bonus_transaccion INTEGER := 0;
BEGIN
    IF p_cartas IS NULL OR jsonb_array_length(p_cartas) IS NULL OR jsonb_array_length(p_cartas) <= 0 THEN
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

    UPDATE profiles SET monedas = monedas - p_precio, updated_at = NOW() WHERE id = p_user_id;
    SELECT monedas INTO v_actual FROM profiles WHERE id = p_user_id;

    INSERT INTO transacciones_monedas (user_id, delta, motivo, saldo_resultante)
    VALUES (p_user_id, -p_precio, 'abrir_sobre:' || p_sobre_tipo, v_actual);

    WITH parsed AS (
        SELECT jsonb_array_elements(p_cartas)->>'id' AS carta_id
    ), grouped AS (
        SELECT carta_id, COUNT(*)::INTEGER AS cantidad FROM parsed GROUP BY carta_id
    )
    UPDATE inventory i
    SET cantidad = i.cantidad + g.cantidad
    FROM grouped g
    WHERE i.user_id = p_user_id AND i.carta_id = g.carta_id;

    WITH parsed AS (
        SELECT jsonb_array_elements(p_cartas)->>'id' AS carta_id
    ), grouped AS (
        SELECT carta_id, COUNT(*)::INTEGER AS cantidad FROM parsed GROUP BY carta_id
    )
    INSERT INTO inventory (user_id, carta_id, cantidad)
    SELECT p_user_id, g.carta_id, g.cantidad
    FROM grouped g
    WHERE NOT EXISTS (
        SELECT 1 FROM inventory WHERE user_id = p_user_id AND carta_id = g.carta_id
    );

    v_res := (p_cartas, v_actual, TRUE, 'ok');
    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;