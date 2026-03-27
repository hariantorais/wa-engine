const config = require("../config");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token || token !== config.apiToken) {
    return res.status(401).json({
      status: false,
      message: "Unauthorized: Invalid or Missing API Token",
    });
  }

  next();
};
