const joi = require('joi');
const { username, password, email, refreshToken } = require('./custom.validations');

const register = {
  body: joi.object().keys({
    username: joi.string().required().custom(username),
    email: joi.string().email().required().custom(email),
    password: joi.string().required().custom(password),
  }),
};

const login = {
  body: joi.object().keys({
    username: joi.string().required().custom(username),
    password: joi.string().required().custom(password),
  }),
};

const refreshTokens = {
  body: joi.object().keys({
    refreshToken: joi.string().required().custom(refreshToken),
  }),
};

const forgotPassword = {
  body: joi.object().keys({
    email: joi.string().email().required().custom(email),
  }),
};

const resetPassword = {
  query: joi.object().keys({
    token: joi.string().required(),
  }),
  body: joi.object().keys({
    password: joi.string().required().custom(password),
  }),
};

const verifyEmail = {
  query: joi.object().keys({
    token: joi.string().required(),
  }),
};

module.exports = {
  register,
  login,
  refreshTokens,
  forgotPassword,
  resetPassword,
  verifyEmail,
};
