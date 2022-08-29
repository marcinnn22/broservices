const express = require('express');
const userRoute = require('./user.routes');

const router = express.Router();

const Routes = [
  {
    path: '/users',
    route: userRoute,
  },
];

Routes.forEach((route) => {
  router.use(route.path, route.route);
});

module.exports = router;
