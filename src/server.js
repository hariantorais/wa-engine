const app = require("./app");
const config = require("./config");

app.listen(config.port, "0.0.0.0", () => {
  console.log(`
    ======================================
    🚀 WA-ENGINE PRODUCTION READY
    ======================================
    Port    : ${config.port}
    Client  : ${config.clientUrl}
    Token   : ACTIVE
    ======================================
    `);
});
