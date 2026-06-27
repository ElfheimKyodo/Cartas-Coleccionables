const SUPABASE_URL = 'https://ougrrlgsnoezkkdrphvz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91Z3JybGdzbm9lemtrZHJwaHZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNDUzNTksImV4cCI6MjA5NjkyMTM1OX0.eORrYj8DpTk1Pk10QVCGwq0kooGbrP30UTI0O12E5_4';

function getClient() {
    if (typeof supabase === 'undefined') {
        throw new Error('SDK de Supabase no cargado');
    }
    return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
async function applySession(client, payload) {
    if (!payload?.access_token || !payload?.refresh_token) {
        return { user: payload?.user ?? null, session: payload?.session ?? null };
    }
    const { data, error } = await client.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token
    });
    if (error) throw error;
    return {
        user: data.user ?? payload.user ?? null,
        session: data.session ?? {
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
            token_type: payload.token_type || 'bearer',
            expires_in: payload.expires_in || 3600,
            expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + (payload.expires_in || 3600),
            user: data.user ?? payload.user ?? null
        }
    };
}

async function signInWithCaptchaToken(client, email, password, captchaToken) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'X-Captcha-Token': captchaToken
        },
        body: JSON.stringify({
            email,
            password,
            gotrue_meta_security: {
                captcha_token: captchaToken
            }
        })
    });
    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload?.error_description || payload?.msg || 'Error de autenticación');
    }
    return applySession(client, payload);
}

async function signUpWithCaptchaToken(client, email, password, username, captchaToken) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'X-Captcha-Token': captchaToken
        },
        body: JSON.stringify({
            email,
            password,
            data: { username: username || email.split('@')[0] },
            gotrue_meta_security: {
                captcha_token: captchaToken
            }
        })
    });
    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload?.error_description || payload?.msg || 'Error de autenticación');
    }
    const result = await applySession(client, payload);
    if (result.user) {
        const { error: profileError } = await client
            .from('profiles')
            .upsert({
                id: result.user.id,
                username: username || email.split('@')[0]
            }, { onConflict: 'id' });
        if (profileError) {
            console.error('[AUTH] profile upsert error after signup:', profileError);
        }
    }
    return result;
}


const db = {
    async getProfile(client, userId) {
        const { data, error } = await client
            .from('profiles')
            .select('monedas, updated_at, pity_contador')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return data;
    },

    async getProfileByUsername(client, username) {
        throw new Error('Búsqueda por username deshabilitada por política de seguridad');
    },

    async getInventory(client, userId) {
        const { data, error } = await client
            .from('inventory')
            .select('carta_id, cantidad')
            .eq('user_id', userId);
        if (error) throw error;
        return data || [];
    },

    async upsertInventory(client, items) {
        if (!items || !items.length) return;
        const { error } = await client
            .from('inventory')
            .upsert(items, { onConflict: 'user_id,carta_id' });
        if (error) throw error;
    },

    async updateCoins(client, userId, delta) {
        const { data: profile, error: readError } = await client
            .from('profiles')
            .select('monedas')
            .eq('id', userId)
            .single();
        if (readError) throw readError;

        const actual = Number(profile?.monedas ?? 0);
        const nuevo = actual + Number(delta || 0);
        if (!Number.isFinite(nuevo) || nuevo < 0) {
            throw new Error('Saldo insuficiente');
        }

        const { data, error } = await client
            .from('profiles')
            .update({ monedas: nuevo })
            .eq('id', userId)
            .select('monedas, updated_at')
            .single();
        if (error) throw error;
        return data;
    },

    async updatePity(client, userId, contador) {
        const { data, error } = await client
            .from('profiles')
            .update({ pity_contador: contador })
            .eq('id', userId)
            .select('pity_contador')
            .single();
        if (error) {
            console.error('[PITY] Error actualizando pity en Supabase:', error);
            throw error;
        }
        return data;
    },

    async addInventory(client, userId, items) {
        if (!items || !items.length) return [];

        const agrupados = {};
        for (const item of items) {
            const cartaId = item?.id || item?.carta_id;
            const cantidad = Number(item?.cantidad ?? item?.count ?? 1);
            if (!cartaId || !Number.isFinite(cantidad) || cantidad <= 0) continue;
            agrupados[cartaId] = (agrupados[cartaId] || 0) + cantidad;
        }

        const agregados = [];
        for (const [cartaId, cantidad] of Object.entries(agrupados)) {
            const { data: actual, error: readError } = await client
                .from('inventory')
                .select('cantidad')
                .eq('user_id', userId)
                .eq('carta_id', cartaId)
                .maybeSingle();
            if (readError) throw readError;

            const siguiente = Number(actual?.cantidad ?? 0) + cantidad;
            let data;
            let error;
            if (actual) {
                ({ data, error } = await client
                    .from('inventory')
                    .update({ cantidad: siguiente })
                    .eq('user_id', userId)
                    .eq('carta_id', cartaId)
                    .select('carta_id, cantidad')
                    .single());
            } else {
                ({ data, error } = await client
                    .from('inventory')
                    .insert({ user_id: userId, carta_id: cartaId, cantidad: siguiente })
                    .select('carta_id, cantidad')
                    .single());
            }
            if (error) throw error;
            agregados.push(data);
        }
        return agregados;
    },

    async removeInventory(client, userId, cardId, quantity) {
        const { data: actual, error: readError } = await client
            .from('inventory')
            .select('cantidad')
            .eq('user_id', userId)
            .eq('carta_id', cardId)
            .maybeSingle();
        if (readError) throw readError;
        if (!actual || actual.cantidad < quantity) {
            throw new Error('Inventario insuficiente');
        }

        const siguiente = actual.cantidad - quantity;
        let error;
        if (siguiente <= 0) {
            ({ error } = await client
                .from('inventory')
                .delete()
                .eq('user_id', userId)
                .eq('carta_id', cardId));
        } else {
            ({ error } = await client
                .from('inventory')
                .update({ cantidad: siguiente })
                .eq('user_id', userId)
                .eq('carta_id', cardId));
        }
        if (error) throw error;
        return { carta_id: cardId, cantidad: siguiente };
    },

    async sellCardTable(client, userId, cardId, quantity, unitPrice) {
        const inventario = await this.removeInventory(client, userId, cardId, quantity);
        try {
            const profile = await this.updateCoins(client, userId, unitPrice * quantity);
            return {
                nuevo_saldo: profile.monedas,
                vendidas: quantity,
                inventario
            };
        } catch (err) {
            await this.addInventory(client, userId, [{ id: cardId, cantidad: quantity }]);
            throw err;
        }
    },

    async claimDailyCoinsTable(client, userId, lastClaimServerMs = 0) {
        const cooldownMs = 60 * 60 * 1000;
        const { data: profile, error: readError } = await client
            .from('profiles')
            .select('monedas, updated_at')
            .eq('id', userId)
            .single();
        if (readError) throw readError;

        const now = Date.now();
        const serverNow = lastClaimServerMs > 0 ? lastClaimServerMs : now;
        const remaining = lastClaimServerMs > 0 ? cooldownMs - (now - serverNow) : 0;

        if (remaining > 0) {
            return {
                obtenido: 0,
                nuevo_saldo: Number(profile?.monedas ?? 0),
                proxima_en: Math.max(0, Math.ceil(remaining / 1000)),
                ultima_actualizacion: profile?.updated_at || null
            };
        }

        const nuevo = Number(profile?.monedas ?? 0) + 100;
        const { data, error } = await client
            .from('profiles')
            .update({
                monedas: nuevo,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId)
            .select('monedas, updated_at')
            .single();
        if (error) throw error;

        return {
            obtenido: 100,
            nuevo_saldo: data.monedas,
            proxima_en: 0,
            ultima_actualizacion: data.updated_at
        };
    },

    async claimDailyCoins(client, userId) {
        const { data, error } = await client
            .rpc('reclamar_monedas_diarias', { p_user_id: userId });
        console.log('[RPC] reclamar_monedas_diarias raw:', data, 'error:', error);
        if (error) throw error;
        const row = (data || [])[0];
        return row ? { ...row } : null;
    },

    async openPack(client, userId, packType, price, cards = []) {
        const cartasJsonb = cards.map(c => ({ id: c.id, cantidad: 1 }));
        const { data, error } = await client
            .rpc('abrir_sobre', {
                p_user_id: userId,
                p_sobre_tipo: packType,
                p_cartas: cartasJsonb,
                p_precio: price,
                p_regiones: []
            });
        console.log('[RPC] abrir_sobre data:', data, 'error:', error);
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : (data || null);
        if (!row) {
            throw new Error('Respuesta vacía del servidor');
        }
        return { ...row };
    },

    async sellCard(client, userId, cardId, quantity, unitPrice) {
        const { data, error } = await client
            .rpc('vender_carta', {
                p_user_id: userId,
                p_carta_id: cardId,
                p_cantidad: quantity,
                p_valor_unitario: unitPrice
            });
        if (error) throw error;
        const row = (data || [])[0];
        return row ? { ...row } : null;
    },

    async getShopConfig(client) {
        const { data, error } = await client
            .from('shop_config')
            .select('id, key, value, updated_at')
            .order('key', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async resetInventory(client, userId) {
        const { error: invError } = await client
            .from('inventory')
            .delete()
            .eq('user_id', userId);
        if (invError) throw invError;

        const { data: profile, error: profileError } = await client
            .from('profiles')
            .update({ monedas: 0, updated_at: new Date().toISOString() })
            .eq('id', userId)
            .select('monedas')
            .single();
        if (profileError && profileError.code !== 'PGRST116') throw profileError;
        return { ok: true, nuevo_saldo: 0 };
    }
};

const auth = {
    async signUp(client, email, password, username, captchaToken = "") {
        if (captchaToken) {
            return signUpWithCaptchaToken(client, email, password, username, captchaToken);
        }
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) {
            console.error('[AUTH] signUp error:', error);
            throw error;
        }
        console.log('[AUTH] signUp success:', data);
        if (data.user) {
            const { data: profileData, error: profileError } = await client
                .from('profiles')
                .upsert({
                    id: data.user.id,
                    username: username || email.split('@')[0]
                }, { onConflict: 'id' });
            if (profileError) console.error('[AUTH] profile upsert error:', profileError);
        }
        return { user: data.user ?? null, session: data.session ?? null };
    },

    async signIn(client, email, password, captchaToken = "") {
        if (captchaToken) {
            return signInWithCaptchaToken(client, email, password, captchaToken);
        }
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    async signInWithGoogle(client) {
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        const { data, error } = await client.auth.signInWithOAuth({
            provider: 'discord',
            options: { redirectTo }
        });
        if (error) throw error;
        return data;
    },

    async updatePassword(client, newPassword) {
        const { data, error } = await client.auth.updateUser({ password: newPassword });
        if (error) throw error;
        return data;
    },

    async signOut(client) {
        await client.auth.signOut();
    },

    async getSession(client) {
        const { data } = await client.auth.getSession();
        return data.session;
    }
};
