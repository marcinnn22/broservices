const jwt = require('jsonwebtoken');
const { Token } = require('../../db/models');
const { tokenTypes } = require('../configs/token.config');
const userServices = require('./user.services');
const ApiError = require('../utils/ApiError');

const generateToken = (userId, expires, type, secret = process.env.JWT_TOKEN_SECRET) => {
  const payload = {
    sub: userId,
    iat: Date.now(),
    exp: expires,
    type,
  };
  const token = jwt.sign(payload, secret);
  return token;
};

const saveTokens = async (userId, token, expires, type, blacklisted = false) => {
  const tokenData = Token.create({
    token,
    type,
    expiresAt: expires,
    blacklisted,
    userId,
  });
  return tokenData;
};

const verifyToken = async (token, type) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_TOKEN_SECRET);
    if (payload.type !== type) {
      throw new ApiError('Invalid token type', 401);
    }
    const tokenData = await Token.findOne({
      where: {
        token,
        type,
        userId: payload.sub,
        blacklisted: false,
      },
    });
    if (!tokenData) {
      throw new ApiError('Token not found', 404);
    }
    if (tokenData.expiresAt < new Date()) {
      throw new ApiError('Token expired', 401);
    }
    return tokenData;
  } catch (error) {
    throw new ApiError('Invalid token', 401);
  }
};

const revokeTokens = async (refreshToken) => {
  const token = await Token.findOne({
    where: { token: refreshToken, type: tokenTypes.REFRESH, blacklisted: false },
  });
  if (!token) {
    throw new ApiError('Token not found', 404);
  }
  const { userId } = token;
  await Token.destroy({
    where: {
      userId,
      type: [tokenTypes.REFRESH, tokenTypes.ACCESS],
    },
  });
};

const revokeTokenbyUserId = async (userId) => {
  await Token.destroy({
    where: {
      userId,
      type: [tokenTypes.ACCESS, tokenTypes.REFRESH],
    },
  });
};

const revokeTokenbyType = async (userId, type) => {
  await Token.destroy({
    where: {
      userId,
      type,
    },
  });
};

const generateAuthTokens = async (user) => {
  const accessTokenExpires = Date.now() + 1000 * 60 * 60 * 24; // 1 day
  const refreshTokenExpires = Date.now() + 1000 * 60 * 60 * 24 * 7; // 1 week
  const accessToken = generateToken(user.id, accessTokenExpires, tokenTypes.ACCESS);
  const refreshToken = generateToken(user.id, refreshTokenExpires, tokenTypes.REFRESH);

  const [accessTokenData, refreshTokenData] = await Promise.all([
    saveTokens(user.id, accessToken, accessTokenExpires, tokenTypes.ACCESS),
    saveTokens(user.id, refreshToken, refreshTokenExpires, tokenTypes.REFRESH),
  ]);
  return {
    access: {
      token: accessTokenData.token,
      expires: accessTokenData.expiresAt,
    },
    refresh: {
      token: refreshTokenData.token,
      expires: refreshTokenData.expiresAt,
    },
  };
};

const generateResetPasswordToken = async (email) => {
  const user = await userServices.getUserbyEmail(email);
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  const expires = Date.now() + 1000 * 60 * 10; // 10 minutes
  const resetPasswordToken = generateToken(user.id, expires, tokenTypes.RESET_PASSWORD);
  await saveTokens(user.id, resetPasswordToken, expires, tokenTypes.RESET_PASSWORD);
  return resetPasswordToken;
};

const generateVerifyEmailToken = async (email) => {
  const user = await userServices.getUserbyEmail(email);
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  const expires = Date.now() + 1000 * 60 * 10; // 10 minutes
  const verifyEmailToken = generateToken(user.id, expires, tokenTypes.VERIFY_EMAIL);
  await saveTokens(user.id, verifyEmailToken, expires, tokenTypes.VERIFY_EMAIL);
  return verifyEmailToken;
};

module.exports = {
  generateToken,
  saveTokens,
  verifyToken,
  revokeTokens,
  revokeTokenbyUserId,
  revokeTokenbyType,
  generateAuthTokens,
  generateResetPasswordToken,
  generateVerifyEmailToken,
};
