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
  ],
};
