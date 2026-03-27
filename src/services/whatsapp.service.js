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
const { sendMessage } = require("../WhatsAppManager");

class WhatsAppService {
  constructor() {
    this.sessions = new Map();
    this.qrString = new Map();
  }

  async startSession(sessionId) {
    if (this.sessions.has(sessionId)) return;

    const sessionPath = path.join(__dirname, "../../sessions", sessionId);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      browser: config.waConfig.browser,
    });

    this.sessions.set(sessionId, sock);
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const qrBase = await QRCode.toDataURL(qr);
        this.qrString.set(sessionId, qrBase);
      }

      if (connection == "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        this.qrString.delete(sessionId);
        this.sessions.delete(sessionId);

        if (reason !== DisconnectReason.loggedOut) {
          setTimeout(() => {
            this.startSession(sessionId);
          }, 5000);
        }

        this.nofitfyClient(sessionId, "DISCONNECTED", { reason });
      } else if (connection === open) {
        this.qrString.delete(sessionId);
        this.nofitfyClient(sessionId, "CONNECTED");
      }
    });

    sock.ev.on("messages.upsert", async (m) => {
      const msg = m.messages[0];
      if (!msg.key.fromMe && m.type === "notify") {
        this.nofitfyClient(sessionId, "INCOMING_MESSAGE", msg);
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

    const jid = receiver.replace(/\D/g, "") + "@s.whatsapp.net";

    const content = imageUrl
      ? { image: { url: imageUrl }, caption: message }
      : { text: message };

    return await sock.sendMessage(jid, content);
  }
}

module.exports = new WhatsAppService();
