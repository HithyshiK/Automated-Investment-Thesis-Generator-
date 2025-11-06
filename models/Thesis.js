const { DataTypes } = require('sequelize');
const sequelize = require('../database');
const User = require('./User');

const Thesis = sequelize.define('Thesis', {
  text: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  thesis: {
    type: DataTypes.TEXT,
    allowNull: false
  }
});

Thesis.belongsTo(User);

module.exports = Thesis;