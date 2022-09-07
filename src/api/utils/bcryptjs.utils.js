const bcrypt = require('bcryptjs');

module.exports = {
  hashPassword: async (password) => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  },
  comparePassword: async (password, hash) => bcrypt.compare(password, hash),
};
