const transporter = require('../config/mailer');

async function sendOtpEmail(to, otp) {
  const mailOptions = {
    from: process.env.SMTP_USER, // sender address
    to,
    subject: 'Registration Code',
    html: `<p>Your OTP for registration is: <b>${otp}</b></p><p>Expires in 10 minutes.</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('OTP email sent to', to);
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    throw error;
  }
}

async function sendPasswordResetOtpEmail(to, otp) {
  const mailOptions = {
    from: process.env.SMTP_USER, // sender address
    to,
    subject: 'Password Reset Code',
    html: `<p>Your OTP for password reset is: <b>${otp}</b></p><p>This code will expire in 10 minutes.</p><p>If you didn't request this reset, please ignore this email.</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset OTP email sent to', to);
  } catch (error) {
    console.error('Failed to send password reset OTP email:', error);
    throw error;
  }
}

module.exports = { sendOtpEmail, sendPasswordResetOtpEmail };
