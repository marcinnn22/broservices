const nodemailer = require('nodemailer');
const { email } = require('../configs/global.config');

const transporter = nodemailer.createTransport({
  service: email.service,
  auth: {
    user: email.auth.user,
    pass: email.auth.pass,
  },
});

const sendEmail = async (to, subject, text) => {
  const mailOptions = {
    from: email.auth.user,
    to,
    subject,
    text,
  };

  await transporter.sendMail(mailOptions);
};

const sendResetPasswordEmail = async (to, token) => {
  const subject = 'Reset your password';
  const text = `Please click on the following link to reset your password: http://localhost:3001/v1/auth/reset-password?token=${token} 
  \n\n If you did not request this, please ignore this email and your password will remain unchanged.`;
  await sendEmail(to, subject, text);
};

const sendVerifyEmail = async (to, token) => {
  const subject = 'Verify your email';
  const text = `Please click on the following link to verify your email: http://localhost:3001/v1/auth/verify-email?token=${token}
  \n\n If you did not request this, please ignore this email.`;
  await sendEmail(to, subject, text);
};

module.exports = {
  sendEmail,
  sendResetPasswordEmail,
  sendVerifyEmail,
};
