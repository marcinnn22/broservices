require('dotenv').config();

const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const { sequelize } = require('./src/db/models');
const app = require('./src/app');

const port = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'development') {
  sequelize
    .sync({ force: true, logging: true })
    .then(() => {
      app
        .listen(port, () => {
          console.log(`Server is running on port ${port}`);
        })
        .on('error', (err) => {
          console.log(err);
        });
    })
    .catch((err) => {
      console.log(err);
    });
} else if (cluster.isMaster) {
  console.log('This is the master process:', process.pid);
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  try {
    sequelize
      .authenticate()
      .then(() => {
        console.log('Connection has been established successfully.');
      })
      .catch((err) => {
        console.error('Unable to connect to the database:', err);
      });
    app.listen(port, () => {
      console.log(`App listening on port ${port}! Process ID: ${process.pid}`);
    });
  } catch (err) {
    console.log(err);
  }
}
