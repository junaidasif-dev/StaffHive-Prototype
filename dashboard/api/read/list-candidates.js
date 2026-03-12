const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { rows } = await pool.query(`
      SELECT id, full_name, email, phone, resume_file_name, parse_status, created_at
      FROM candidates
      ORDER BY created_at DESC;
    `);
    
    res.status(200).json(rows);
  } catch (err) {
    console.error('DB Read Error:', err);
    res.status(500).json({ error: 'Failed to fetch candidates', details: err.message });
  }
}
