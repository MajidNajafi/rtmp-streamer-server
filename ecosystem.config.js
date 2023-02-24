module.exports = {
  apps: [
    {
      name: "app",
      watch: true,
      script: "./dist/index.js",
      args: "limit",
    },
  ],
}
