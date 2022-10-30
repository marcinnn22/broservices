const ApiError = require('../utils/ApiError');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let { stack } = err;
  if (process.env.NODE_ENV === 'production') {
    stack = undefined;
  }
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      stack,
    });
  }
  return res.status(500).json({
    status: 'error',
    message: err.message,
    stack,
  });
};

module.exports = errorHandler;
