const { tokenService } = require('../services');
const { tokenTypes } = require('../configs/token.config');
const ApiError = require('../utils/ApiError');

module.exports = {
  auth: async (req, res, next) => {
    try {
      const token = req.body.refreshToken || req.headers['x-access-token'];
      if (!token) {
        throw new ApiError('No token provided', 400);
      }
      const result = await tokenService.verifyToken(token, tokenTypes.REFRESH);
      req.user = result;
      next();
    } catch (error) {
      next(error);
    }
  },
};
