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
            .select('monedas, email')
            .eq('id', userId)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    async getProfileByUsername(client, username) {
        const { data, error } = await client
            .from('profiles')
            .select('id, monedas, username, email')
            .eq('username', username)
            .maybeSingle();
        if (error) throw error;
        return data || null;
    },

    async getProfileByEmail(client, email) {
        const { data, error } = await client
            .from('profiles')
            .select('id, monedas, username, email')
            .eq('email', email)
            .maybeSingle();
        if (error) throw error;
        return data || null;
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
                    email,
                    monedas: 50  // Valor por defecto para nuevos usuarios
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