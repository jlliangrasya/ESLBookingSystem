const mysql = require('mysql2/promise');
require('dotenv').config();

const poolConfig = {
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port:     process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  // Return DATETIME/TIMESTAMP columns as plain strings, not JS Date objects.
  // Dates are stored as display time (PHT) — returning them as strings prevents
  // mysql2 from UTC-converting them during serialization.
  dateStrings: true,
};

// TiDB Cloud requires SSL connections
if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: true };
}

const pool = mysql.createPool(poolConfig);

module.exports = pool;
