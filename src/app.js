const express = require('express');
const cors = require('cors');
const routes = require('./api/routes');
const errorHandler = require('./api/middlewares/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/v1', routes);
// use error handler after routes
app
  .all('*', (req, res) => {
    res.status(404).json({
      message: '404 Not Found',
    });
  })
  .use(errorHandler);

module.exports = app;
