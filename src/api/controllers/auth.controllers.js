const catchAsync = require('../utils/catchAsync');

const { authService, tokenService, emailService } = require('../services');

const register = catchAsync(async (req, res) => {
  const user = await authService.registerUser(req.body);
  const verifyToken = await tokenService.generateVerifyEmailToken(user.email);
  await emailService.sendVerifyEmail(user.email, verifyToken);
  res.status(201).json({
    status: 'success',
    data: {
      user,
    },
  });
});

const login = catchAsync(async (req, res) => {
  const { username, password } = req.body;
  const user = await authService.loginUser(username, password);
  await tokenService.revokeTokenbyUserId(user.id);
  const tokens = await tokenService.generateAuthTokens(user);
  res.status(200).json({
    status: 'success',
    data: {
      user,
      tokens,
    },
  });
});

const logout = catchAsync(async (req, res) => {
  await tokenService.revokeTokens(req.body.refreshToken);
  res.status(200).json({
    status: 'success',
    data: null,
  });
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken);
  res.status(200).json({
    status: 'success',
    data: {
      tokens,
    },
  });
});

const forgotPassword = catchAsync(async (req, res) => {
  const resetPasswordToken = await tokenService.generateResetPasswordToken(req.body.email);
  await emailService.sendResetPasswordEmail(req.body.email, resetPasswordToken);
  res.status(200).json({
    status: 'success',
    data: null,
  });
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.query.token, req.body.password);
  res.status(200).json({
    status: 'success',
    data: null,
  });
});

const verifyEmail = catchAsync(async (req, res) => {
  await authService.verifyEmail(req.query.token);
  res.status(200).json({
    status: 'success',
    data: null,
  });
});

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  verifyEmail,
};
