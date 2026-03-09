require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const authRoutes = require('./routes/auth');
const statusRoutes = require('./routes/status');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api', authRoutes);
app.use('/api', statusRoutes);

// Database cleanup logic (delete records older than 3 months)
const runCleanup = async () => {
    try {
        const isSqlite = process.env.DB_TYPE === 'sqlite';
        const query = isSqlite
            ? "DELETE FROM daily_status WHERE date <= date('now', '-3 months')"
            : "DELETE FROM daily_status WHERE date <= NOW() - INTERVAL '3 months'";

        const res = await db.query(query);
        console.log(`Cleanup ran: Deleted ${res.rowCount} old status records.`);
    } catch (err) {
        console.error('Error during cleanup:', err);
    }
};

// Run cleanup once on startup, then every 24 hours
runCleanup();
setInterval(runCleanup, 24 * 60 * 60 * 1000);

// Basic catch-all to serve index for SPA-like behavior if needed
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
