const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const express = require("express");
const pino = require("pino");
const QRCode = require("qrcode");
const axios = require("axios");
const path = require("path"); // Tambahkan ini

const app = express();
app.use(express.json());

const sessions = new Map();
const qrStrings = new Map();

// --- CORE ENGINE ---
async function startSession(sessionId) {
  if (sessions.has(sessionId)) return;

  // PERBAIKAN PATH: Agar folder sessions ada di root, bukan di dalam src
  const sessionPath = path.join(__dirname, "..", "sessions", sessionId);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["WA Engine", "Chrome", "1.0.0"],
    printQRInTerminal: true,
  });

  sessions.set(sessionId, sock);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrBase64 = await QRCode.toDataURL(qr);
      qrStrings.set(sessionId, qrBase64);
    }

    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      qrStrings.delete(sessionId);

      // Logika reconnect yang Anda miliki sudah benar
      if (reason !== DisconnectReason.loggedOut) {
        console.log(`[${sessionId}] Reconnecting... Reason: ${reason}`);
        sessions.delete(sessionId);
        // Tambahkan delay sedikit agar tidak membombardir server WA
        setTimeout(() => startSession(sessionId), 3000);
      } else {
        console.log(`[${sessionId}] Logged Out.`);
        sessions.delete(sessionId);
      }
    } else if (connection === "open") {
      qrStrings.delete(sessionId);
      console.log(`[${sessionId}] Connected!`);

      // Kirim lapor ke Laravel (opsional)
      axios
        .post("http://127.0.0.1:8000/api/callback/status", {
          api_key: sessionId,
          status: "CONNECTED",
        })
        .catch(() => {});
    }
  });
}

// --- API ENDPOINTS ---

app.get("/get-qr", (req, res) => {
  const qr = qrStrings.get(req.query.api_key);
  res.json(
    qr
      ? { status: true, qr }
      : { status: false, message: "QR belum siap/sudah login" },
  );
});

app.get("/connect", (req, res) => {
  startSession(req.query.api_key);
  res.json({ status: true, message: "Koneksi dimulai" });
});

app.post("/send-message", async (req, res) => {
  const { api_key, receiver, message, image_url } = req.body;
  const sock = sessions.get(api_key);

  if (!sock)
    return res.status(404).json({ status: false, message: "Sesi mati" });

  try {
    const jid = receiver.replace(/\D/g, "") + "@s.whatsapp.net";
    const content = image_url
      ? { image: { url: image_url }, caption: message }
      : { text: message };
    await sock.sendMessage(jid, content);
    res.json({ status: true, message: "Sent" });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

module.exports = app; // Export app untuk digunakan di index.js
