import mysql from 'mysql2/promise'
import { readFileSync } from 'fs'

// Read password from convention file path (portable across machines)
let password = process.env.DB_PASSWORD
try {
  const appName = process.env.DB_NAME || 'iachat-v2'
  password = readFileSync(`/apps/${appName}/etc/mysql/localhost/passwd`, 'utf8').trim()
} catch {
  // Fallback to .env value
}

const pool = mysql.createPool({
  host: '127.0.0.1',    // Use IP to avoid DNS resolution (MariaDB skip-name-resolve is ON)
  port: 3306,
  user: process.env.DB_USER || 'iachat-v2',
  password,
  database: process.env.DB_NAME || 'iachat-v2',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
})

pool.getConnection()
  .then(conn => {
    console.log('✅ MariaDB connected')
    conn.release()
  })
  .catch(err => console.error('❌ MariaDB connection error:', err.message))

export default pool
