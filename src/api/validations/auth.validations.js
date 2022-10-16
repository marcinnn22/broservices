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

module.exports = {
  register,
  login,
  refreshTokens,
};
