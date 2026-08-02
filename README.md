Documento de Especificación Funcional y Técnica
A. Objetivos del Sistema

    Proveer un banner de escritorio flotante, minimalista, translúcido y siempre visible (alwaysOnTop).

    Simular una consola de comandos mediante la proyección fluida de textos informativos y animaciones basadas en arte ASCII estructurado en cuadros (frames).

    Permitir una interfaz de configuración visual avanzada (#settings-panel) con soporte para temas estéticos (zen, retro, neon, etc.), control de opacidad y sincronización de lotes de datos locales o remotos.

B. Límites y Restricciones (The Edges)

    Plataforma: Diseñado nativamente para escritorios Windows, macOS y Linux mediante el framework Electron.

    Interfaz: Ventana sin bordes (frameless) con transparencia de fondo acelerada por hardware.

    Alcance Excluido: No es una aplicación cliente-servidor web pesada ni almacena datos en bases de datos relacionales externas; todo el ciclo de vida de los datos opera localmente mediante archivos JSON y llamadas HTTP directas.

C. Entradas y Salidas

    Entradas (Inputs):

        Archivo de configuración local (config.json) ubicado en el directorio de usuario (userData) o de desarrollo.

        Lotes de animación ASCII estáticos o dinámicos remotos obtenidos mediante peticiones HTTP asíncronas (net.request).

        Interacciones directas del usuario vía ratón y teclado (ajustes de opacidad, cambio de temas, selección de fuentes, arrastre de ventana).

    Salidas (Outputs):

        Renderizado gráfico de la consola ASCII en la ventana flotante del escritorio.

        Persistencia automática de estados de configuración y coordenadas geométricas de la ventana en disco local.

4. Diagrama de Flujo de Procesos Críticos (Sintaxis Mermaid)

A continuación, se detalla el diagrama de flujo completo que describe el ciclo de arranque, la gestión de configuración y el bucle de renderizado de animaciones ASCII:
Fragmento de código

graph TD
    Start([Inicio de Aplicación: app.whenReady]) --> LoadConfig[Cargar configuración inicial desde disco config.json]
    LoadConfig --> CheckConfig{¿Existe config.json?}
    
    CheckConfig -- Sí --> ParseConfig[Parsear JSON y fusionar con valores base]
    CheckConfig -- No --> DefaultConfig[Establecer configuración por defecto y lote LOTE_DEFAULT]
    
    ParseConfig --> CreateWindow[Crear BrowserWindow sin bordes y transparente]
    DefaultConfig --> CreateWindow
    
    CreateWindow --> LoadUI[Cargar interfaz index.html y vincular preload.js]
    LoadUI --> IPCReady[Registrar canales IPC seguros de comunicación]
    
    IPCReady --> MainLoop{Estado del Sistema en Ejecución}

    %% Subproceso de Sincronización Remota / Local
    MainLoop -->|Solicitud Sincronización| RemoteSync[Petición HTTP asíncrona a URL Lote Remoto]
    RemoteSync --> CheckNet{¿Respuesta HTTP Exitosa?}
    CheckNet -- Sí --> UpdateJSON[Actualizar lote activo en memoria]
    CheckNet -- No --> FallbackLocal[Mantener lote local de respaldo y registrar log de error]
    
    %% Subproceso de Guardado Configuración (Debounced)
    MainLoop -->|Cambio de Tema / Opacidad / Posición| TriggerDebounce[Activar temporizador debounce de 300ms]
    TriggerDebounce --> SaveDisk[Escribir estado actualizado en config.json]

    %% Subproceso de Renderizado de Consola ASCII
    MainLoop --> RenderEngine[Motor de Renderizado ASCII en UI]
    RenderEngine --> EvalType{¿Tipo de Frame?}
    EvalType -- Texto Informativo / Lectura --> HighDelay[Exhibir de 4.0s a 5.0s por frame]
    EvalType -- Animación Gráfica --> LowDelay[Exhibir delay corto de 90ms a 120ms]
    
    HighDelay --> RenderEngine
    LowDelay --> RenderEngine

    MainLoop -->|Cierre de Aplicación| ExitApp([Cierre seguro app.quit])