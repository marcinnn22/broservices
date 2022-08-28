const express = require('express');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  console.log(`Request received Process id: ${process.pid}`);
  res.json(`Hello World!, process.pid: ${process.pid}`).status(200);
});

module.exports = app;
