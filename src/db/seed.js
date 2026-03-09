const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./index');

async function seed() {
    try {
        // Run schema
        require('dotenv').config();
        const isSqlite = process.env.DB_TYPE === 'sqlite';
        const schemaFile = isSqlite ? 'init-sqlite.sql' : 'init.sql';
        const schema = fs.readFileSync(path.join(__dirname, schemaFile), 'utf-8');
        const queries = schema.split(';').filter(q => q.trim().length > 0);
        for (const q of queries) {
            await db.query(q);
        }
        console.log('Database schema executed successfully.');

        // Check if users exist
        const result = await db.query('SELECT COUNT(*) FROM users');
        const count = result.rows[0].count || result.rows[0]['COUNT(*)'] || 0;
        if (parseInt(count) === 0) {
            console.log('Seeding users...');
            const defaultPassword = 'password123';
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(defaultPassword, salt);

            // Create 13 users
            for (let i = 1; i <= 13; i++) {
                await db.query(`
          INSERT INTO users (username, password_hash, full_name, role)
          VALUES ($1, $2, $3, $4)
        `, [`devops${i}`, hash, `DevOps Member ${i}`, 'user']);
            }
            console.log('13 DevOps users seeded.');
        } else {
            console.log('Users already exist, skipping seed.');
        }
    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        await db.pool.end();
    }
}

seed();
