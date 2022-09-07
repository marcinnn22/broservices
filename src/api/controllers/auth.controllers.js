const catchAsync = require('../utils/catchAsync');

const { authService, tokenService } = require('../services');

const register = catchAsync(async (req, res) => {
  const user = await authService.registerUser(req.body);
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

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
};
