require('dotenv').config();

const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

const app = require('./src/app');

const port = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'development') {
  app.listen(port, () => {
    console.log(`App listening on port ${port}!`);
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
  app.listen(port, () => {
    console.log(`App listening on port ${port}! Process ID: ${process.pid}`);
  });
}
