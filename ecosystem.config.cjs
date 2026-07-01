module.exports = {
  apps: [
    {
      name: "capitaldesk",
      cwd: "D:/apps/capital-desk",
      script: "C:/Program Files/nodejs/node.exe",
      args: "node_modules/next/dist/bin/next start -p 3000 --hostname 0.0.0.0",

      // --- Estabilidad de memoria (servidor con 32 GB de RAM) ---
      // Reciclado de seguridad: si por una fuga la app supera 6 GB, PM2 la
      // reinicia LIMPIO (antes del techo de 8 GB), en vez de caerse de golpe.
      max_memory_restart: "6G",

      // Tolerancia: que PM2 la siga levantando y NO la deje "stopped" si se
      // reinicia varias veces seguidas.
      autorestart: true,
      max_restarts: 50,
      min_uptime: "20s",
      restart_delay: 3000,

      env: {
        NODE_ENV: "production",
        // Techo de heap de Node = 8 GB (el default ~4 GB era lo que la tumbaba).
        // Con 32 GB físicos sobra margen.
        NODE_OPTIONS: "--max-old-space-size=8192",
      },
    },

    // --- Bot de Telegram para reportar novedades ---
    // Proceso aparte que conversa con el cliente y registra la novedad llamando
    // a /api/integrations/novedades de la app. Lee su configuración del archivo
    // .env (TELEGRAM_BOT_TOKEN, NOVEDADES_INTAKE_URL, NOVEDADES_INTAKE_SECRET).
    {
      name: "novedades-bot",
      cwd: "D:/apps/capital-desk",
      script: "C:/Program Files/nodejs/node.exe",
      args: "node_modules/tsx/dist/cli.mjs scripts/telegram-novedades-bot.ts",

      autorestart: true,
      max_restarts: 50,
      min_uptime: "20s",
      restart_delay: 3000,
      max_memory_restart: "500M",

      env: {
        NODE_ENV: "production",
      },
    },

    // --- Bot de Telegram de CONSULTA de tramas (P20/P60) ---
    // Proceso aparte: recibe un código de bus y responde la última P20/P60
    // consultando /api/integrations/tramas-last. Lee del .env:
    // TELEGRAM_TRAMAS_BOT_TOKEN, TRAMAS_QUERY_URL, NOVEDADES_INTAKE_SECRET.
    {
      name: "tramas-bot",
      cwd: "D:/apps/capital-desk",
      script: "C:/Program Files/nodejs/node.exe",
      args: "node_modules/tsx/dist/cli.mjs scripts/telegram-tramas-bot.ts",

      autorestart: true,
      max_restarts: 50,
      min_uptime: "20s",
      restart_delay: 3000,
      max_memory_restart: "500M",

      env: {
        NODE_ENV: "production",
      },
    },

    // --- Procesador CONTINUO de tramas ---
    // Mantiene al día la tabla BusTelemetryState (última posición / lastSeenAt que
    // muestra el módulo de Telemetría). Sin esto, las tramas crudas llegan pero el
    // estado por bus queda congelado. Adaptativo: se pone al día y luego descansa.
    {
      name: "tramas-processor",
      cwd: "D:/apps/capital-desk",
      script: "C:/Program Files/nodejs/node.exe",
      args: "node_modules/tsx/dist/cli.mjs scripts/tramas-processor.ts",

      autorestart: true,
      max_restarts: 50,
      min_uptime: "20s",
      restart_delay: 3000,
      max_memory_restart: "1G",

      env: {
        NODE_ENV: "production",
      },
    },

    // --- Bot de Telegram de CONSULTA de preventivos ---
    // Recibe un código de bus y responde su último preventivo consultando
    // /api/integrations/preventivo-last. Lee del .env:
    // TELEGRAM_PREVENTIVOS_BOT_TOKEN, PREVENTIVO_QUERY_URL, NOVEDADES_INTAKE_SECRET.
    {
      name: "preventivos-bot",
      cwd: "D:/apps/capital-desk",
      script: "C:/Program Files/nodejs/node.exe",
      args: "node_modules/tsx/dist/cli.mjs scripts/telegram-preventivos-bot.ts",

      autorestart: true,
      max_restarts: 50,
      min_uptime: "20s",
      restart_delay: 3000,
      max_memory_restart: "500M",

      env: {
        NODE_ENV: "production",
      },
    },

    // --- Bot de Telegram de CARGA de preventivos ---
    // El técnico manda el código del bus y sube evidencias/voltajes/checks con
    // botones, marca inicio/fin y cierra generando el certificado. Habla con
    // /api/integrations/preventivo-bot. Lee del .env:
    // TELEGRAM_PREVENTIVO_CARGA_TOKEN, PREVENTIVO_BOT_URL, NOVEDADES_INTAKE_SECRET.
    {
      name: "preventivo-carga-bot",
      cwd: "D:/apps/capital-desk",
      script: "C:/Program Files/nodejs/node.exe",
      args: "node_modules/tsx/dist/cli.mjs scripts/telegram-preventivo-carga-bot.ts",

      autorestart: true,
      max_restarts: 50,
      min_uptime: "20s",
      restart_delay: 3000,
      max_memory_restart: "500M",

      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
