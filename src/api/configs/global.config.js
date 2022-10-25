require('dotenv').config();

module.exports = {
  email: {
    service: process.env.EMAIL_SERVICE,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  },
  database: {
    production: {
      host: process.env.DB_PRODUCTION_HOST,
      username: process.env.DB_PRODUCTION_USERNAME,
      password: process.env.DB_PRODUCTION_PASSWORD,
      database: process.env.DB_PRODUCTION_DATABASE,
      dialect: process.env.DB_PRODUCTION_DIALECT,
    },
    development: {
      host: '127.0.0.1',
      username: 'root',
      password: null,
      database: 'database_development',
      dialect: 'mysql',
    },
  },
};
