const express = require('express');
const routes = require('./api/routes');
const errorHandler = require('./api/middlewares/errorHandler');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/v1', routes);
// use error handler after routes
app
  .all('*', (req, res) => {
    res.status(404).json({
      message: 'Not Found',
    });
  })
  .use(errorHandler);

module.exports = app;
