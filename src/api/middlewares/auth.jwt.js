const { tokenService } = require('../services');
const { tokenTypes } = require('../configs/token.config');

module.exports = {
  auth: async (req, res, next) => {
    const token = req.body.refreshToken;
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'No token provided',
      });
    }
    const result = await tokenService.verifyToken(token, tokenTypes.REFRESH);
    // @TODO: handle jwt invalid token error
    if (!result) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized',
      });
    }
    req.user = result;
    next();
  },
};
