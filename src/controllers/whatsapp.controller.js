const waService = require("../services/whatsapp.service");
const config = require("../config");

exports.connect = async (req, res) => {
  const sessionId = req.query.apy_key || config.defaultSession;

  waService.startSession(sessionId);
  res.json({
    status: true,
    message: "Initialization started",
  });
};

exports.getQr = (req, res) => {
  const sessionId = req.query.api_key || config.defaultSession;
  const qr = waService.qrString.get(sessionId);
  res.json(
    qr ? { status: true, qr } : { status: false, message: "QR not available" },
  );
};

exports.send = async (req, res) => {
  const { api_key, receiver, message, image_url } = req.body;
  try {
    const sessionId = api_key || config.defaultSession;
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
