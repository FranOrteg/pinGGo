// pm2 config. Single fork instance: Socket.IO polling needs sticky sessions,
// which pm2 cluster mode does not provide. Secrets live in back/.env (dotenv).
module.exports = {
  apps: [
    {
      name: 'pinggo-back',
      script: 'src/index.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
