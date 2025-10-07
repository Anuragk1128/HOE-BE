require('dotenv').config(); // load .env variables
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true, // Always true for port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // Gmail-specific configuration
  tls: {
    ciphers: 'SSLv3'
  }
});

module.exports = transporter;
