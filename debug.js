/**
 * @file debug.js
 * Módulo de trazado e instrumentación.
 * Cambiar DEBUG_MODE a 'false' para apagar el modo debug por completo.
 */

const DEBUG_MODE = false; // <--- Cambiar a true para reactivar el debug

const fs = require('fs');
const path = require('path');

class Debugger {
    constructor() {
        this.enabled = DEBUG_MODE;
        this.startTime = process.hrtime.bigint();
        this.logPath = path.join(__dirname, 'debug.log');

        if (this.enabled) {
            try {
                fs.writeFileSync(this.logPath, `--- DEBUG SESSION STARTED: ${new Date().toISOString()} ---\n`);
            } catch (e) {
                console.error('No se pudo inicializar el archivo debug.log:', e);
            }
        }
    }

    /**
     * Devuelve si el modo debug está activo.
     */
    isDebugEnabled() {
        return this.enabled;
    }

    /**
     * Devuelve el tiempo transcurrido en milisegundos.
     */
    getElapsedMs() {
        const now = process.hrtime.bigint();
        const diffInNanoseconds = now - this.startTime;
        return (Number(diffInNanoseconds) / 1e6).toFixed(2);
    }

    /**
     * Imprime y guarda una marca de tiempo con mensaje contextual si está activo.
     */
    log(tag, message, payload = null) {
        if (!this.enabled) return;

        const timestamp = this.getElapsedMs();
        const formattedPayload = payload ? ` | DATA: ${JSON.stringify(payload)}` : '';
        const logLine = `[DEBUG +${timestamp}ms] [${tag}] ${message}${formattedPayload}`;

        console.log(logLine);

        fs.appendFile(this.logPath, logLine + '\n', () => {});
    }
}

module.exports = new Debugger();