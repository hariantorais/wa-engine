const express = require("express");
const AuthMiddleware = require("./middleware/auth.middleware");
const waController = require("./controllers/whatsapp.controller");
const authMiddleware = require("./middleware/auth.middleware");

const app = express();
app.use(express.json());

// route
app.get("/connect", AuthMiddleware, waController.connect);
app.get("/get-qr", authMiddleware, waController.getQr);
app.post("/send-message", authMiddleware, waController.send);

module.exports = app;
