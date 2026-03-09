const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(403).json({ error: 'A token is required for authentication' });
    }

    try {
        const splitToken = token.split(' ')[1]; // "Bearer TOKEN"
        const decoded = jwt.verify(splitToken || token, process.env.JWT_SECRET);
        req.user = decoded;
    } catch (err) {
        return res.status(401).json({ error: 'Invalid Token' });
    }
    return next();
};

module.exports = verifyToken;
