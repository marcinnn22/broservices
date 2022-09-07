const { User } = require('../../db/models');
const ApiError = require('../utils/ApiError');
const { hashPassword, comparePassword } = require('../utils/bcryptjs.utils');

const createUser = async (data) => {
  const { username, email, password } = data;
  const user = await User.create({ username, email, password: await hashPassword(password) });
  return user;
};

const compareUserPassword = async (password, hash) => comparePassword(password, hash);

const getHashedPassword = async (id) => {
  const user = await User.scope('withPassword').findOne({
    where: {
      id,
    },
  });
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  return user.password;
};

const getUserbyUsername = async (username) => {
  const user = await User.findOne({
    where: { username },
  });
  if (user) {
    return user;
  }
  return false;
};

const getUserbyEmail = async (email) => {
  const user = await User.findOne({
    where: { email },
  });
  if (user) {
    return user;
  }
  return false;
};

const getUserbyId = async (id) => {
  const user = await User.findOne({
    where: { id },
  });
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  return user;
};

const getUsers = async () => {
  const users = await User.findAll();
  if (!users || users.length === 0) {
    throw new ApiError('No users found', 204);
  }
  return users;
};

module.exports = {
  createUser,
  compareUserPassword,
  getHashedPassword,
  getUserbyUsername,
  getUserbyEmail,
  getUserbyId,
  getUsers,
};
