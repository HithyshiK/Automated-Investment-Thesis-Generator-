const { Sequelize } = require('sequelize');

const useSSL = process.env.POSTGRES_SSL === 'true';

const sequelize = new Sequelize(process.env.POSTGRES_URI, {
  dialect: 'postgres',
  protocol: 'postgres',
  dialectOptions: useSSL ? {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  } : {}
});

module.exports = sequelize;