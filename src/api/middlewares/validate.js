const Joi = require('joi');

const validate = (schema) => (req, res, next) => {
  const validateSchema = schema.body || schema.params || schema.query;
  const object = req.body || req.params || req.query;
  const { value, error } = Joi.compile(validateSchema)
    .prefs({ errors: { label: 'key' } })
    .validate(object);
  if (error) {
    const errorMessage = error.details.map((details) => details.message).join(', ');
    return res.status(400).json({
      status: 'error',
      message: errorMessage,
    });
  }
  if (schema.body) {
    req.body = value;
  }
  if (schema.params) {
    req.params = value;
  }
  if (schema.query) {
    req.query = value;
  }
  return next();
};

module.exports = validate;
