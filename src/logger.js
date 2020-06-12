const { createLogger } = require("@snaxfoundation/snax-pino-logger");

const logger = createLogger({
  name: "node-checker",
  prettyPrint: process.env.LOG_PRETTY || false,
  level: process.env.LOG_LEVEL || "debug"
});

module.exports = logger;
