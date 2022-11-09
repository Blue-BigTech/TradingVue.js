const mysql = require('mysql2');
const config = require('./_config');

module.exports = mysql.createPool(config.mysql);
