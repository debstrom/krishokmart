
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'krishok_user',
    password: 'Krishok@2026Secure',
    database: 'krishoknet'
});

db.connect((err) => {
    if (err) {
        console.log('❌ Database connection failed:', err.message);
        return;
    }

    console.log('✅ MySQL Connected Successfully!');
});

module.exports = db;
