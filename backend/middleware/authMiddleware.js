const jwt = require('jsonwebtoken');
require('dotenv').config();

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({ message: '❌ No token provided!' });
    }

    const token = authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: '❌ Invalid token!' });
    }
};

const isFarmer = (req, res, next) => {
    if (req.user.role !== 'farmer') {
        return res.status(403).json({ message: '❌ Farmers only!' });
    }
    next();
};

const isBuyer = (req, res, next) => {
    if (req.user.role !== 'buyer') {
        return res.status(403).json({ message: '❌ Buyers only!' });
    }
    next();
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: '❌ Admins only!' });
    }
    next();
};

module.exports = { verifyToken, isFarmer, isBuyer, isAdmin };