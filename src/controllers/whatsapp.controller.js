const waService = require("../services/whatsapp.service");
const config = require("../config");

exports.connect = async (req, res) => {
  const sessionId = req.query.api_key || config.defaultSessionId;

  waService.startSession(sessionId);
  res.json({
    status: true,
    message: "Initialization started",
  });
};

exports.getQr = (req, res) => {
  const sessionId = req.query.api_key || config.defaultSessionId;
  console.log(`[DEBUG] Mencari QR untuk Session: ${sessionId}`);
  console.log(
    `[DEBUG] Daftar Session yang ada QR-nya:`,
    Array.from(waService.qrString.keys()),
  );

  if (!waService || !waService.qrString) {
    console.error("[ERROR] waService atau qrStrings undefined!");
    return res.status(500).json({
      status: false,
      message: "Internal Server Error: Service not ready",
    });
  }
  const qr = waService.qrString.get(sessionId);
  res.json(
    qr ? { status: true, qr } : { status: false, message: "QR not available" },
  );
};

exports.send = async (req, res) => {
  const { api_key, receiver, message, image_url } = req.body;
  try {
    const sessionId = api_key || config.defaultSessionId;
    await waService.sendMessage(sessionId, receiver, message, image_url);
    res.json({
      status: true,
      message: "message sent",
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};
