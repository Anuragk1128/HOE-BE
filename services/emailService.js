const transporter = require('../config/mailer');

async function sendOtpEmail(to, otp) {
  const mailOptions = {
    from: process.env.SMTP_USER, // sender address
    to,
    subject: 'Your OTP Code',
    html: `<p>Your OTP is: <b>${otp}</b></p><p>Expires in 10 minutes.</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('OTP email sent to', to);
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    throw error;
  }
}

module.exports = { sendOtpEmail };
