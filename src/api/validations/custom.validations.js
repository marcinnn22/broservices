const username = (value, helpers) => {
  if (value.length < 3 || value.length > 12) {
    return helpers.message('Username must be between 3 and 12 characters');
  }
  if (!/^[a-zA-Z0-9_]*$/.test(value)) {
    return helpers.message('Username can only contain alpha-numeric characters or underscore');
  }
  if ((value === 'admin', value === 'Moderator')) {
    return helpers.message('Username is not allowed');
  }
  return value;
};

const email = (value, helpers) => {
  if (!value) {
    return helpers.message('Email is required');
  }
  return value;
};

const password = (value, helpers) => {
  if (value.length < 6 || value.length > 20) {
    return helpers.message('Password must be between 6 and 20 characters');
  }
  // eslint-disable-next-line no-useless-escape
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])/.test(value)) {
    return helpers.message(
      'Password must contain at least one lowercase letter, one uppercase letter, one number and one special character'
    );
  }
  return value;
};

const refreshToken = (value, helpers) => {
  // eslint-disable-next-line no-useless-escape
  if (!/^([a-zA-Z0-9_=]+)\.([a-zA-Z0-9_=]+)\.([a-zA-Z0-9_\-\+\/=]*)/.test(value)) {
    return helpers.message('Invalid refresh token');
  }
  return value;
};

module.exports = {
  username,
  password,
  email,
  refreshToken,
};
