/**
 * @file main.js
 * Optimizado para arranque instantáneo (.exe), IPC asíncrono y modo Debug configurable.
 */

const debug = require('./debug');
debug.log('MAIN', 'Iniciando ejecucion de Electron...');

const { app, BrowserWindow, ipcMain, screen, net } = require('electron');
const path = require('path');
const fs = require('fs');

// Configura aquí la URL remota fija por defecto
const DEFAULT_CONFIG_REMOTO_URL = "https://raw.githubusercontent.com/Gunther-Frager/bannercito-data/main/lote.json"; 

process.on('uncaughtException', (err) => { // Captura errores no controlados para evitar que la app se cierre inesperadamente
    debug.log('FATAL', `Excepción no controlada: ${err.message}`, { stack: err.stack });
});

process.on('unhandledRejection', (reason) => { // Captura promesas rechazadas no controladas para evitar que la app se cierre inesperadamente
    debug.log('FATAL', 'Promesa rechazada no controlada:', { reason });
});

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache'); // Desactiva el cache de shaders en disco para evitar problemas de GPU en algunos sistemas

function getConfigPath() { // Determina la ruta del archivo de configuración config.json
    if (!app.isPackaged) {
        const localPath = path.join(__dirname, 'config.json'); // Ruta de configuración en modo desarrollo
        if (fs.existsSync(localPath)) {
            debug.log('CONFIG', 'Usando config.json local de desarrollo');
            return localPath;
        }
    }
    const userDataPath = path.join(app.getPath('userData'), 'config.json'); // Ruta de configuración en modo producción
    debug.log('CONFIG', 'Usando config.json en userData:', { path: userDataPath });
    return userDataPath;
}

const configPath = getConfigPath();

const LOTE_DEFAULT = { //   Estructura de lote por defecto en caso de no existir config.json o estar corrupto
    version: 1,
    items: [
        {
            titulo: "SYSTEM // ONLINE_READY",
            texto: [
                "+---------------------------------------------------+",
                "| STATUS: MODO LOCAL / STANDBY                      |",
                "| L01: Operando con configuracion base local.       |",
                "| L02: Presiona [⚙] para configurar sincronizacion. |",
                "+---------------------------------------------------+"
            ]
        }
    ]
};

function getBaseConfig() { // Devuelve la configuración base por defecto en caso de no existir config.json o estar corrupto
    return {
        tema: "zen", 
        fontSize: 16,
        opacidad: 0.75,
        alwaysOnTop: false,
        clickThrough: false,
        onlineEnabled: false,
        urlLoteRemoto: DEFAULT_CONFIG_REMOTO_URL, 
        anchoVentana: 400,
        altoVentana: 190,
        posicionX: undefined,
        posicionY: undefined,
        lote: LOTE_DEFAULT,
        loteAnterior: LOTE_DEFAULT,
        ultimaSincronizacion: null
    };
}

let config = getBaseConfig();

async function cargarConfiguracionInicialAsync() {
    debug.log('CONFIG', 'Iniciando lectura de archivo de configuracion...');
    const tStart = Date.now();
    try {
        const data = await fs.promises.readFile(configPath, 'utf8');
        const parsed = JSON.parse(data);
        
        config = { ...config, ...parsed };

        if (!config.urlLoteRemoto || config.urlLoteRemoto.trim() === "") {
            config.urlLoteRemoto = DEFAULT_CONFIG_REMOTO_URL;
        }
        // Validación de lote: Si no existe o está vacío, se restaura desde loteAnterior o se asigna el LOTE_DEFAULT
        if (!config.lote || !Array.isArray(config.lote.items) || config.lote.items.length === 0) {
            config.lote = (config.loteAnterior && Array.isArray(config.loteAnterior.items) && config.loteAnterior.items.length > 0)
                ? config.loteAnterior
                : LOTE_DEFAULT;
        }
        
        debug.log('CONFIG', `Configuracion cargada con exito en ${Date.now() - tStart}ms`);
    } catch (error) {
        debug.log('CONFIG', `No se encontro o fallo config.json (${error.code}). Creando archivo inicial por defecto.`);
        try {
            await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
            debug.log('CONFIG', 'Archivo config.json creado correctamente.');
        } catch (writeErr) {
            debug.log('ERROR', 'Error critico al escribir config.json inicial:', { error: writeErr.message });
        }
    }
}

let saveTimeout = null;
function guardarConfiguracionDiscoDebounced() { //  Guarda la configuración en disco con debounce para evitar escrituras frecuentes
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
            debug.log('CONFIG', 'Configuracion guardada en disco.');
        } catch (error) {
            debug.log('ERROR', 'Error al guardar configuracion en disco:', { error: error.message });
        }
    }, 300);
}

const MARGEN_SNAP = 25; // Margen en píxeles para el anclaje automático a los bordes de la pantalla

function aplicarAnclajeBordes(win) { // Aplica el anclaje automático a los bordes de la pantalla si la ventana está cerca de ellos
    if (!win || win.isDestroyed()) return;

    const [winX, winY] = win.getPosition();
    const [winW, winH] = win.getSize();

    const currentDisplay = screen.getDisplayNearestPoint({ x: winX + winW / 2, y: winY + winH / 2 });
    const { x: workX, y: workY, width: workW, height: workH } = currentDisplay.workArea;

    let targetX = winX;
    let targetY = winY;

    if (Math.abs(winX - workX) < MARGEN_SNAP) targetX = workX;
    else if (Math.abs((winX + winW) - (workX + workW)) < MARGEN_SNAP) targetX = workX + workW - winW;

    if (Math.abs(winY - workY) < MARGEN_SNAP) targetY = workY;
    else if (Math.abs((winY + winH) - (workY + workH)) < MARGEN_SNAP) targetY = workY + workH - winH;

    if (targetX !== winX || targetY !== winY) {
        win.setPosition(Math.round(targetX), Math.round(targetY));
        config.posicionX = Math.round(targetX);
        config.posicionY = Math.round(targetY);
        guardarConfiguracionDiscoDebounced();
    }
}

function createWindow() { // Crea la ventana principal de la aplicación con las configuraciones actuales
    debug.log('UI', 'Creando BrowserWindow...');

    if (config.posicionX === undefined || config.posicionY === undefined) {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        config.posicionX = Math.round((width - (config.anchoVentana || 400)) / 2);
        config.posicionY = Math.round((height - (config.altoVentana || 190)) / 2);
        debug.log('UI', 'Posiciones calculadas por defecto (Centro de pantalla):', { x: config.posicionX, y: config.posicionY });
    }

    const mainWindow = new BrowserWindow({
        width: config.anchoVentana || 400,
        height: config.altoVentana || 190,
        minWidth: 245,
        minHeight: 110,
        x: config.posicionX,
        y: config.posicionY,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: !!config.alwaysOnTop,
        type: 'toolbar',
        show: false,
        backgroundColor: '#00000000',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        }
    });

    if (config.alwaysOnTop) {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
    }

    if (debug.isDebugEnabled()) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    debug.log('UI', 'Cargando index.html en BrowserWindow...');
    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
        debug.log('UI', 'Evento ready-to-show emitido. Mostrando ventana principal.');
        mainWindow.show();
    });

    mainWindow.webContents.on('did-fail-load', (e, errorCode, errorDescription) => {
        debug.log('ERROR', 'Fallo la carga de la interfaz HTML:', { errorCode, errorDescription });
    });

    mainWindow.on('move', () => {
        if (!mainWindow.isDestroyed()) {
            const [x, y] = mainWindow.getPosition();
            if (config.posicionX !== x || config.posicionY !== y) {
                config.posicionX = x;
                config.posicionY = y;
                guardarConfiguracionDiscoDebounced();
            }
        }
    });

    mainWindow.on('moved', () => {
        aplicarAnclajeBordes(mainWindow);
        mainWindow.setIgnoreMouseEvents(!!config.clickThrough, { forward: true });
    });
}

app.whenReady().then(async () => { // Espera a que Electron esté listo antes de cargar la configuración y crear la ventana principal
    debug.log('LIFECYCLE', 'app.whenReady() resuelto.');
    await cargarConfiguracionInicialAsync();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    debug.log('LIFECYCLE', 'Todas las ventanas cerradas. Saliendo...');
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('obtener-config-inicial-async', async () => {
    debug.log('IPC', 'Solicitud IPC obtenida: obtener-config-inicial-async');
    return config;
});

// Solución al crash/freeze en Producción: Timeout explícito y manejo seguro de net.request
ipcMain.handle('sincronizar-remoto-ipc', async (event, url) => {
    return new Promise((resolve) => {
        let isResolved = false;
        
        const safeResolve = (data) => { // Garantiza que la promesa se resuelva solo una vez, evitando múltiples resoluciones en caso de timeout o error
            if (!isResolved) {
                isResolved = true;
                resolve(data);
            }
        };

        const timeoutId = setTimeout(() => {
            debug.log('SYNC', 'Timeout alcanzado al solicitar lote remoto.');
            safeResolve({ ok: false, error: 'Request timeout' });
        }, 8000); // 8 segundos max

        try {
            const requestUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
            const request = net.request(requestUrl);
            let responseData = '';

            request.on('response', (response) => {
                if (response.statusCode !== 200) {
                    clearTimeout(timeoutId);
                    debug.log('SYNC', `HTTP Status invalido: ${response.statusCode}`);
                    safeResolve({ ok: false, status: response.statusCode });
                    return;
                }

                response.on('data', (chunk) => {
                    responseData += chunk.toString('utf8');
                });

                response.on('end', () => {
                    clearTimeout(timeoutId);
                    try {
                        const json = JSON.parse(responseData);
                        safeResolve({ ok: true, data: json });
                    } catch (e) {
                        debug.log('SYNC', 'Error al parsear JSON recibido', { error: e.message });
                        safeResolve({ ok: false, error: 'JSON parse error' });
                    }
                });
            });

            request.on('error', (err) => {
                clearTimeout(timeoutId);
                debug.log('SYNC', 'Error de red en net.request:', { error: err.message });
                safeResolve({ ok: false, error: err.message });
            });

            request.end();
        } catch (err) {
            clearTimeout(timeoutId);
            debug.log('SYNC', 'Excepcion no controlada en net.request:', { error: err.message });
            safeResolve({ ok: false, error: err.message });
        }
    });
});

ipcMain.on('cerrar-app', () => {
    debug.log('IPC', 'Solicitud IPC obtenida: cerrar-app');
    app.quit();
});

ipcMain.on('guardar-config', (event, nuevaConfig) => {
    config = { ...config, ...nuevaConfig };
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
        win.setAlwaysOnTop(!!config.alwaysOnTop, config.alwaysOnTop ? 'screen-saver' : 'normal');
    }
    guardarConfiguracionDiscoDebounced();
});

ipcMain.handle('reset-config', async () => { // Resetea la configuración a los valores por defecto y elimina config.json si existe
    debug.log('CONFIG', 'Iniciando reseteo de configuracion...');
    try {
        if (fs.existsSync(configPath)) {
            await fs.promises.unlink(configPath);
            debug.log('CONFIG', 'Archivo config.json eliminado correctamente.');
        }
    } catch (e) {
        debug.log('ERROR', 'No se pudo eliminar config.json:', { error: e.message });
    }
    config = getBaseConfig();
    return config;
});

// IPC para ajustar el tamaño de la ventana a los valores estándar proporcionados, respetando los límites mínimos
ipcMain.on('ajustar-tamanio-estandar', (event, { anchoPx, altoPx }) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
        const targetWidth = Math.max(245, Math.round(anchoPx));
        const targetHeight = Math.max(110, Math.round(altoPx));

        const [currX, currY] = win.getPosition();
        const [currW, currH] = win.getSize();

        const display = screen.getDisplayNearestPoint({ x: currX + currW / 2, y: currY + currH / 2 });
        const { x: workX, y: workY, width: workW, height: workH } = display.workArea;

        const esIzquierda = (currX + currW / 2) < (workX + workW / 2);
        const esArriba = (currY + currH / 2) < (workY + workH / 2);

        let newX = currX;
        let newY = currY;

        if (!esIzquierda) newX = currX + (currW - targetWidth);
        if (!esArriba) newY = currY + (currH - targetHeight);

        win.setBounds({
            x: Math.round(newX),
            y: Math.round(newY),
            width: targetWidth,
            height: targetHeight
        });

        config.anchoVentana = targetWidth;
        config.altoVentana = targetHeight;
        config.posicionX = Math.round(newX);
        config.posicionY = Math.round(newY);
        guardarConfiguracionDiscoDebounced();

        win.setIgnoreMouseEvents(!!config.clickThrough, { forward: true });
    }
});

// IPC para reposicionar el cursor del mouse a coordenadas locales dentro de la ventana principal, convirtiéndolas a coordenadas globales de pantalla
ipcMain.on('reposicionar-cursor-elemento', (event, { localX, localY }) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
        const [winX, winY] = win.getPosition();
        const globalX = Math.round(winX + localX);
        const globalY = Math.round(winY + localY);
        event.sender.send('mover-cursor-pantalla', { globalX, globalY });
    }
});

//  IPC para habilitar o deshabilitar el click-through (ignorar eventos de mouse) en la ventana principal
ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
        win.setIgnoreMouseEvents(!!ignore, { forward: true });
    }
});