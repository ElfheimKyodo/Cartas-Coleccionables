let cartasData = [];
let coleccion = {};
let monedas = 0;
let usuarioActual = null;
let supabaseClient = null;
let supabaseEnabled = false;
let panelVenta = null;

const REGIONES = ['umbraeth', 'skjoldheim', 'astra', 'solareth', 'elarion'];
const REGION_NOMBRES = {
    umbraeth: 'Umbraeth',
    skjoldheim: 'Skjoldheim',
    astra: 'Astra',
    solareth: 'Solareth',
    elarion: 'Elarion'
};

function formatearNombre(nombreArchivo) {
    return nombreArchivo.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

async function cargarCartas() {
    try {
        const response = await fetch('cartas/manifest.json');
        if (response.ok) {
            const manifest = await response.json();
            cartasData = manifest.cartas || [];
            console.log(`Cargadas ${cartasData.length} cartas desde manifest.json`);
        } else {
            console.warn('No se encontró manifest.json');
            cartasData = cargarCartasCompatibilidad();
        }
    } catch (error) {
        console.warn('Error cargando manifest.json:', error);
        cartasData = cargarCartasCompatibilidad();
    }
}

function cargarCartasCompatibilidad() {
    const cartas = [];
    const extensiones = ['webp', 'png', 'jpg', 'jpeg', 'gif'];
    const regionValores = { umbraeth: 5, skjoldheim: 5, astra: 5, solareth: 5, elarion: 5 };
    for (const region of REGIONES) {
        for (const ext of extensiones) {
            for (let i = 0; i < 50; i++) {
                const nombreArchivo = `carta_${i}.${ext}`;
                cartas.push({
                    id: `${region}/carta_${i}`,
                    nombre: `Carta ${REGION_NOMBRES[region]} ${i}`,
                    imagen: `cartas/${region}/${nombreArchivo}`,
                    region: region,
                    valor: regionValores[region]
                });
            }
        }
    }
    console.log(`Modo compatibilidad: ${cartas.length} cartas generadas`);
    return cartas;
}

function inicializarSupabase() {
    try {
        supabaseClient = getClient();
        supabaseEnabled = true;
        console.log('Supabase inicializado correctamente');
    } catch (e) {
        console.error('Error inicializando Supabase:', e);
        supabaseEnabled = false;
    }
}

async function cargarDatos() {
    if (!supabaseEnabled || !usuarioActual) {
        cargarLocalStorage();
        return;
    }
    try {
        const profile = await db.getProfile(supabaseClient, usuarioActual.id);
        monedas = profile?.monedas ?? 50;

        const inventario = await db.getInventory(supabaseClient, usuarioActual.id);
        coleccion = {};
        for (const item of inventario || []) {
            const carta = cartasData.find(c => c.id === item.carta_id);
            if (carta) coleccion[item.carta_id] = { carta, cantidad: item.cantidad };
        }
    } catch (e) {
        const status = e?.status || e?.code;
        const msg = String(e?.message || e);
        const esErrorSupabase = status === 406 || status === 'PGRST106' || status === 403 || /PGRST/.test(msg) || /row-level security/.test(msg) || /Forbidden/.test(msg);
        if (esErrorSupabase) {
            console.warn('[AUTH] Supabase no accesible por errores de backend; usando localStorage.');
            supabaseEnabled = false;
        } else {
            console.error('[AUTH] Error cargando datos desde Supabase:', e);
        }
        cargarLocalStorage();
    }
}

function cargarLocalStorage() {
    try {
        const guardado = localStorage.getItem('elfheim_coleccion');
        if (guardado) coleccion = JSON.parse(guardado);
        const monedasGuardadas = localStorage.getItem('elfheim_monedas');
        monedas = monedasGuardadas ? parseInt(monedasGuardadas) : 50;
    } catch (e) {
        console.error('Error cargando localStorage:', e);
        coleccion = {};
        monedas = 50;
    }
}

async function guardarDatos() {
    if (!supabaseEnabled || !usuarioActual) {
        guardarLocalStorage();
        return;
    }
    try {
        await db.upsertProfile(supabaseClient, {
            id: usuarioActual.id,
            monedas,
            updated_at: new Date().toISOString()
        });

        const items = Object.entries(coleccion).map(([cartaId, data]) => ({
            user_id: usuarioActual.id,
            carta_id: cartaId,
            cantidad: data.cantidad
        }));

        if (items.length > 0) {
            await db.upsertInventory(supabaseClient, items);
        }
    } catch (e) {
        const msg = String(e?.message || e);
        if (/row-level security/.test(msg) || /Forbidden/.test(msg) || /42501/.test(msg)) {
            console.warn('[AUTH] Permisos insuficientes en Supabase; usando localStorage.');
            supabaseEnabled = false;
        } else {
            console.error('[AUTH] Error guardando en Supabase:', e);
        }
        guardarLocalStorage();
    }
}

function guardarLocalStorage() {
    try {
        localStorage.setItem('elfheim_coleccion', JSON.stringify(coleccion));
        localStorage.setItem('elfheim_monedas', monedas.toString());
    } catch (e) {
        console.error('Error guardando localStorage:', e);
    }
}

function obtenerCartaActual(cartaId) {
    const guardada = coleccion[cartaId];
    const actual = cartasData.find(c => c.id === cartaId);
    if (actual) return { carta: actual, cantidad: guardada ? guardada.cantidad : 0 };
    return guardada || null;
}

function actualizarMonedas() {
    const elemento = document.getElementById('monedas');
    if (elemento) elemento.textContent = monedas;
}

function actualizarEstadisticas() {
    const items = Object.values(coleccion).map(item => obtenerCartaActual(item.carta.id)).filter(Boolean);
    document.getElementById('stats-total').textContent = `Total: ${items.reduce((sum, i) => sum + i.cantidad, 0)}`;
    document.getElementById('stats-unicos').textContent = `Únicas: ${items.length}`;
    document.getElementById('stats-umbraeth').textContent = `Umbraeth: ${items.filter(i => i.carta.region === 'umbraeth').length}`;
    document.getElementById('stats-skjoldheim').textContent = `Skjoldheim: ${items.filter(i => i.carta.region === 'skjoldheim').length}`;
    document.getElementById('stats-astra').textContent = `Astra: ${items.filter(i => i.carta.region === 'astra').length}`;
    document.getElementById('stats-solareth').textContent = `Solareth: ${items.filter(i => i.carta.region === 'solareth').length}`;
    document.getElementById('stats-elarion').textContent = `Elarion: ${items.filter(i => i.carta.region === 'elarion').length}`;
}

function cambiarTab(tab) {
    console.log('[STEP] cambiarTab ->', tab);
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
    if (btn) btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const elemento = document.getElementById(tab);
    if (elemento) {
        console.log('[STEP] mostrando tab', tab, 'display=', getComputedStyle(elemento).display);
        elemento.classList.add('active');
    }
    if (tab === 'coleccion') renderizarColeccion();
}

function comprarSobre(region, precio) {
    if (monedas < precio) {
        const btn = document.querySelector(`.btn-comprar[data-tipo="${region}"]`);
        if (btn) {
            btn.classList.add('error-shake');
            setTimeout(() => btn.classList.remove('error-shake'), 300);
        }
        return;
    }

    monedas -= precio;
    actualizarMonedas();
    guardarDatos();

    const cartas = generarCartasRegion(region);
    mostrarAnimacionSobre(cartas, region);
}

function generarCartasRegion(region) {
    const cartas = [];
    const cartasRegion = cartasData.filter(c => c.region === region);
    if (cartasRegion.length === 0) return cartasData.length > 0 ? [cartasData[0]] : [];
    for (let i = 0; i < 3; i++) {
        cartas.push(cartasRegion[Math.floor(Math.random() * cartasRegion.length)]);
    }
    return cartas;
}

function mostrarAnimacionSobre(cartas, region) {
    const modal = document.getElementById('modal-sobre');
    const contenedor = document.getElementById('cartas-revelar');
    if (!modal || !contenedor) return;
    contenedor.innerHTML = '';

    cartas.forEach((carta, index) => {
        const div = document.createElement('div');
        div.className = 'carta-sobre';
        div.style.animationDelay = `${index * 0.2}s`;
        setTimeout(() => {
            if (carta.imagen) {
                div.innerHTML = `<img src="${carta.imagen}" alt="${carta.nombre}" onerror="this.parentElement.innerHTML='<div class=\\'carta-placeholder\\'>🎴</div>'">`;
            } else {
                div.innerHTML = '<div class="carta-placeholder">🎴</div>';
            }
            div.classList.add('revelada');
            div.classList.add('region-' + carta.region);
        }, index * 200 + 100);
        contenedor.appendChild(div);
    });

    modal.classList.add('active');

    for (const carta of cartas) {
        if (!coleccion[carta.id]) {
            coleccion[carta.id] = {
                carta: {
                    id: carta.id,
                    nombre: carta.nombre,
                    region: carta.region,
                    valor: carta.valor,
                    imagen: carta.imagen
                },
                cantidad: 0
            };
        }
        coleccion[carta.id].cantidad++;
    }

    guardarDatos();
    actualizarEstadisticas();
}

function cerrarModales() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function renderizarColeccion(filtro = 'todas') {
    const grid = document.getElementById('coleccion-grid');
    if (!grid) return;
    let items = Object.values(coleccion).map(item => obtenerCartaActual(item.carta.id)).filter(Boolean);
    if (filtro !== 'todas') items = items.filter(i => i.carta.region === filtro);

    if (items.length === 0) {
        grid.innerHTML = '<p class="sin-cartas">No tienes cartas en tu colección aún.<br>Abre sobres en la pestaña Tienda para comenzar.</p>';
        return;
    }

    grid.innerHTML = items.map(({ carta, cantidad }) => {
        const claseRegion = 'region-' + carta.region;
        const rutaImagen = carta.imagen || '';
        return `
            <div class="carta-item ${claseRegion}" data-carta-id="${carta.id}">
                <img src="${rutaImagen}" alt="${carta.nombre}" 
                     onerror="this.style.display='none'; this.parentElement.querySelector('.carta-placeholder').style.display='flex';"
                     loading="lazy">
                <div class="carta-placeholder" style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:50px; background:rgba(0,0,0,0.3);">🎴</div>
                <div class="carta-cantidad">x${cantidad}</div>
                <div class="carta-nombre">${carta.nombre}</div>
            </div>
        `;
    }).join('');

    grid.querySelectorAll('.carta-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            mostrarDetalle(this.dataset.cartaId);
        });
    });
}

function toHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return (div.innerHTML || '')
        .replace(/\\n/g, '<br>')
        .replace(/&lt;br&gt;/g, '<br>');
}

function mostrarDetalle(cartaId) {
    const data = obtenerCartaActual(cartaId);
    if (!data) return;
    const carta = data.carta;
    const img = document.getElementById('carta-detalle-img');
    img.src = carta.imagen || '';
    img.style.display = carta.imagen ? 'block' : 'none';
    const nombreEl = document.getElementById('carta-detalle-nombre');
    if (nombreEl) nombreEl.textContent = carta.nombre;

    const regionEl = document.getElementById('carta-detalle-region');
    const valorEl = document.getElementById('carta-detalle-valor');
    if (regionEl) regionEl.textContent = REGION_NOMBRES[carta.region] || carta.region;
    if (valorEl) valorEl.textContent = `${carta.valor} monedas`;

    const cantidadEl = document.getElementById('carta-detalle-cantidad');
    if (cantidadEl) cantidadEl.textContent = `Cantidad: ${data.cantidad}`;

    const btnVender = document.getElementById('btn-vender');
    const inputVender = document.getElementById('vender-cantidad');
    if (btnVender && inputVender) {
        const maxVenta = Math.max(1, data.cantidad - 1);
        inputVender.value = 1;
        inputVender.max = maxVenta;
        btnVender.disabled = data.cantidad <= 1;
    }
    const modalCarta = document.getElementById('modal-carta');
    modalCarta.dataset.cartaId = cartaId;
    modalCarta.dataset.valor = carta.valor;
    if (panelVenta) {
        panelVenta.classList.remove('open');
    }
    modalCarta.classList.add('active');
}

function aplicarFiltro(filtro) {
    document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.filtro-btn[data-filtro="${filtro}"]`);
    if (btn) btn.classList.add('active');
    renderizarColeccion(filtro);
}

function mostrarAuthError(msg) {
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.textContent = msg;
}

function setUsuario(user) {
    usuarioActual = user;
    const overlay = document.getElementById('auth-overlay');
    const authForm = document.getElementById('auth-form');
    const profileTrigger = document.getElementById('profile-trigger');
    const profileMenu = document.getElementById('profile-menu');
    const profileUsername = document.getElementById('profile-username');
    const esOffline = user?.id === 'local';

    if (user) {
        overlay.style.display = 'none';
        authForm.style.display = 'none';
        actualizarEstadoPerfil();
        if (profileTrigger) profileTrigger.style.display = 'flex';
        if (profileMenu && profileUsername) {
            profileUsername.textContent = esOffline
                ? 'Jugador Offline'
                : 'Cargando...';
        }
        if (esOffline) {
            cargarLocalStorage();
            actualizarMonedas();
            actualizarEstadisticas();
            renderizarColeccion();
        } else {
            cargarDatos().then(() => {
                actualizarMonedas();
                actualizarEstadisticas();
                renderizarColeccion();
            }).catch(err => {
                console.error('[AUTH] Error al cargar datos:', err);
            });
            actualizarUsernameDesdePerfil().catch(err => {
                console.error('[AUTH] Error al cargar username:', err);
            });
        }
    } else {
        overlay.style.display = 'flex';
        authForm.style.display = 'flex';
        if (profileTrigger) profileTrigger.style.display = 'none';
        if (profileMenu) profileMenu.style.display = 'none';
        closeProfileMenu();
        cerrarModalProfile();
        cerrarModalPassword();
        coleccion = {};
        monedas = 0;
        actualizarMonedas();
        actualizarEstadisticas();
        renderizarColeccion();
    }
}

function actualizarEstadoPerfil() {
    const statusEl = document.getElementById('profile-status');
    const usernameEl = document.getElementById('profile-username');
    const btnEdit = document.getElementById('btn-edit-profile');
    const btnPass = document.getElementById('btn-change-password');
    const btnLogout = document.getElementById('profile-logout');
    const btnLogin = document.getElementById('profile-login');
    if (!statusEl || !usernameEl) return;
    const esOffline = usuarioActual?.id === 'local';
    statusEl.textContent = esOffline ? 'Offline' : 'Online';
    statusEl.className = 'profile-status ' + (esOffline ? 'offline' : 'online');
    usernameEl.textContent = esOffline
        ? 'Jugador Offline'
        : (usuarioActual?.username || 'Usuario');
    if (btnEdit) btnEdit.style.display = esOffline ? 'none' : 'block';
    if (btnPass) btnPass.style.display = esOffline ? 'none' : 'block';
    if (btnLogout) btnLogout.style.display = esOffline ? 'none' : 'block';
    if (btnLogin) btnLogin.style.display = esOffline ? 'block' : 'none';
}

async function cargarUsernamePerfil() {
    if (!usuarioActual || !supabaseClient) return null;
    const { data } = await supabaseClient
        .from('profiles')
        .select('username')
        .eq('id', usuarioActual.id)
        .maybeSingle();
    return data?.username || null;
}

async function actualizarUsernameDesdePerfil() {
    const username = await cargarUsernamePerfil();
    if (username) {
        usuarioActual.username = username;
        actualizarEstadoPerfil();
    }
}

function openProfileMenu() {
    const profileMenu = document.getElementById('profile-menu');
    if (profileMenu) profileMenu.style.display = 'block';
}

function closeProfileMenu() {
    const profileMenu = document.getElementById('profile-menu');
    if (profileMenu) profileMenu.style.display = 'none';
}

function openModalProfile() {
    const modal = document.getElementById('modal-profile');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('edit-email') && (document.getElementById('edit-email').value = usuarioActual?.email || '');
    cargarUsernamePerfil().then(name => {
        const input = document.getElementById('edit-username');
        if (input) input.value = name || '';
    }).catch(() => {});
}

function cerrarModalProfile() {
    const modal = document.getElementById('modal-profile');
    if (modal) modal.classList.remove('active');
}

function openModalPassword() {
    const modal = document.getElementById('modal-password');
    if (modal) modal.classList.add('active');
}

function cerrarModalPassword() {
    const modal = document.getElementById('modal-password');
    if (modal) modal.classList.remove('active');
}

async function editarPerfil(username) {
    if (!usuarioActual || !supabaseClient) return;
    const { error } = await supabaseClient
        .from('profiles')
        .upsert({ id: usuarioActual.id, username }, { onConflict: 'id' });
    if (error) {
        console.error('[AUTH] Error guardando username:', error);
        mostrarErrorPerfil(error.message || 'Error al guardar perfil');
        return;
    }
    usuarioActual.username = username;
    document.getElementById('profile-username').textContent = username;
    cerrarModalProfile();
}

async function cambiarPassword(newPassword) {
    if (!usuarioActual || !supabaseClient) return;
    try {
        await auth.updatePassword(supabaseClient, newPassword);
        cerrarModalPassword();
    } catch (e) {
        console.error('[AUTH] Error cambiando contraseña:', e);
        mostrarErrorPassword(e.message || 'Error al cambiar contraseña');
    }
}

function mostrarErrorPerfil(msg) {
    const el = document.getElementById('edit-profile-error');
    if (el) el.textContent = msg;
}

function mostrarErrorPassword(msg) {
    const el = document.getElementById('password-error');
    if (el) el.textContent = msg;
}

function mostrarModoRegister() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        if (tab.dataset.auth === 'register') tab.classList.add('active');
        else tab.classList.remove('active');
    });
    const submitBtn = document.querySelector('.auth-submit');
    if (submitBtn) submitBtn.textContent = 'Registrarse';
}

function mostrarModoLogin() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        if (tab.dataset.auth === 'login') tab.classList.add('active');
        else tab.classList.remove('active');
    });
    const submitBtn = document.querySelector('.auth-submit');
    if (submitBtn) submitBtn.textContent = 'Entrar';
}

function onAuthSubmit(e) {
    e.preventDefault();
    const usernameOrEmail = document.getElementById('auth-username-or-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const errorEl = document.getElementById('auth-error');
    if (!usernameOrEmail || !password) {
        errorEl.textContent = 'Completá usuario/email y contraseña';
        return;
    }
    const esRegister = document.querySelector('.auth-tab[data-auth="register"]').classList.contains('active');
    errorEl.textContent = 'Cargando...';
    procesarAuth(esRegister, usernameOrEmail, password);
}

async function procesarAuth(esRegister, usernameOrEmail, password) {
    const errorEl = document.getElementById('auth-error');
    try {
        const client = supabaseClient;
        if (!client) throw new Error('Supabase no configurado');
        if (esRegister) {
            const email = usernameOrEmail.includes('@') ? usernameOrEmail : `${usernameOrEmail}@elfheim.user`;
            const result = await auth.signUp(client, email, password, usernameOrEmail);
            console.log('[AUTH] signUp result:', result);
            if (!result.user) throw new Error('No se pudo crear el usuario');
            setUsuario(result.user);
        } else {
            const email = usernameOrEmail.includes('@') ? usernameOrEmail : buscarEmailPorUsername(usernameOrEmail);
            if (!email) {
                throw new Error('Usuario no encontrado');
            }
            const result = await auth.signIn(client, email, password);
            console.log('[AUTH] signIn result:', result);
            setUsuario(result.user);
        }
    } catch (err) {
        console.error('[AUTH] Error completo:', err);
        errorEl.textContent = err.message || 'Error de autenticación';
    }
}

async function buscarEmailPorUsername(username) {
    const cliente = supabaseClient;
    if (!cliente) return null;
    const { data } = await cliente
        .from('profiles')
        .select('email')
        .eq('username', username)
        .maybeSingle();
    return data?.email || null;
}

function inicializarUI() {
    console.log('[STEP] inicializarUI');
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            console.log('[CLICK] nav-btn', btn.dataset.tab, 'usuarioActual=', !!usuarioActual, 'supabaseEnabled=', supabaseEnabled);
            if (!usuarioActual && supabaseEnabled && getClient()) {
                mostrarAuthError('Iniciá sesión primero');
                return;
            }
            cambiarTab(btn.dataset.tab);
        });
    });

    document.querySelectorAll('.btn-comprar').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!usuarioActual && supabaseEnabled && getClient()) {
                mostrarAuthError('Iniciá sesión primero');
                return;
            }
            const tipo = btn.dataset.tipo;
            const precio = parseInt(btn.dataset.precio);
            if (!Number.isFinite(precio)) return;
            comprarSobre(tipo, precio);
        });
    });

    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!usuarioActual && supabaseEnabled && getClient()) {
                mostrarAuthError('Iniciá sesión primero');
                return;
            }
            aplicarFiltro(btn.dataset.filtro);
        });
    });

    const btnMoneda = document.querySelector('.btn-moneda');
    let monedaTimer = null;
    function actualizarBotonMoneda() {
        if (!btnMoneda) return;
        const uid = usuarioActual?.id || 'local';
        const now = Date.now();
        const cooldownMs = 60 * 60 * 1000;
        const key = `elfheim_monedas_cooldown_${uid}`;
        const last = parseInt(localStorage.getItem(key) || '0');
        const remaining = cooldownMs - (now - last);

        if (remaining > 0) {
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            btnMoneda.disabled = true;
            btnMoneda.textContent = `Espera ${mins}m ${secs}s`;
            btnMoneda.style.opacity = '0.5';
            btnMoneda.style.cursor = 'not-allowed';
        } else {
            btnMoneda.disabled = false;
            btnMoneda.textContent = '🪙 +100 Monedas';
            btnMoneda.style.opacity = '1';
            btnMoneda.style.cursor = 'pointer';
        }
    }
    if (btnMoneda) {
        btnMoneda.addEventListener('click', async () => {
            if (!usuarioActual && supabaseEnabled && getClient()) {
                mostrarAuthError('Iniciá sesión primero');
                return;
            }
            if (btnMoneda.disabled) return;
            const uid = usuarioActual?.id || 'local';
            const now = Date.now();
            const cooldownMs = 60 * 60 * 1000;
            const key = `elfheim_monedas_cooldown_${uid}`;
            const last = parseInt(localStorage.getItem(key) || '0');
            const remaining = cooldownMs - (now - last);
            if (remaining > 0) return;
            monedas += 100;
            actualizarMonedas();
            localStorage.setItem(key, now.toString());
            await guardarDatos();
            actualizarBotonMoneda();
        });
        if (monedaTimer) clearInterval(monedaTimer);
        actualizarBotonMoneda();
        monedaTimer = setInterval(actualizarBotonMoneda, 1000);
    }

    document.querySelectorAll('.cerrar').forEach(boton => {
        boton.addEventListener('click', cerrarModales);
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', event => {
            if (event.target === modal) cerrarModales();
        });
    });

    const btnColeccionar = document.querySelector('.btn-coleccionar');
    if (btnColeccionar) {
        btnColeccionar.addEventListener('click', cerrarModales);
    }

    const btnVender = document.getElementById('btn-vender');
    const panelVenta = document.getElementById('vender-panel');
    if (btnVender && panelVenta) {
        btnVender.addEventListener('click', () => {
            panelVenta.classList.toggle('open');
        });
    }

    const btnConfirmarVenta = document.getElementById('btn-confirmar-venta');
    if (btnConfirmarVenta) {
        btnConfirmarVenta.addEventListener('click', async () => {
            const modal = document.getElementById('modal-carta');
            const cartaId = modal?.dataset?.cartaId;
            const valor = parseInt(modal?.dataset?.valor || '0', 10);
            const input = document.getElementById('vender-cantidad');
            const cantidad = parseInt(input?.value || '1', 10);
            if (!cartaId || !Number.isFinite(valor) || !Number.isFinite(cantidad) || cantidad <= 0) return;
            const item = coleccion[cartaId];
            if (!item || item.cantidad <= cantidad) return;
            item.cantidad -= cantidad;
            monedas += valor * cantidad;
            actualizarMonedas();
            actualizarEstadisticas();
            renderizarColeccion();
            await guardarDatos();
            if (panelVenta) {
                panelVenta.style.display = 'none';
                panelVenta.dataset.abierto = '0';
            }
            const cantidadTexto = document.getElementById('carta-detalle-cantidad');
            if (cantidadTexto) cantidadTexto.textContent = `Cantidad: ${item.cantidad}`;
            if (btnVender) btnVender.disabled = true;
        });
    }

    const btnVenderMas = document.getElementById('vender-mas');
    const btnVenderMenos = document.getElementById('vender-menos');
    const inputVender = document.getElementById('vender-cantidad');
    if (btnVenderMas && inputVender) {
        btnVenderMas.addEventListener('click', () => {
            const modal = document.getElementById('modal-carta');
            const cartaId = modal?.dataset?.cartaId;
            const item = cartaId ? coleccion[cartaId] : null;
            const max = item ? Math.max(1, item.cantidad - 1) : 1;
            let valor = parseInt(inputVender.value || '1', 10);
            if (Number.isFinite(valor)) {
                inputVender.value = Math.min(max, valor + 1);
            } else {
                inputVender.value = 1;
            }
        });
    }
    if (btnVenderMenos && inputVender) {
        btnVenderMenos.addEventListener('click', () => {
            let valor = parseInt(inputVender.value || '1', 10);
            if (Number.isFinite(valor) && valor > 1) {
                inputVender.value = valor - 1;
            } else {
                inputVender.value = 1;
            }
        });
    }

    const loginTabBtn = document.querySelector('.auth-tab[data-auth="login"]');
    const registerTabBtn = document.querySelector('.auth-tab[data-auth="register"]');

    if (loginTabBtn) {
        loginTabBtn.addEventListener('click', () => {
            mostrarModoLogin();
            const errorEl = document.getElementById('auth-error');
            if (errorEl) errorEl.textContent = '';
        });
    }

    if (registerTabBtn) {
        registerTabBtn.addEventListener('click', () => {
            mostrarModoRegister();
            const errorEl = document.getElementById('auth-error');
            if (errorEl) errorEl.textContent = '';
        });
    }

    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', onAuthSubmit);
    }

    const profileTrigger = document.getElementById('profile-trigger');
    if (profileTrigger) {
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const wrapper = document.getElementById('profile-trigger').parentElement;
            const menu = document.getElementById('profile-menu');
            if (menu) {
                menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
            }
        });
    }

    const cerrarProfile = document.querySelector('.cerrar-profile');
    if (cerrarProfile) {
        cerrarProfile.addEventListener('click', closeProfileMenu);
    }

    const btnEditProfile = document.getElementById('btn-edit-profile');
    if (btnEditProfile) {
        btnEditProfile.addEventListener('click', () => {
            closeProfileMenu();
            openModalProfile();
        });
    }

    const btnChangePassword = document.getElementById('btn-change-password');
    if (btnChangePassword) {
        btnChangePassword.addEventListener('click', () => {
            closeProfileMenu();
            openModalPassword();
        });
    }

    const profileLogout = document.getElementById('profile-logout');
    if (profileLogout) {
        profileLogout.addEventListener('click', async () => {
            try {
                if (supabaseClient) await auth.signOut(supabaseClient);
            } catch (e) {
                console.error('Error al cerrar sesión:', e);
            }
            setUsuario(null);
        });
    }

    const profileLogin = document.getElementById('profile-login');
    if (profileLogin) {
        profileLogin.addEventListener('click', async () => {
            closeProfileMenu();
            const overlay = document.getElementById('auth-overlay');
            const authForm = document.getElementById('auth-form');
            if (overlay) overlay.style.display = 'flex';
            if (authForm) authForm.style.display = 'flex';
            const offlineBtn = document.getElementById('offline-toggle');
            if (offlineBtn) {
                offlineBtn.classList.remove('active');
            }
            localStorage.removeItem('elfheim_offline');
            usuarioActual = null;
            supabaseEnabled = true;
            const client = getClient();
            if (client) {
                supabaseClient = client;
            }
        });
    }

    const discordBtn = document.getElementById('discord-signin');
    if (discordBtn) {
        discordBtn.addEventListener('click', async () => {
            const errorEl = document.getElementById('auth-error');
            try {
                errorEl.textContent = 'Conectando con Discord...';
                if (!supabaseClient) throw new Error('Supabase no configurado');
                await auth.signInWithGoogle(supabaseClient);
            } catch (err) {
                console.error('[AUTH] Discord error:', err);
                errorEl.textContent = err.message || 'Error con Discord';
            }
        });
    }

    const offlineBtn = document.getElementById('offline-toggle');
    if (offlineBtn) {
        offlineBtn.addEventListener('click', async () => {
            const nuevoEstado = !offlineBtn.classList.contains('active');
            offlineBtn.classList.toggle('active', nuevoEstado);
            localStorage.setItem('elfheim_offline', nuevoEstado ? '1' : '0');

            if (nuevoEstado) {
                const cliente = getClient();
                if (!nuevoEstado && cliente) {
                    try {
                        await db.upsertProfile(cliente, {
                            id: usuarioActual.id,
                            monedas,
                            updated_at: new Date().toISOString()
                        });
                    } catch (_) {}
                }
                usuarioActual = { id: 'local', email: null };
                supabaseEnabled = false;
                cargarLocalStorage();
                setUsuario(usuarioActual);
                actualizarBotonMoneda();
            } else {
                const cliente = getClient();
                if (cliente) {
                    supabaseClient = cliente;
                    supabaseEnabled = true;
                }
                cargarDatos().then(() => {
                    actualizarMonedas();
                    actualizarEstadisticas();
                    renderizarColeccion();
                    actualizarBotonMoneda();
                }).catch(() => {
                    cargarLocalStorage();
                    actualizarMonedas();
                    actualizarEstadisticas();
                    renderizarColeccion();
                    actualizarBotonMoneda();
                });
            }
        });
    }

    document.querySelectorAll('.cerrar').forEach(boton => {
        boton.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
            closeProfileMenu();
        });
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', event => {
            if (event.target === modal) {
                modal.classList.remove('active');
                closeProfileMenu();
            }
        });
    });

    document.querySelectorAll('.btn-coleccionar').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        });
    });

    const formEditProfile = document.getElementById('form-edit-profile');
    if (formEditProfile) {
        formEditProfile.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('edit-username')?.value.trim();
            if (!username) {
                mostrarErrorPerfil('El nombre de usuario es obligatorio');
                return;
            }
            if (username.length < 2 || username.length > 30) {
                mostrarErrorPerfil('Debe tener entre 2 y 30 caracteres');
                return;
            }
            editarPerfil(username);
        });
    }

    const formChangePassword = document.getElementById('form-change-password');
    if (formChangePassword) {
        formChangePassword.addEventListener('submit', (e) => {
            e.preventDefault();
            const newP = document.getElementById('new-password').value;
            const confirmP = document.getElementById('confirm-password').value;
            const errorEl = document.getElementById('password-error');
            if (!newP || !confirmP) {
                mostrarErrorPassword('Completá ambos campos');
                return;
            }
            if (newP !== confirmP) {
                mostrarErrorPassword('Las contraseñas no coinciden');
                return;
            }
            if (newP.length < 6) {
                mostrarErrorPassword('Mínimo 6 caracteres');
                return;
            }
            cambiarPassword(newP);
        });
    }

    document.addEventListener('click', (e) => {
        const menu = document.getElementById('profile-menu');
        const trigger = document.getElementById('profile-trigger');
        if (menu && trigger && !menu.contains(e.target) && !trigger.contains(e.target)) {
            menu.style.display = 'none';
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[INIT] DOM cargado, iniciando app...');
    window.onerror = (msg, url, line, col, err) => {
        console.error('[GLOBAL ERROR]', msg, 'at', url + ':' + line + ':' + col, 'err=', err);
    };
    inicializarSupabase();
    await cargarCartas();

    const modoOffline = localStorage.getItem('elfheim_offline') === '1';
    const offlineBtn = document.getElementById('offline-toggle');
    if (modoOffline && offlineBtn) {
        offlineBtn.classList.add('active');
        usuarioActual = { id: 'local', email: null };
        supabaseEnabled = false;
    } else if (!modoOffline && supabaseEnabled) {
        const session = await auth.getSession(supabaseClient);
        usuarioActual = session?.user ?? null;
    }

    if (!modoOffline) {
        cargarDatos();
    } else {
        cargarLocalStorage();
    }
    inicializarUI();
    setUsuario(usuarioActual);
});
