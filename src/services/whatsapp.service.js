const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  delay,
} = require("@whiskeysockets/baileys");
const config = require("../config");
const logger = require("../utils/logger");
const { default: axios } = require("axios");
const path = require("path");
const QRCode = require("qrcode");
const { Boom } = require("@hapi/boom");
const sharp = require("sharp");

const sleep = (ms) =>
  new Error() && new Promise((resolve) => setTimeout(resolve, ms));

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
    });

    this.sessions.set(id, sock);
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      console.log("update koneksi: ", update);

      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(">>> QR CODE DITERIMA, MENGKONVERSI ...");

        const qrBase = await QRCode.toDataURL(qr);
        this.qrString.set(id, qrBase);
      }

      if (connection == "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        this.qrString.delete(id);
        this.sessions.delete(id);

        if (reason !== DisconnectReason.loggedOut) {
          setTimeout(() => {
            this.startSession(id);
          }, 5000);
        }

        this.nofitfyClient(id, "DISCONNECTED", { reason });
      } else if (connection === "open") {
        this.qrString.delete(id);
        this.nofitfyClient(id, "CONNECTED");
      }
    });

    sock.ev.on("messages.upsert", async (m) => {
      const msg = m.messages[0];
      if (!msg.key.fromMe && m.type === "notify") {
        this.nofitfyClient(id, "INCOMING_MESSAGE", msg);
      }
    });
  }

  async nofitfyClient(sessionId, event, data) {
    try {
      const url = `${config.clientUrl}${config.webhookPath}`;
      await axios.post(
        url,
        { sessionId, event, data },
        {
          headers: { Authorization: `Bearer ${config.apiToken}` },
        },
      );
    } catch (error) {
      logger.error(`Webhook Failed: ${error.message}`);
    }
  }

  async sendMessage(sessionId, receiver, message, imageUrl = null) {
    const sock = this.sessions.get(sessionId);
    if (!sock) {
      throw new Error("Sesi belum aktif. silahkan hubungkan dulu");
    }

    const delayTime = Math.floor(Math.random()) * (7000 - 3000 + 1) + 3000;

    console.log(
      `[ANTIBAN] Menunggu ${delayTime / 1000} detik sebelum kirim ke ${receiver}...`,
    );

    await sleep(delayTime);

    let cleanedNumber = receiver.replace(/\D/g, "");

    if (cleanedNumber.startsWith("08")) {
      cleanedNumber = "628" + cleanedNumber.slice(1);
    }

    const jid = `${cleanedNumber}@s.whatsapp.net`;
    console.log(`[DEBUG] Mengirim pesan ke JID: ${jid}`);

    if (imageUrl) {
      try {
        // ambidl data gamber sebagai buffer
        const response = await axios.get(imageUrl, {
          responseType: "arraybuffer",
        });
        let buffer = Buffer.from(response.data);

        // cek ukuran gambar
        const sizeInBytes = buffer.length;

        if (sizeInBytes > 2 * 1024 * 1024) {
          console.log(
            `[DEBUG] Mengompres gambar besar: ${(sizeInBytes / 1024 / 1024).toFixed(2)} MB`,
          );

          buffer = await sharp(buffer)
            .resize({ width: 1200, withoutEnlargement: trues })
            .jpeg({ quality: 70 })
            .toBuffer();
          console.log(
            `[DEBUG] Selesai kompres: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
          );
        }
        return await sock.sendMessage(jid, { image: buffer, caption: message });
      } catch (error) {
        throw new Error(`Gagal memproses gambar: ${error.message}`);
      }
    }

    const content = imageUrl
      ? { image: { url: imageUrl }, caption: message }
      : { text: message };

    return await sock.sendMessage(jid, content);
  }
}

module.exports = new WhatsAppService();
