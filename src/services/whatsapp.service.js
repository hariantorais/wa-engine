const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const config = require("../config");
const logger = require("../utils/logger");
const { default: axios } = require("axios");
const path = require("path");
const QRCode = require("qrcode");
const { Boom } = require("@hapi/boom");
const sharp = require("sharp");

// Helper Sleep (Ejaan setTimeout sudah benar)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class WhatsAppService {
  constructor() {
    this.sessions = new Map();
    this.qrString = new Map();
    console.log("[DEBUG] WhatsAppService Initialized");
  }

  async startSession(sessionId) {
    const id = sessionId || config.defaultSessionId;
    if (this.sessions.has(id)) return;

    const sessionPath = path.join(__dirname, "../../sessions", String(id));
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      browser: config.waConfig.browser,
      printQRInTerminal: true, // Membantu debug jika QR tidak muncul di web
    });

    this.sessions.set(id, sock);
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`[${id}] QR Code received`);
        const qrBase = await QRCode.toDataURL(qr);
        this.qrString.set(id, qrBase);
      }

      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        this.qrString.delete(id);
        this.sessions.delete(id);

        if (reason !== DisconnectReason.loggedOut) {
          console.log(`[${id}] Connection closed, reconnecting...`);
          setTimeout(() => this.startSession(id), 5000);
        }

        this.nofitfyClient(id, "DISCONNECTED", { reason });
      } else if (connection === "open") {
        console.log(`[${id}] Connection opened successfully`);
        this.qrString.delete(id);
        this.nofitfyClient(id, "CONNECTED");
      }
    });

    // Handle Incoming Messages & Auto-Reply
    sock.ev.on("messages.upsert", async (m) => {
      const msg = m.messages[0];

      // Filter: Jangan balas pesan dari diri sendiri atau status
      if (
        !msg.message ||
        msg.key.fromMe ||
        msg.key.remoteJid === "status@broadcast"
      )
        return;

      const remoteJid = msg.key.remoteJid;

      // 1. Lapor ke Laravel dan ambil instruksi balasan
      // Menggunakan 'id' dari parameter startSession
      const result = await this.nofitfyClient(id, "INCOMING_MESSAGE", msg);

      // 2. Jika Laravel instruksikan reply
      if (result && result.reply) {
        await sock.sendPresenceUpdate("composing", remoteJid);
        await sleep(2000); // Jeda manusiawi agar tidak terdeteksi bot kaku
        await sock.sendMessage(remoteJid, { text: result.reply });
      }
    });
  }

  async nofitfyClient(sessionId, event, data) {
    try {
      const url = `${config.clientUrl}${config.webhookPath}`;
      const response = await axios.post(
        url,
        { sessionId, event, data },
        {
          headers: { Authorization: `Bearer ${config.apiToken}` },
          timeout: 5000, // Timeout jika Laravel terlalu lama merespon
        },
      );

      // Mengembalikan data hasil olahan Laravel (untuk auto-reply)
      return response.data;
    } catch (error) {
      console.error(`[WEBHOOK ERROR] ${event}: ${error.message}`);
      return null;
    }
  }

  async sendMessage(sessionId, receiver, message, imageUrl = null) {
    const sock = this.sessions.get(sessionId);
    if (!sock) {
      throw new Error("Sesi belum aktif. Silahkan hubungkan WhatsApp dulu.");
    }

    // Anti-Ban Random Delay (3 sampai 7 detik)
    const delayTime = Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000;
    console.log(`[ANTIBAN] Delay ${delayTime / 1000}s to ${receiver}`);
    await sleep(delayTime);

    // Normalisasi Nomor
    let cleanedNumber = receiver.replace(/\D/g, "");
    if (cleanedNumber.startsWith("08")) {
      cleanedNumber = "628" + cleanedNumber.slice(1);
    }
    const jid = `${cleanedNumber}@s.whatsapp.net`;

    // Kirim dengan Gambar
    if (imageUrl) {
      try {
        const response = await axios.get(imageUrl, {
          responseType: "arraybuffer",
        });
        let buffer = Buffer.from(response.data);

        // Kompres jika ukuran > 2MB
        if (buffer.length > 2 * 1024 * 1024) {
          console.log(
            `[SHARP] Compressing: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
          );
          buffer = await sharp(buffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .jpeg({ quality: 70 })
            .toBuffer();
        }

        return await sock.sendMessage(jid, { image: buffer, caption: message });
      } catch (error) {
        throw new Error(`Gagal mengirim gambar: ${error.message}`);
      }
    }

    // Kirim Teks Biasa
    return await sock.sendMessage(jid, { text: message });
  }
}

module.exports = new WhatsAppService();
