const tokenService = require('./token.services');
const userService = require('./user.services');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../configs/token.config');

const registerUser = async (data) => {
  const { username, email, password } = data;
  const userExists = await userService.getUserbyUsername(username);
  if (userExists) {
    throw new ApiError('Username already taken', 409);
  }
  const emailExists = await userService.getUserbyEmail(email);
  if (emailExists) {
    throw new ApiError('Email already taken', 409);
  }
  const user = await userService.createUser({ username, email, password });
  user.password = undefined;
  return user;
};

const loginUser = async (username, password) => {
  const user = await userService.getUserbyUsername(username);
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  const usersPassword = await userService.getHashedPassword(user.id);
  const isPasswordMatch = await userService.compareUserPassword(password, usersPassword);
  if (!isPasswordMatch) {
    throw new ApiError('Incorrect password', 401);
  }
  return user;
};

const refreshAuth = async (refreshToken) => {
  const refreshTokenData = await tokenService.verifyToken(refreshToken, tokenTypes.REFRESH);
  console.log(refreshTokenData);
  const user = await userService.getUserbyId(refreshTokenData.userId);
  await tokenService.revokeTokenbyUserId(user.id);
  const tokens = await tokenService.generateAuthTokens(user);
  return tokens;
};

const resetPassword = async (resetToken, newPassword) => {
  try {
    const resetTokenData = await tokenService.verifyToken(resetToken, tokenTypes.RESET_PASSWORD);
    await userService.updateUserPassword(resetTokenData.userId, newPassword);
    await tokenService.revokeTokenbyType(resetTokenData.userId, tokenTypes.RESET_PASSWORD);
  } catch (error) {
    throw new ApiError('Invalid or expired reset password token', 400);
  }
};

const verifyEmail = async (verifyToken) => {
  try {
    const verifyTokenData = await tokenService.verifyToken(verifyToken, tokenTypes.VERIFY_EMAIL);
    await userService.updateUserEmailVerified(verifyTokenData.userId);
    await tokenService.revokeTokenbyType(verifyTokenData.userId, tokenTypes.VERIFY_EMAIL);
  } catch (error) {
    throw new ApiError('Invalid or expired verify email token', 400);
  }
};

module.exports = {
  registerUser,
  loginUser,
  refreshAuth,
  resetPassword,
  verifyEmail,
};
