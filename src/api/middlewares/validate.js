const Joi = require('joi');
const ApiError = require('../utils/ApiError');

const validate = (schema) => (req, res, next) => {
  const validateSchema = schema.body || schema.params || schema.query;
  const object = req.body || req.params || req.query;
  const { value, error } = Joi.compile(validateSchema)
    .prefs({ errors: { label: 'key' } })
    .validate(object);
  if (error) {
    const errorMessage = error.details.map((details) => details.message).join(', ');
    return next(new ApiError(errorMessage, 400));
  }
  Object.assign(req, value);
  return next();
};

module.exports = validate;
