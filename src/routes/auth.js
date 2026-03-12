const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Create JWT Payload
        const payload = {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            role: user.role
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

        res.json({ token, user: payload });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
});

router.post('/register', async (req, res) => {
    try {
        const { full_name, username, password } = req.body;

        if (!full_name || !username || !password) {
            return res.status(400).json({ error: 'Full name, username, and password are required' });
        }

        // Check if user exists
        const userExists = await db.query('SELECT username FROM users WHERE username = $1', [username]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // Insert new user
        await db.query(
            'INSERT INTO users (full_name, username, password_hash, role) VALUES ($1, $2, $3, $4)',
            [full_name, username, password_hash, 'user']
        );

        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { username, new_password } = req.body;

        if (!username || !new_password) {
            return res.status(400).json({ error: 'Username and new password are required' });
        }

        // Check if user exists
        const userExists = await db.query('SELECT id FROM users WHERE username = $1', [username]);
        if (userExists.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(new_password, salt);

        // Update password
        await db.query('UPDATE users SET password_hash = $1 WHERE username = $2', [password_hash, username]);

        res.json({ message: 'Password reset successfully' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Server error during password reset' });
    }
});

module.exports = router;
