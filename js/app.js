let cartasData = [];
let coleccion = {};
let monedas = 0;
let usuarioActual = null;
let supabaseClient = null;
let supabaseEnabled = false;
let panelVentaGlobal = null;
let sobreSeleccionado = 'generic';
let logoGenericoIndex = 0;
let logoGachaTimer = null;
let previewDestelloTimer = null;
let monedaTimer = null;
let sobresConfigurados = [];
let bannersConfigurados = [];
let lastClaimServerMs = 0;
const LAST_CLAIM_STORAGE_KEY = 'elfheim_last_claim_at';

const REGIONES = ['umbraeth', 'skjoldheim', 'astra', 'solareth', 'elarion'];
const REGION_NOMBRES = {
    umbraeth: 'Umbraeth',
    skjoldheim: 'Skjoldheim',
    astra: 'Astra',
    solareth: 'Solareth',
    elarion: 'Elarion'
};
const RAREZA_NOMBRES = {
    comun: 'Comun',
    poco_comun: 'Poco comun',
    rara: 'Rara',
    epica: 'Epica',
    legendaria: 'Legendaria'
};
const RAREZA_COLORS = {
    comun: '#6b7280',
    poco_comun: '#15803d',
    rara: '#15803d',
    epica: '#7c3aed',
    legendaria: 'linear-gradient(135deg, #f59e0b, #ffd700)'
};
const CATEGORIA_NOMBRES = {
    personaje: 'Personaje',
    enemigo: 'Enemigo',
    boss: 'Boss',
    localizacion: 'Localizacion',
    item: 'Item'
};

function obtenerClaveUltimoReclamo(userId = usuarioActual?.id || 'local') {
    return `${LAST_CLAIM_STORAGE_KEY}_${String(userId || 'local')}`;
}

function leerUltimoReclamoLocal(userId = null) {
    const valor = Number(localStorage.getItem(obtenerClaveUltimoReclamo(userId)));
    return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

function guardarUltimoReclamoLocal(ms, userId = null) {
    const clave = obtenerClaveUltimoReclamo(userId);
    if (Number.isFinite(ms) && ms > 0) {
        localStorage.setItem(clave, ms.toString());
    } else {
        localStorage.removeItem(clave);
    }
}


const SOBRES = [
    {
        tipo: 'generic',
        nombre: 'Sobre Genérico',
        icono: 'fa-solid fa-layer-group',
        precio: 50,
        regiones: REGIONES,
        descripcion: 'Un gacha equilibrado con cartas de todas las regiones.',
        informacion: '<h4>Contiene 3 cartas aleatorias de todas las regiones</h4> \nPrueba'
    },
    {
        tipo: 'umbraeth',
        nombre: 'Sobre Umbraeth',
        icono: 'fa-solid fa-moon',
        precio: 50,
        regiones: ['umbraeth'],
        descripcion: 'Sombras, demonios y secretos ocultos de Umbraeth.',
        informacion: '<h4>Contiene 3 cartas aleatorias de Umbraeth</h4><ul><li>Lilith: La Dama Rosa</li></ul>'
    },
    {
        tipo: 'skjoldheim',
        nombre: 'Sobre Skjoldheim',
        icono: 'fa-solid fa-snowflake',
        precio: 50,
        regiones: ['skjoldheim'],
        descripcion: 'Guerreros, hielo y runas antiguas de Skjoldheim.',
        informacion: '<h4>Contiene 3 cartas aleatorias de Skjoldheim</h4> \nPrueba'
    },
    {
        tipo: 'astra',
        nombre: 'Sobre Astra',
        icono: 'fa-solid fa-star',
        precio: 50,
        regiones: ['astra'],
        descripcion: 'Misterio celestial y magia estelar de Astra.',
        informacion: '<h4>Contiene 3 cartas aleatorias de Astra</h4> \nPrueba'
    },
    {
        tipo: 'solareth',
        nombre: 'Sobre Solareth',
        icono: 'fa-solid fa-dragon',
        precio: 50,
        regiones: ['solareth'],
        descripcion: 'Fuego, dragones y linajes solares de Solareth.',
        informacion: '<h4>Contiene 3 cartas aleatorias de Solareth</h4> \nPrueba'
    },
    {
        tipo: 'elarion',
        nombre: 'Sobre Elarion',
        icono: 'fa-solid fa-leaf',
        precio: 50,
        regiones: ['elarion'],
        descripcion: 'Naturaleza viva, espíritus y bosques de Elarion.',
        informacion: '<h4>Contiene 3 cartas aleatorias de Elarion</h4> \nPrueba'
    }
];

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

async function cargarConfiguracionSobres() {
    try {
        const response = await fetch('js/sobres-config.json');
        if (!response.ok) throw new Error('No se encontró sobres-config.json');
        const config = await response.json();
        sobresConfigurados = (config.sobres || []).filter(sobre => sobre.disponible !== false);
        bannersConfigurados = (config.banners || []).filter(banner => banner.disponible !== false);
        if (sobresConfigurados.length === 0) sobresConfigurados = SOBRES;
        if (!sobresConfigurados.some(sobre => sobre.tipo === sobreSeleccionado)) {
            sobreSeleccionado = sobresConfigurados[0]?.tipo || 'generic';
        }
    } catch (error) {
        console.warn('Error cargando sobres-config.json:', error);
        sobresConfigurados = SOBRES;
        bannersConfigurados = [];
    }
}

function obtenerSobresDisponibles() {
    return sobresConfigurados.length > 0 ? sobresConfigurados : SOBRES;
}

function obtenerSobre(tipo) {
    return obtenerSobresDisponibles().find(sobre => sobre.tipo === tipo) || obtenerSobresDisponibles()[0];
}

function cargarCartasCompatibilidad() {
    const cartas = [];
    const extensiones = ['webp', 'png', 'jpg', 'jpeg', 'gif'];
    const regionValores = { umbraeth: 5, skjoldheim: 5, astra: 5, solareth: 5, elarion: 5 };
    const razas = ['Sucubo', 'Astrarion', 'Dunarion', 'Guerrero del Yelmo', 'Clarion', 'Solarion'];
    const categorias = Object.keys(CATEGORIA_NOMBRES);
    const rarezas = Object.keys(RAREZA_NOMBRES);
    for (const region of REGIONES) {
        for (const ext of extensiones) {
            for (let i = 0; i < 50; i++) {
                const nombreArchivo = `carta_${i}.${ext}`;
                cartas.push({
                    id: `${region}/carta_${i}`,
                    nombre: `Carta ${REGION_NOMBRES[region]} ${i}`,
                    imagen: `cartas/${region}/${nombreArchivo}`,
                    region: region,
                    raza: razas[i % razas.length],
                    categoria: categorias[i % categorias.length],
                    rareza: rarezas[i % rarezas.length],
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
        console.log('[COOLDOWN] profile:', profile);
        monedas = profile?.monedas ?? 50;

        if (profile?.updated_at) {
            const parsed = Date.parse(profile.updated_at);
            console.log('[COOLDOWN] updated_at raw:', profile.updated_at, 'parsed:', parsed, 'isNaN:', Number.isNaN(parsed));
            if (!Number.isNaN(parsed)) {
                lastClaimServerMs = parsed;
                guardarUltimoReclamoLocal(lastClaimServerMs, usuarioActual.id);
            } else {
                lastClaimServerMs = leerUltimoReclamoLocal(usuarioActual.id);
                console.log('[COOLDOWN] updated_at inválido; usando localStorage:', lastClaimServerMs);
            }
        } else {
            lastClaimServerMs = leerUltimoReclamoLocal(usuarioActual.id);
            console.log('[COOLDOWN] updated_at ausente; usando localStorage:', lastClaimServerMs);
        }

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
        lastClaimServerMs = leerUltimoReclamoLocal(usuarioActual?.id || 'local');
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
    if (actual) {
        return {
            carta: {
                id: actual.id,
                nombre: actual.nombre,
                region: actual.region,
                raza: actual.raza || guardada?.carta?.raza || '—',
                categoria: actual.categoria || guardada?.carta?.categoria || 'personaje',
                rareza: actual.rareza || guardada?.carta?.rareza || 'comun',
                valor: actual.valor,
                imagen: actual.imagen,
                descripcion: actual.descripcion || guardada?.carta?.descripcion || '',
                interprete: actual.interprete || guardada?.carta?.interprete || ''
            },
            cantidad: guardada ? guardada.cantidad : 0
        };
    }
    if (guardada) {
        return {
            carta: {
                id: guardada.carta.id,
                nombre: guardada.carta.nombre,
                region: guardada.carta.region || 'desconocida',
                raza: guardada.carta.raza || '—',
                categoria: guardada.carta.categoria || 'personaje',
                rareza: guardada.carta.rareza || 'comun',
                valor: guardada.carta.valor || 0,
                imagen: guardada.carta.imagen || '',
                descripcion: guardada.carta.descripcion || '',
                interprete: guardada.carta.interprete || ''
            },
            cantidad: guardada.cantidad
        };
    }
    return null;
}

function actualizarMonedas() {
    const elemento = document.getElementById('monedas');
    if (elemento) elemento.textContent = monedas;
    actualizarBotonMoneda();
}

function actualizarBotonMoneda() {
    const btnMoneda = document.querySelector('.btn-moneda');
    const timerMoneda = document.getElementById('moneda-timer');
    if (!btnMoneda) return;

    const now = Date.now();
    const userId = usuarioActual?.id || 'local';
    const serverNow = lastClaimServerMs > 0 ? lastClaimServerMs : now;
    const cooldownMs = 60 * 60 * 1000;
    const remaining = lastClaimServerMs > 0 ? cooldownMs - (now - serverNow) : 0;
    console.log('[COOLDOWN DEBUG] userId=', userId, 'now=', now, 'lastClaimServerMs=', lastClaimServerMs, 'remaining=', remaining);

    if (remaining > 0) {
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        btnMoneda.disabled = true;
        btnMoneda.textContent = '+100';
        btnMoneda.classList.remove('reclamable');
        btnMoneda.style.opacity = '0.65';
        btnMoneda.style.cursor = 'not-allowed';
        if (timerMoneda) {
            timerMoneda.textContent = `${mins}m ${secs}s`;
            timerMoneda.classList.remove('reclamable');
        }
    } else {
        btnMoneda.disabled = false;
        btnMoneda.innerHTML = '<i class="fa-solid fa-gift"></i> +100';
        btnMoneda.classList.add('reclamable');
        btnMoneda.style.opacity = '1';
        btnMoneda.style.cursor = 'pointer';
        if (timerMoneda) {
            timerMoneda.textContent = 'Reclamable';
            timerMoneda.classList.add('reclamable');
        }
    }
}

function animarReclamoMonedas() {
    const monedasEl = document.getElementById('monedas');
    const btnMoneda = document.querySelector('.btn-moneda');
    if (monedasEl) {
        monedasEl.classList.remove('monedas-sumando');
        void monedasEl.offsetWidth;
        monedasEl.classList.add('monedas-sumando');
        setTimeout(() => monedasEl.classList.remove('monedas-sumando'), 700);
    }
    if (btnMoneda) {
        btnMoneda.classList.remove('reclamar-animacion');
        void btnMoneda.offsetWidth;
        btnMoneda.classList.add('reclamar-animacion');
        setTimeout(() => btnMoneda.classList.remove('reclamar-animacion'), 700);
    }
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
    if (tab === 'coleccion') renderizarColeccion('todas', { campo: 'nombre', valor: '' }, obtenerOrdenActual());
}

function obtenerLogosSobre(sobre) {
    return sobre.regiones.map(region => `cartas/${region}/logo_${region}.png`);
}

function obtenerLogoSobre(sobre) {
    if (sobre.tipo === 'generic') return 'cartas/logo_generic.png';
    const logos = obtenerLogosSobre(sobre);
    return logos[0] || '';
}

function obtenerPrecioSobre(sobre) {
    const precioBase = Number(sobre.precio || 0);
    const oferta = Number(sobre.oferta || 0);
    if (oferta <= 0) return precioBase;
    return Math.max(1, Math.round(precioBase * (1 - oferta / 100)));
}

function actualizarSrcConTransicion(img, src, alt) {
    if (!img) return;
    if (!img.dataset.src) {
        img.src = src;
        img.alt = alt;
        img.dataset.src = src;
        return;
    }
    if (img.dataset.src === src && img.alt === alt) return;
    img.classList.add('cambiando');
    setTimeout(() => {
        img.src = src;
        img.alt = alt;
        img.dataset.src = src;
        img.classList.remove('cambiando');
    }, 180);
}

function obtenerImagenSobre(sobre) {
    const cartasPermitidas = cartasData.filter(carta => sobre.regiones.includes(carta.region));
    return cartasPermitidas[0]?.imagen || '';
}

function renderizarBannersGacha() {
    const contenedor = document.getElementById('gacha-banner');
    if (!contenedor) return;
    const banners = bannersConfigurados.length > 0 ? bannersConfigurados : [{ titulo: 'Gacha disponible', texto: 'Elige un sobre disponible.' }];
    contenedor.innerHTML = banners.map(banner => `
        <div class="gacha-banner-item">
            <strong>${banner.titulo}</strong>
            <span>${banner.texto}</span>
        </div>
    `).join('');
}

function renderizarGachaSobres() {
    const contenedor = document.getElementById('gacha-sobres');
    if (!contenedor) return;

    contenedor.innerHTML = obtenerSobresDisponibles().map(sobre => {
        const logo = obtenerLogoSobre(sobre);
        const oferta = Number(sobre.oferta || 0);
        return `
            <button class="gacha-sobre ${sobre.tipo === sobreSeleccionado ? 'active' : ''} region-${sobre.tipo}" data-tipo="${sobre.tipo}">
                ${logo ? `<img class="gacha-sobre-logo" src="${logo}" alt="${sobre.nombre}">` : `<i class="${sobre.iconoFa || sobre.icono} gacha-sobre-icono"></i>`}
                <span class="gacha-sobre-nombre">${sobre.nombre}</span>
                <span class="gacha-sobre-precio"><i class="fa-solid fa-coins"></i> ${obtenerPrecioSobre(sobre)}</span>
                ${oferta > 0 ? `<span class="gacha-oferta">${oferta}% OFF</span>` : ''}
            </button>
        `;
    }).join('');

    contenedor.querySelectorAll('.gacha-sobre').forEach(btn => {
        btn.addEventListener('click', () => seleccionarSobre(btn.dataset.tipo));
    });

    actualizarPresentacionGacha();
}

function seleccionarSobre(tipo) {
    sobreSeleccionado = tipo;
    const info = document.getElementById('gacha-info-detalle');
    if (info) info.classList.remove('active');
    renderizarGachaSobres();
}

function iniciarRotacionLogoGenerico() {
    if (logoGachaTimer) clearInterval(logoGachaTimer);
    logoGachaTimer = null;
}

function actualizarPresentacionGacha() {
    const sobre = obtenerSobre(sobreSeleccionado);
    const preview = document.getElementById('gacha-preview');
    const img = document.getElementById('gacha-preview-img');
    const icono = document.getElementById('gacha-preview-icono');
    const precio = document.getElementById('gacha-precio');
    const titulo = document.getElementById('gacha-titulo');
    const descripcion = document.getElementById('gacha-descripcion');
    const btnAbrir = document.getElementById('btn-abrir-gacha');
    const imagen = obtenerImagenSobre(sobre);
    const logo = obtenerLogoSobre(sobre);
    const logoSrc = logo || imagen;

    if (preview) {
        preview.className = `gacha-preview region-${sobre.tipo}`;
    }
    if (img) {
        actualizarSrcConTransicion(img, logoSrc, `${sobre.nombre} logo`);
        img.style.display = logoSrc ? 'block' : 'none';
    }
    if (icono) {
        icono.className = sobre.iconoFa || sobre.icono;
        icono.style.display = logoSrc ? 'none' : 'block';
    }
    if (precio) {
        const oferta = Number(sobre.oferta || 0);
        const precioBase = Number(sobre.precio || 0);
        const precioFinal = obtenerPrecioSobre(sobre);
        if (oferta > 0) {
            precio.innerHTML = `<span class="gacha-precio-tachado"><i class="fa-solid fa-coins"></i> ${precioBase}</span> <span class="gacha-precio-final"><i class="fa-solid fa-coins"></i> ${precioFinal}</span> <span class="gacha-oferta">${oferta}% OFF</span>`;
        } else {
            precio.innerHTML = `<i class="fa-solid fa-coins"></i> ${precioFinal}`;
        }
    }
    if (titulo) titulo.textContent = sobre.nombre;
    if (descripcion) descripcion.textContent = sobre.descripcion;
    if (btnAbrir) btnAbrir.dataset.tipo = sobre.tipo;
}

function toggleInformacionGacha() {
    const sobre = obtenerSobre(sobreSeleccionado);
    const info = document.getElementById('gacha-info-detalle');
    if (!info) return;
    info.classList.toggle('active');
    info.innerHTML = info.classList.contains('active') ? sobre.informacion.replace(/\n/g, '<br>') : '';
}

function comprarSobre(region, precio) {
    if (monedas < precio) {
        const btn = document.querySelector(`.btn-gacha[data-tipo="${region}"]`);
        if (btn) {
            btn.classList.add('error-shake');
            setTimeout(() => btn.classList.remove('error-shake'), 300);
        }
        return;
    }

    if (!supabaseEnabled || !usuarioActual) {
        monedas -= precio;
        actualizarMonedas();
        guardarLocalStorage();

        const cartas = generarCartasRegion(region);
        mostrarAnimacionSobre(cartas, region);
        return;
    }

    const cartas = generarCartasRegion(region);
    const sobre = obtenerSobre(region);

    db.openPack(supabaseClient, usuarioActual.id, region, sobre.precio, sobre.regiones)
        .then(result => {
            if (!result?.ok) {
                console.error('[ECON] Error abriendo paquete:', result?.mensaje);
                return;
            }
            monedas = result.nuevo_saldo;
            actualizarMonedas();

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
            mostrarAnimacionSobre(cartas, region);
            actualizarEstadisticas();
            guardarLocalStorage();
        })
        .catch(err => {
            console.error('[ECON] Excepción abriendo paquete:', err);
            mostrarErrorSupabase('Error al procesar el paquete');
        });
}

function generarCartasRegion(region) {
    const cartas = [];
    const sobre = obtenerSobre(region);
    const regionesPermitidas = sobre.regiones || [region];
    const cartasRegion = cartasData.filter(c => regionesPermitidas.includes(c.region));
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
    const modalTitulo = modal.querySelector('h2');
    const ayuda = document.getElementById('gacha-apertura-ayuda');
    if (modalTitulo) modalTitulo.textContent = `¡Abre tu ${obtenerSobre(region).nombre}!`;
    if (ayuda) ayuda.textContent = 'Hacé click en cada carta para revelarla.';
    const preview = document.getElementById('gacha-preview');
    if (preview) {
        if (previewDestelloTimer) clearTimeout(previewDestelloTimer);
        preview.classList.remove('animacion-activa');
        void preview.offsetWidth;
        preview.classList.add('animacion-activa');
        previewDestelloTimer = setTimeout(() => preview.classList.remove('animacion-activa'), 1200);
    }
    contenedor.innerHTML = '';

    cartas.forEach((carta, index) => {
        const div = document.createElement('button');
        div.type = 'button';
        div.className = 'carta-sobre';
        div.dataset.cartaId = carta.id;
        div.dataset.revealed = 'false';
        div.style.animationDelay = `${index * 0.04}s`;
        div.innerHTML = `
            <img class="carta-sobre-img" src="cartas/PORTADA.png" alt="Carta oculta">
            <span class="carta-sobre-revelar">Click</span>
        `;
        div.addEventListener('click', () => {
            if (div.dataset.revealed === 'true') return;
            div.dataset.revealed = 'true';
            div.classList.add('girando');
            setTimeout(() => {
                const img = div.querySelector('.carta-sobre-img');
                const label = div.querySelector('.carta-sobre-revelar');
                if (img) img.src = carta.imagen || 'cartas/PORTADA.png';
                if (label) label.textContent = 'Revelada';
                div.classList.remove('girando');
                div.classList.add('revelada');
                div.classList.add('region-' + carta.region);
            }, 220);
        });
        contenedor.appendChild(div);
    });

    modal.classList.add('active');
}

function cerrarModales() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    const preview = document.getElementById('gacha-preview');
    if (preview) preview.classList.remove('animacion-activa');
}

const RAREZA_ORDEN = {
    legendaria: 0,
    epica: 1,
    rara: 2,
    poco_comun: 3,
    comun: 4
};

function renderizarColeccion(filtro = 'todas', filtroAvanzado = { campo: 'nombre', valor: '' }, orden = { tipo: 'defecto', direccion: 'asc' }) {
    const grid = document.getElementById('coleccion-grid');
    if (!grid) return;

    const manifestOrder = {};
    cartasData.forEach((carta, index) => {
        manifestOrder[carta.id] = index;
    });

    let items = cartasData.map(carta => {
        const guardada = coleccion[carta.id];
        return {
            carta: {
                id: carta.id,
                nombre: carta.nombre,
                region: carta.region,
                raza: carta.raza || '—',
                categoria: carta.categoria || 'personaje',
                rareza: carta.rareza || 'comun',
                valor: carta.valor,
                imagen: carta.imagen,
                descripcion: carta.descripcion || '',
                interprete: carta.interprete || ''
            },
            cantidad: guardada ? guardada.cantidad : 0,
            desbloqueada: !!guardada
        };
    });

    if (filtro !== 'todas') items = items.filter(i => i.carta.region === filtro);
    const { campo, valor } = filtroAvanzado;
    if (valor.trim()) {
        const q = valor.trim().toLowerCase();
        items = items.filter(i => {
            if (campo === 'nombre') return (i.carta.nombre || '').toLowerCase().includes(q);
            if (campo === 'rareza') return (i.carta.rareza || '').toLowerCase().includes(q);
            if (campo === 'region') return (i.carta.region || '').toLowerCase().includes(q);
            if (campo === 'raza') return (i.carta.raza || '').toLowerCase().includes(q);
            if (campo === 'categoria') return (i.carta.categoria || '').toLowerCase().includes(q);
            return true;
        });
    }

    const { tipo, direccion } = orden;

    items.sort((a, b) => {
        if (!a.desbloqueada && b.desbloqueada) return 1;
        if (a.desbloqueada && !b.desbloqueada) return -1;

        let comp = 0;
        if (tipo === 'rareza') {
            comp = (RAREZA_ORDEN[a.carta.rareza] ?? 99) - (RAREZA_ORDEN[b.carta.rareza] ?? 99);
        } else if (tipo === 'alfabetico') {
            comp = (a.carta.nombre || '').localeCompare(b.carta.nombre || '');
        } else {
            comp = (manifestOrder[a.carta.id] ?? 999999) - (manifestOrder[b.carta.id] ?? 999999);
        }
        return direccion === 'desc' ? -comp : comp;
    });

    if (items.length === 0) {
        grid.innerHTML = '<p class="sin-cartas">No hay cartas que coincidan con el filtro.<br>Abre sobres en la pestaña Tienda para comenzar.</p>';
        return;
    }

    grid.innerHTML = items.map(({ carta, cantidad, desbloqueada }) => {
        const claseRegion = 'region-' + carta.region;
        const claseRareza = 'rareza-' + (carta.rareza || 'comun');
        const claseBloqueada = desbloqueada ? '' : ' bloqueada';
        const rutaImagen = carta.imagen || '';
        const nombreRareza = carta.rareza ? (RAREZA_NOMBRES[carta.rareza] || carta.rareza) : '';
        const bgRareza = carta.rareza ? (RAREZA_COLORS[carta.rareza] || '') : '';
        return `
            <div class="carta-item ${claseRegion} ${claseRareza}${claseBloqueada}" data-carta-id="${carta.id}">
                ${nombreRareza ? `<span class="rareza-badge" style="background:${bgRareza}; color:#fff;">${nombreRareza}</span>` : ''}
                <img src="${rutaImagen}" alt="${carta.nombre}" 
                     onerror="this.style.display='none'; this.parentElement.querySelector('.carta-placeholder').style.display='flex';"
                     loading="lazy">
                <div class="carta-placeholder" style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:50px; background:rgba(0,0,0,0.3);"><i class="fa-solid fa-gem"></i></div>
                ${desbloqueada ? `<div class="carta-cantidad">x${cantidad}</div>` : ''}
                <div class="carta-nombre">${carta.nombre}</div>
            </div>
        `;
    }).join('');

    grid.querySelectorAll('.carta-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            const cartaId = this.dataset.cartaId;
            const cartaElement = this;
            if (cartaElement.classList.contains('bloqueada')) return;
            mostrarDetalle(cartaId);
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
    const categoriaEl = document.getElementById('carta-detalle-categoria');
    const razaEl = document.getElementById('carta-detalle-raza');
    const rarezaEl = document.getElementById('carta-detalle-rareza');
    const valorEl = document.getElementById('carta-detalle-valor');
    const descripcionEl = document.getElementById('carta-detalle-descripcion');
    const interpreteEl = document.getElementById('carta-detalle-interprete');
    if (regionEl) regionEl.textContent = REGION_NOMBRES[carta.region] || carta.region;
    if (categoriaEl) categoriaEl.textContent = CATEGORIA_NOMBRES[carta.categoria] || carta.categoria || '—';
    if (razaEl) razaEl.textContent = carta.raza || '—';
    if (rarezaEl) {
        const key = carta.rareza || 'comun';
        const label = RAREZA_NOMBRES[key] || key;
        const bg = RAREZA_COLORS[key] || '#6b7280';
        const style = bg.includes('gradient') ? `background:${bg}; color:#1a1200; font-weight:900;` : `background:${bg}; color:#fff;`;
        rarezaEl.innerHTML = `<span class="rareza-pill ${'rareza-pill-' + key}" style="${style}">${label}</span>`;
    }
    if (valorEl) valorEl.textContent = carta.valor != null ? `${carta.valor} monedas` : '—';
    if (descripcionEl) descripcionEl.textContent = carta.descripcion || '—';
    if (interpreteEl) interpreteEl.textContent = carta.interprete || '—';

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
    modalCarta.dataset.rareza = carta.rareza || 'comun';
    if (panelVentaGlobal) {
        panelVentaGlobal.classList.remove('open');
    }
    modalCarta.classList.add('active');
}

function obtenerOrdenActual() {
    const selectOrdenTipo = document.getElementById('orden-tipo');
    const selectOrdenDireccion = document.getElementById('orden-direccion');
    return {
        tipo: selectOrdenTipo ? selectOrdenTipo.value : 'defecto',
        direccion: selectOrdenDireccion ? selectOrdenDireccion.value : 'asc'
    };
}

function aplicarFiltro(filtro) {
    document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.filtro-btn[data-filtro="${filtro}"]`);
    if (btn) btn.classList.add('active');
    renderizarColeccion(filtro, { campo: 'nombre', valor: '' }, obtenerOrdenActual());
}

function mostrarAuthError(msg) {
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.textContent = msg;
}

function setUsuario(user) {
    lastClaimServerMs = 0;
    usuarioActual = user;
    const overlay = document.getElementById('auth-overlay');
    const authForm = document.getElementById('auth-form');
    const profileTrigger = document.getElementById('profile-trigger');
    const profileMenu = document.getElementById('profile-menu');
    const profileUsername = document.getElementById('profile-username');

    if (user) {
        overlay.style.display = 'none';
        authForm.style.display = 'none';
        actualizarEstadoPerfil();
        if (profileTrigger) profileTrigger.style.display = 'flex';
        if (profileMenu && profileUsername) {
            profileUsername.textContent = 'Cargando...';
        }
cargarDatos().then(() => {
             actualizarMonedas();
             actualizarEstadisticas();
             renderizarColeccion('todas', { campo: 'nombre', valor: '' }, obtenerOrdenActual());
         }).catch(err => {
             console.error('[AUTH] Error al cargar datos:', err);
         });
         actualizarUsernameDesdePerfil().catch(err => {
             console.error('[AUTH] Error al cargar username:', err);
         });
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
         renderizarColeccion('todas', { campo: 'nombre', valor: '' }, obtenerOrdenActual());
     }
}

function actualizarEstadoPerfil() {
    const usernameEl = document.getElementById('profile-username');
    const btnEdit = document.getElementById('btn-edit-profile');
    const btnPass = document.getElementById('btn-change-password');
    const btnLogout = document.getElementById('profile-logout');
    const btnLogin = document.getElementById('profile-login');
    if (!usernameEl) return;
    usernameEl.textContent = usuarioActual?.username || 'Usuario';
    if (btnEdit) btnEdit.style.display = 'block';
    if (btnPass) btnPass.style.display = 'block';
    if (btnLogout) btnLogout.style.display = 'block';
    if (btnLogin) btnLogin.style.display = 'none';
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

function mostrarErrorSupabase(msg) {
    const el = document.getElementById('auth-error');
    if (el) el.textContent = msg;
}

function mostrarModoRegister() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        if (tab.dataset.auth === 'register') tab.classList.add('active');
        else tab.classList.remove('active');
    });
    const usernameField = document.getElementById('auth-username');
    const passwordField = document.getElementById('auth-password');
    const submitBtn = document.querySelector('.auth-submit');
    if (usernameField) usernameField.style.display = 'block';
    if (passwordField) passwordField.autocomplete = 'new-password';
    if (submitBtn) submitBtn.textContent = 'Registrarse';
}

function mostrarModoLogin() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        if (tab.dataset.auth === 'login') tab.classList.add('active');
        else tab.classList.remove('active');
    });
    const usernameField = document.getElementById('auth-username');
    const passwordField = document.getElementById('auth-password');
    const submitBtn = document.querySelector('.auth-submit');
    if (usernameField) usernameField.style.display = 'none';
    if (passwordField) passwordField.autocomplete = 'current-password';
    if (submitBtn) submitBtn.textContent = 'Entrar';
}

function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function onAuthSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('auth-username')?.value.trim() || '';
    const email = document.getElementById('auth-email')?.value.trim() || '';
    const password = document.getElementById('auth-password')?.value || '';
    const errorEl = document.getElementById('auth-error');
    const esRegister = document.querySelector('.auth-tab[data-auth="register"]').classList.contains('active');

    if (esRegister && !username) {
        errorEl.textContent = 'Ingresá un nombre de usuario';
        return;
    }
    if (!validarEmail(email)) {
        errorEl.textContent = 'Ingresá un correo válido';
        return;
    }
    if (!password) {
        errorEl.textContent = 'Ingresá una contraseña';
        return;
    }

    errorEl.textContent = 'Cargando...';
    procesarAuth(esRegister, username, email, password);
}

async function procesarAuth(esRegister, username, email, password) {
    const errorEl = document.getElementById('auth-error');
    try {
        const client = supabaseClient;
        if (!client) throw new Error('Supabase no configurado');
        if (esRegister) {
            if (!username) throw new Error('Ingresá un nombre de usuario');
            const result = await auth.signUp(client, email, password, username);
            console.log('[AUTH] signUp result:', result);
            if (!result.user) throw new Error('No se pudo crear el usuario');
            setUsuario(result.user);
        } else {
            if (!validarEmail(email)) throw new Error('Ingresá un correo válido');
            const result = await auth.signIn(client, email, password);
            console.log('[AUTH] signIn result:', result);
            setUsuario(result.user);
        }
    } catch (err) {
        console.error('[AUTH] Error completo:', err);
        errorEl.textContent = err.message || 'Error de autenticación';
    }
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

    renderizarBannersGacha();
    renderizarGachaSobres();
    iniciarRotacionLogoGenerico();

    const btnAbrirGacha = document.getElementById('btn-abrir-gacha');
    if (btnAbrirGacha) {
        btnAbrirGacha.addEventListener('click', () => {
            if (!usuarioActual && supabaseEnabled && getClient()) {
                mostrarAuthError('Iniciá sesión primero');
                return;
            }
            const sobre = obtenerSobre(sobreSeleccionado);
            comprarSobre(sobre.tipo, obtenerPrecioSobre(sobre));
        });
    }

    const btnInfoGacha = document.getElementById('btn-info-gacha');
    if (btnInfoGacha) {
        btnInfoGacha.addEventListener('click', toggleInformacionGacha);
    }

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
    const timerMoneda = document.getElementById('moneda-timer');
    const btnBuscarFiltro = document.getElementById('btn-buscar-filtro');
    const inputFiltroValor = document.getElementById('filtro-valor');
    const selectFiltroTipo = document.getElementById('filtro-tipo');

    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!usuarioActual && supabaseEnabled && getClient()) {
                mostrarAuthError('Iniciá sesión primero');
                return;
            }
const filtro = btn.dataset.filtro;
             const campo = selectFiltroTipo ? selectFiltroTipo.value : 'nombre';
             const valor = inputFiltroValor ? inputFiltroValor.value : '';
             document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
             btn.classList.add('active');
             renderizarColeccion(filtro, { campo, valor }, obtenerOrdenActual());
         });
    });

if (btnBuscarFiltro && inputFiltroValor && selectFiltroTipo) {
         btnBuscarFiltro.addEventListener('click', () => {
             if (!usuarioActual && supabaseEnabled && getClient()) {
                 mostrarAuthError('Iniciá sesión primero');
                 return;
             }
             const filtroRegion = document.querySelector('.filtro-btn.active')?.dataset.filtro || 'todas';
             const campo = selectFiltroTipo.value;
             const valor = inputFiltroValor.value.trim();
             const selectOrdenTipo = document.getElementById('orden-tipo');
             const selectOrdenDireccion = document.getElementById('orden-direccion');
             const ordenTipo = selectOrdenTipo ? selectOrdenTipo.value : 'defecto';
             const ordenDireccion = selectOrdenDireccion ? selectOrdenDireccion.value : 'asc';
             renderizarColeccion(filtroRegion, { campo, valor }, { tipo: ordenTipo, direccion: ordenDireccion });
         });
     }

     const selectOrdenTipo = document.getElementById('orden-tipo');
     const selectOrdenDireccion = document.getElementById('orden-direccion');
     if (selectOrdenTipo && selectOrdenDireccion) {
         const aplicarOrden = () => {
             if (!usuarioActual && supabaseEnabled && getClient()) {
                 mostrarAuthError('Iniciá sesión primero');
                 return;
             }
             const filtroRegion = document.querySelector('.filtro-btn.active')?.dataset.filtro || 'todas';
             const campo = selectFiltroTipo ? selectFiltroTipo.value : 'nombre';
             const valor = inputFiltroValor ? inputFiltroValor.value.trim() : '';
             const ordenTipo = selectOrdenTipo.value;
             const ordenDireccion = selectOrdenDireccion.value;
             renderizarColeccion(filtroRegion, { campo, valor }, { tipo: ordenTipo, direccion: ordenDireccion });
         };
         selectOrdenTipo.addEventListener('change', aplicarOrden);
         selectOrdenDireccion.addEventListener('change', aplicarOrden);
     }
    
const btnLimpiarFiltro = document.getElementById('btn-limpiar-filtro');
     if (btnLimpiarFiltro && inputFiltroValor && selectFiltroTipo) {
         btnLimpiarFiltro.addEventListener('click', () => {
             if (!usuarioActual && supabaseEnabled && getClient()) {
                 mostrarAuthError('Iniciá sesión primero');
                 return;
             }
             inputFiltroValor.value = '';
             if (selectFiltroTipo.value !== 'nombre') {
                 selectFiltroTipo.value = 'nombre';
             }
             const filtroRegion = document.querySelector('.filtro-btn.active')?.dataset.filtro || 'todas';
             renderizarColeccion(filtroRegion, { campo: 'nombre', valor: '' }, obtenerOrdenActual());
         });
     }

    if (btnMoneda) {
        btnMoneda.addEventListener('click', async () => {
            if (!usuarioActual && supabaseEnabled && getClient()) {
                mostrarAuthError('Iniciá sesión primero');
                return;
            }
            if (btnMoneda.disabled) return;

            if (!supabaseEnabled || !usuarioActual) {
                monedas += 100;
                actualizarMonedas();
                animarReclamoMonedas();
                lastClaimServerMs = Date.now();
                guardarUltimoReclamoLocal(lastClaimServerMs, usuarioActual.id);
                actualizarBotonMoneda();
                guardarLocalStorage();
                return;
            }

            try {
                const result = await db.claimDailyCoins(supabaseClient, usuarioActual.id);
                if (result && result.obtenido > 0) {
                    monedas = result.nuevo_saldo;
                    actualizarMonedas();
                    animarReclamoMonedas();
                    const claimUpdatedAt = result.updated_at || result.ultima_actualizacion;
                    if (typeof claimUpdatedAt === 'string') {
                        lastClaimServerMs = new Date(claimUpdatedAt).getTime() || Date.now();
                    } else {
                        lastClaimServerMs = Date.now();
                    }
                    guardarUltimoReclamoLocal(lastClaimServerMs, usuarioActual.id);
                } else {
                    if (typeof result?.proxima_en === 'number' && result.proxima_en > 0) {
                        lastClaimServerMs = Date.now() - (3600000 - result.proxima_en * 1000);
                        guardarUltimoReclamoLocal(lastClaimServerMs, usuarioActual.id);
                    }
                }
                console.log('[COOLDOWN CLAIM] userId=', usuarioActual?.id || 'local', 'result:', result, 'lastClaimServerMs:', lastClaimServerMs);
                actualizarBotonMoneda();
            } catch (err) {
                console.error('[ECON] Error reclamando monedas:', err);
                mostrarErrorSupabase('Error al reclamar la recompensa');
            }
        });
        if (monedaTimer) clearInterval(monedaTimer);
        monedaTimer = setInterval(actualizarBotonMoneda, 1000);
        actualizarBotonMoneda();
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
             renderizarColeccion('todas', { campo: 'nombre', valor: '' }, obtenerOrdenActual());
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
            usuarioActual = null;
            supabaseEnabled = true;
            const client = getClient();
            if (client) {
                supabaseClient = client;
            }
            setUsuario(null);
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
    await cargarConfiguracionSobres();

    if (supabaseEnabled) {
        const session = await auth.getSession(supabaseClient);
        usuarioActual = session?.user ?? null;
    }

    inicializarUI();
    setUsuario(usuarioActual);
});
