require('dotenv').config();
const { Pool } = require('pg');

const dbType = process.env.DB_TYPE || 'postgres';

let db;

if (dbType === 'sqlite') {
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');
  const dbFile = path.resolve(__dirname, 'dailystatus.sqlite');
  const sqliteDb = new sqlite3.Database(dbFile);

  db = {
    query: (text, params = []) => {
      // Convert Postgres $1, $2 to SQLite ?
      const sqliteText = text.replace(/\$\d+/g, '?');
      return new Promise((resolve, reject) => {
        if (sqliteText.trim().toUpperCase().startsWith('SELECT') || sqliteText.trim().toUpperCase().startsWith('WITH')) {
          sqliteDb.all(sqliteText, params, (err, rows) => {
            if (err) reject(err);
            else resolve({ rows, rowCount: rows.length });
          });
        } else {
          sqliteDb.run(sqliteText, params, function (err) {
            if (err) reject(err);
            else resolve({ rows: [], rowCount: this.changes });
          });
        }
      });
    },
    pool: { end: () => new Promise(res => { sqliteDb.close(); res(); }) }
  };
} else {
  // Use Postgres
  const pool = new Pool({});
  db = {
    query: (text, params) => pool.query(text, params),
    pool
  };
}

module.exports = db;
