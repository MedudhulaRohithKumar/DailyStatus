const express = require('express');
const router = express.Router();
const db = require('../db');
const verifyToken = require('../middleware/auth');

// Get all statuses for a given date
router.get('/status', verifyToken, async (req, res) => {
    try {
        const { date } = req.query; // format: YYYY-MM-DD

        if (!date) {
            return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
        }

        // Get all users
        const usersResult = await db.query('SELECT id, full_name, username FROM users');
        const users = usersResult.rows;

        // Get statuses for the specified date
        const statusResult = await db.query('SELECT user_id, status_type, description FROM daily_status WHERE date = $1', [date]);

        // Map existing statuses by user_id
        const statusMap = {};
        statusResult.rows.forEach(row => {
            statusMap[row.user_id] = {
                status_type: row.status_type,
                description: row.description
            };
        });

        // Combine all users with their statuses or "Not Updated"
        const finalStatuses = users.map(user => {
            const userStatus = statusMap[user.id];
            return {
                user_id: user.id,
                full_name: user.full_name,
                username: user.username,
                status_type: userStatus ? userStatus.status_type : 'Not Updated',
                description: userStatus ? userStatus.description : ''
            };
        });

        res.json(finalStatuses);
    } catch (err) {
        console.error('Error fetching statuses:', err);
        res.status(500).json({ error: 'Server error fetching statuses' });
    }
});

// Create or update a status for the current user and the specified date
router.post('/status', verifyToken, async (req, res) => {
    try {
        const { date, status_type, description } = req.body;
        const user_id = req.user.id;

        if (!date || !status_type) {
            return res.status(400).json({ error: 'Date and status_type are required' });
        }

        const validStatuses = ['Worked On', 'Leave', 'WFO Exception', 'Not Updated'];
        if (!validStatuses.includes(status_type)) {
            return res.status(400).json({ error: 'Invalid status type' });
        }

        // Upsert query for PostgreSQL
        const upsertQuery = `
      INSERT INTO daily_status (user_id, date, status_type, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, date) 
      DO UPDATE SET 
        status_type = EXCLUDED.status_type,
        description = EXCLUDED.description
    `;

        await db.query(upsertQuery, [user_id, date, status_type, description || '']);

        res.json({ message: 'Status updated successfully' });
    } catch (err) {
        console.error('Error saving status:', err);
        res.status(500).json({ error: 'Server error saving status' });
    }
});

module.exports = router;
