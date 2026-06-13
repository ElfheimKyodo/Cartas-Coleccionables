let cartasData = [];
let coleccion = {};
let monedas = 0;
let usuarioActual = null;
let supabaseClient = null;
let supabaseEnabled = false;

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
            if (carta) {
                coleccion[item.carta_id] = { carta, cantidad: item.cantidad };
            }
        }
    } catch (e) {
        console.error('Error cargando datos desde Supabase:', e);
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
        console.error('Error guardando en Supabase:', e);
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
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
    if (btn) btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const elemento = document.getElementById(tab);
    if (elemento) elemento.classList.add('active');
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
        item.addEventListener('click', function() {
            mostrarDetalle(this.dataset.cartaId);
        });
    });
}

function mostrarDetalle(cartaId) {
    const data = obtenerCartaActual(cartaId);
    if (!data) return;
    const carta = data.carta;
    const img = document.getElementById('carta-detalle-img');
    img.src = carta.imagen || '';
    img.style.display = carta.imagen ? 'block' : 'none';
    document.getElementById('carta-detalle-nombre').textContent = carta.nombre;
    document.getElementById('carta-detalle-region').textContent = `Región: ${REGION_NOMBRES[carta.region]} | Valor: ${carta.valor} monedas`;
    document.getElementById('carta-detalle-cantidad').textContent = `Cantidad: ${data.cantidad}${data.cantidad > 1 ? ' (puedes vender ' + (data.cantidad - 1) + ')' : ''}`;
    document.getElementById('modal-carta').classList.add('active');
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
    if (user) {
        overlay.style.display = 'none';
        authForm.style.display = 'none';
        cargarDatos().then(() => {
            actualizarMonedas();
            actualizarEstadisticas();
            renderizarColeccion();
        });
    } else {
        overlay.style.display = 'flex';
        authForm.style.display = 'flex';
        coleccion = {};
        monedas = 0;
        actualizarMonedas();
        actualizarEstadisticas();
        renderizarColeccion();
    }
}

function onAuthSubmit(e) {
    e.preventDefault();

    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const errorEl = document.getElementById('auth-error');

    if (!emailInput || !passwordInput || !errorEl) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        errorEl.textContent = 'Completá email y contraseña';
        return;
    }

    const loginTab = document.querySelector('.auth-tab[data-auth="login"]');
    const isRegister = loginTab && !loginTab.classList.contains('active');

    errorEl.textContent = 'Cargando...';

    return fireAuth(isRegister, email, password);
}

async function fireAuth(isRegister, email, password) {
    const errorEl = document.getElementById('auth-error');

    try {
        const client = getSupabaseClient();
        if (!client) {
            throw new Error('Supabase no configurado');
        }

        let user = null;

        if (isRegister) {
            const signUpResult = await auth.signUp(client, email, password);
            if (signUpResult.error) throw signUpResult.error;
            user = signUpResult.data.user;
        } else {
            const signInResult = await auth.signIn(client, email, password);
            if (signInResult.error) throw signInResult.error;
            user = signInResult.data.user;
        }

        if (!user) {
            throw new Error('No se pudo obtener la sesión');
        }

        setUsuario(user);
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = err.message || 'Error de autenticación';
        }
    }
}

function setLoginMode() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        if (tab.dataset.auth === 'login') {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    const submitBtn = document.querySelector('.auth-submit');
    if (submitBtn) {
        submitBtn.textContent = 'Entrar';
    }
}

function setRegisterMode() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        if (tab.dataset.auth === 'register') {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    const submitBtn = document.querySelector('.auth-submit');
    if (submitBtn) {
        submitBtn.textContent = 'Registrarse';
    }
}

function inicializarUI() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!usuarioActual && supabaseEnabled && getSupabaseClient()) {
                mostrarAuthError('Iniciá sesión primero');
                return;
            }

            cambiarTab(btn.dataset.tab);
        });
    });

    document.querySelectorAll('.btn-comprar').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!usuarioActual && supabaseEnabled && getSupabaseClient()) {
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
            if (!usuarioActual && supabaseEnabled && getSupabaseClient()) {
                mostrarAuthError('Iniciá sesión primero');
                return;
            }

            aplicarFiltro(btn.dataset.filtro);
        });
    });

    const btnMoneda = document.querySelector('.btn-moneda');
    if (btnMoneda) {
        btnMoneda.addEventListener('click', async () => {
            if (!usuarioActual && supabaseEnabled && getSupabaseClient()) {
                mostrarAuthError('Iniciá sesión primero');
                return;
            }

            monedas += 100;
            actualizarMonedas();
            await guardarDatos();
        });
    }

    document.querySelectorAll('.cerrar').forEach(boton => {
        boton.addEventListener('click', cerrarModales);
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', event => {
            if (event.target === modal) {
                cerrarModales();
            }
        });
    });

    const btnColeccionar = document.querySelector('.btn-coleccionar');
    if (btnColeccionar) {
        btnColeccionar.addEventListener('click', cerrarModales);
    }

    const loginTabBtn = document.querySelector('.auth-tab[data-auth="login"]');
    const registerTabBtn = document.querySelector('.auth-tab[data-auth="register"]');

    if (loginTabBtn) {
        loginTabBtn.addEventListener('click', () => {
            setLoginMode();
            if (document.getElementById('auth-error')) {
                document.getElementById('auth-error').textContent = '';
            }
        });
    }

    if (registerTabBtn) {
        registerTabBtn.addEventListener('click', () => {
            setRegisterMode();
            if (document.getElementById('auth-error')) {
                document.getElementById('auth-error').textContent = '';
            }
        });
    }

    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.removeEventListener('submit', onAuthSubmit);
        authForm.addEventListener('submit', onAuthSubmit);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    inicializarSupabase();
    await cargarCartas();

    if (supabaseEnabled) {
        const session = await auth.getSession(supabaseClient);
        if (session?.user) {
            usuarioActual = session.user;
        }
        auth.onAuthStateChanged(supabaseClient, (_event, session) => {
            if (session?.user) {
                usuarioActual = session.user;
            } else {
                usuarioActual = null;
            }
            setUsuario(usuarioActual);
        });
    }

    cargarDatos();
    inicializarUI();
    setUsuario(usuarioActual);
});