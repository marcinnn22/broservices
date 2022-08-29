// const { User } = require('../../db/models');
const ApiError = require('../utils/ApiError');

const getUsers = async () => {
  throw new ApiError('Not implemented yet', 501);
};

module.exports = {
  getUsers,
};
