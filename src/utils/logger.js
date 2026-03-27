const pino = require("pino");

const logger = pino({
  level: process.env.NODE_ENV == "production" ? "info" : "debug",
  base: {
    pid: false,
  },
});

module.exports = logger;
