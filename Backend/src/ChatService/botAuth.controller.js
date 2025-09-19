// botAuth.controller.js
// const jwt = require("jsonwebtoken");
import jwt from 'jsonwebtoken';

export const getBotToken = async (req, res) => {
  try {
    // only allow backend (not public users) to trigger this
    // e.g., require farmerId from body
    const { farmerId } = req.body;

    if (!farmerId) {
      return res.status(400).json({ message: "FarmerId required" });
    }

    // create short-lived token for bot
    const token = jwt.sign(
      {
        role: "assistant",
        name: "Kisaan Sahayak",
        farmerId, // link bot to that farmer's conversation
      },
      process.env.JWT_SECRET,
      { expiresIn: "5m" } // short lifespan
    );

    res.json({ botToken: token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
