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

  const { candidateId } = req.query;

  if (!candidateId) {
    return res.status(400).json({ error: 'Missing candidateId parameter' });
  }

  try {
    const { rows } = await pool.query(`
      SELECT r.id, r.job_id, r.match_score, r.status, r.created_at,
             j.title as job_title, j.company as job_company
      FROM match_reports r
      JOIN jobs j ON r.job_id = j.id
      WHERE r.candidate_id = $1
      ORDER BY r.created_at DESC;
    `, [candidateId]);
    
    res.status(200).json(rows);
  } catch (err) {
    console.error('DB Read Error:', err);
    res.status(500).json({ error: 'Failed to fetch candidate reports', details: err.message });
  }
}
