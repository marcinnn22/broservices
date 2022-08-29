const { User } = require('../../db/models');
const ApiError = require('../utils/ApiError');

const getUsers = async () => {
  const users = await User.findAll();
  if (!users || users.length === 0) {
    throw new ApiError('No users found', 204);
  }
  return users;
};

module.exports = {
  getUsers,
};
