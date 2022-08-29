const catchAsync = require('../utils/catchAsync');

const { userService } = require('../services');

const getAllUsers = catchAsync(async (req, res) => {
  const users = await userService.getUsers();
  res.status(200).json({
    status: 'success',
    results: users.length,
    data: {
      users,
    },
  });
});

module.exports = {
  getAllUsers,
};
