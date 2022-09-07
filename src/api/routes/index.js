const express = require('express');
const userRoute = require('./user.routes');
const authRoute = require('./auth.routes');

const router = express.Router();

const Routes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/users',
    route: userRoute,
  },
];

Routes.forEach((route) => {
  router.use(route.path, route.route);
});

module.exports = router;
