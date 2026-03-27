const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");
const pino = require("pino");
const path = require("path");
const QRCode = require("qrcode"); // Tambahkan ini agar QR bisa jadi gambar

class WhatsAppManager {
  constructor() {
    this.sessions = new Map();
    this.qrString = new Map();
  }

  async startSession(sessionId, callbackStatus) {
    if (this.sessions.has(sessionId)) return;

    // Folder session di luar folder src
    const sessionPath = path.join(__dirname, "..", "sessions", sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      // Gunakan array ini agar terdeteksi sebagai Chrome Desktop standar
      browser: ["Windows", "Chrome", "11.0.1"],
      // Tambahkan opsi ini untuk stabilitas koneksi
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 10000,
    });

    this.sessions.set(sessionId, sock);

    sock.ev.on("creds.update", saveCreds);

    // --- PEMBUNGKUS EVENT UPDATE (Dulu Anda lupa ini) ---
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // 1. Tangani QR Code
      if (qr) {
        console.log(`[${sessionId}] QR Code Received!`);
        try {
          // Kita ubah langsung jadi Base64 agar app.js tinggal pakai
          const base64QR = await QRCode.toDataURL(qr);
          this.qrString.set(sessionId, base64QR);
        } catch (err) {
          console.error("Gagal generate QR Base64", err);
        }
      }

      // 2. Tangani Koneksi Terputus
      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        console.log(`[${sessionId}] Connection closed. Reason: ${reason}`);

        this.qrString.delete(sessionId);

        // Jika 405 atau 401, jangan langsung reconnect. Hapus session dan suruh scan ulang.
        if (
          reason === 405 ||
          reason === DisconnectReason.loggedOut ||
          reason === 401
        ) {
          console.log(
            `[${sessionId}] Session is invalid or conflicted. Please delete session folder and scan again.`,
          );
          this.sessions.delete(sessionId);
        } else {
          // Untuk error lain (timeout/network), coba reconnect dengan jeda lebih lama
          console.log(`[${sessionId}] Attempting to reconnect in 5 seconds...`);
          this.sessions.delete(sessionId);
          setTimeout(() => this.startSession(sessionId, callbackStatus), 5000);
        }
      }

      // 3. Tangani Koneksi Terbuka
      else if (connection === "open") {
        console.log(`[${sessionId}] Connected Successfully!`);
        this.qrString.delete(sessionId); // Hapus data QR karena sudah login
        if (callbackStatus) callbackStatus(sessionId, "CONNECTED");
      }
    });
  }

  async sendMessage(sessionId, receiver, message) {
    const sock = this.sessions.get(sessionId);
    if (!sock) throw new Error("Session not found");

    const jid = receiver.replace(/\D/g, "") + "@s.whatsapp.net";
    return await sock.sendMessage(jid, { text: message });
  }
}

module.exports = new WhatsAppManager();
