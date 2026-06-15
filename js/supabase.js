const SUPABASE_URL = 'https://ougrrlgsnoezkkdrphvz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91Z3JybGdzbm9lemtrZHJwaHZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNDUzNTksImV4cCI6MjA5NjkyMTM1OX0.eORrYj8DpTk1Pk10QVCGwq0kooGbrP30UTI0O12E5_4';

function getClient() {
    if (typeof supabase === 'undefined') {
        throw new Error('SDK de Supabase no cargado');
    }
    return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const db = {
    async getProfile(client, userId) {
        const { data, error } = await client
            .from('profiles')
            .select('monedas, email, updated_at')
            .eq('id', userId)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
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

    async claimDailyCoins(client, userId) {
        const { data, error } = await client
            .rpc('reclamar_monedas_diarias', { p_user_id: userId });
        console.log('[RPC] reclamar_monedas_diarias raw:', data, 'error:', error);
        if (error) throw error;
        const row = (data || [])[0];
        return row ? { ...row } : null;
    },

    async openPack(client, userId, packType, price, regions) {
        const { data, error } = await client
            .rpc('abrir_sobre', {
                p_user_id: userId,
                p_sobre_tipo: packType,
                p_precio: price,
                p_regiones: regions
            });
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
    }
};

const auth = {
    async signUp(client, email, password, username) {
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
                    username: username || email.split('@')[0],
                    email
                }, { onConflict: 'id' });
            if (profileError) console.error('[AUTH] profile upsert error:', profileError);
        }
        return { user: data.user ?? null, session: data.session ?? null };
    },

    async signIn(client, email, password) {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    async signInWithGoogle(client) {
        const { data, error } = await client.auth.signInWithOAuth({
            provider: 'discord',
            options: { redirectTo: window.location.origin }
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
