module.exports = {
  apps: [
    {
      name: "capitaldesk",
      cwd: "D:/apps/capital-desk",
      script: "C:/Program Files/nodejs/node.exe",
      args: "node_modules/next/dist/bin/next start -p 3000 --hostname 0.0.0.0",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
