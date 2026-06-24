module.exports = {
  apps: [
    {
      name: "capitaldesk",
      cwd: "D:/apps/capital-desk",
      script: "C:/Program Files/nodejs/node.exe",
      args: "node_modules/next/dist/bin/next start -p 3000 --hostname 0.0.0.0",

      // --- Estabilidad de memoria ---
      // Reciclado: PM2 reinicia la app (de forma limpia) si supera este uso,
      // ANTES de que Node se quede sin memoria (~4 GB) y se caiga de golpe.
      max_memory_restart: "3500M",

      // Tolerancia: que PM2 la siga levantando y NO la deje "stopped" si se
      // reinicia varias veces seguidas.
      autorestart: true,
      max_restarts: 50,
      min_uptime: "20s",
      restart_delay: 3000,

      env: {
        NODE_ENV: "production",
        // Techo de heap explícito y predecible para Node.
        NODE_OPTIONS: "--max-old-space-size=4096",
      },
    },
  ],
};
