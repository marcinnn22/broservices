require('dotenv').config();

const nodemon = require('nodemon');
const ngrok = require('ngrok');

const TOKEN = process.env.NGROK_TOKEN;
const { PORT } = process.env;

try {
  ngrok.connect(PORT, {
    authtoken: TOKEN,
    region: 'eu',
  }).then((url) => {
    console.log(`Server is running on ${url}`);
    nodemon({
      script: './index.js',
      ext: 'js json',
      env: {
        TOKEN,
        PORT,
      },
    }).on('start', () => {
      console.log('started!');
    }).on('restart', () => {
      console.log(`Server is running on ${url}`);
      console.log('restarted!');
    }).on('crash', () => {
      console.log('crashed!');
    })
      .on('quit', () => {
        ngrok.kill().then(() => process.exit(0)).catch((err) => console.log(err));
        console.log('quited!');
      })
      .on('exit', () => {
        console.log('exited!');
      })
      .on('error', () => {
        console.log('error!');
      });
  }).catch((err) => {
    console.log(err);
  });
} catch (error) {
  console.error(error);
}
