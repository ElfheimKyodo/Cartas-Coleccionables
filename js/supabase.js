const SUPABASE_URL = 'https://ougrrlgsnoezkkdrphvz.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'sb_publishable_b5JWbhfO0qrwglB7WzUrkA_1YB6uPIV';

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
            .select('monedas')
            .eq('id', userId)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
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
        if (!items.length) return;
        const { error } = await client
            .from('inventory')
            .upsert(items, { onConflict: 'user_id,carta_id' });
        if (error) throw error;
    },

    async upsertProfile(client, profile) {
        const { error } = await client
            .from('profiles')
            .upsert(profile);
        if (error) throw error;
    },

    async addCoins(client, userId, amount) {
        const { error } = await client.rpc('add_coins', {
            p_user_id: userId,
            p_amount: amount
        });
        if (error) throw error;
    },

    async deductCoins(client, userId, amount) {
        const { error } = await client.rpc('deduct_coins', {
            p_user_id: userId,
            p_amount: amount
        });
        if (error) throw error;
    }
};

const auth = {
    async signUp(client, email, password) {
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) throw error;
        return data;
    },

    async signIn(client, email, password) {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    async signOut(client) {
        await client.auth.signOut();
    },

    async getSession(client) {
        const { data } = await client.auth.getSession();
        return data.session;
    },

    onAuthStateChanged(client, callback) {
        return client.auth.onAuthStateChanged((_event, session) => {
            callback(session);
        });
    }
};