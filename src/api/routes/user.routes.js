const express = require('express');

const { userController } = require('../controllers');
const { auth } = require('../middlewares/auth.jwt');

const router = express.Router();

router.get('/', auth, userController.getAllUsers);

module.exports = router;
