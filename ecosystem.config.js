module.exports = {
  apps: [
    {
      name: 'art-catalog',
      script: 'server.js',
      cwd: '/home/williammathies/apps/art-catalog',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      restart_delay: 3000,
      max_restarts: 10,
      watch: false,
      error_file: '/home/williammathies/apps/art-catalog/logs/error.log',
      out_file: '/home/williammathies/apps/art-catalog/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
