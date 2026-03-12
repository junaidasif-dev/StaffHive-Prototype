const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
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

  const { reportId } = req.query;

  if (!reportId) {
    return res.status(400).json({ error: 'Missing reportId parameter' });
  }

  try {
    const { rows } = await pool.query(`
      SELECT r.id, r.match_score, r.match_details, r.status, r.created_at,
             c.full_name as candidate_name, c.resume_file_name,
             j.title as job_title, j.company as job_company
      FROM match_reports r
      JOIN candidates c ON r.candidate_id = c.id
      JOIN jobs j ON r.job_id = j.id
      WHERE r.id = $1::uuid;
    `, [reportId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    res.status(200).json(rows[0]);
  } catch (err) {
    console.error('DB Read Error:', err);
    res.status(500).json({ error: 'Failed to fetch report details', details: err.message });
  }
}
