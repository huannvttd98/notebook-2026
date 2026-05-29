// Cấu hình PM2 — server 1 core nên chạy 1 instance (không cluster)
module.exports = {
  apps: [
    {
      name: 'notebook',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M', // tự restart nếu vượt 300MB (an toàn cho 1GB RAM)
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
