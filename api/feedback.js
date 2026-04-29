import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_njOMe6l4HKPx@ep-green-haze-a4bu28ol-pooler.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';
const sql = neon(DATABASE_URL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT id, section, label, rating, text, author, created_at FROM feedback ORDER BY created_at DESC LIMIT 500`;
      return res.status(200).json(rows);
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { section, label, rating, text, author } = body || {};
      if (!section || !label) return res.status(400).json({ error: 'section and label are required' });
      const result = await sql`
        INSERT INTO feedback (section, label, rating, text, author)
        VALUES (${section}, ${label}, ${rating || null}, ${text || null}, ${author || null})
        RETURNING id, section, label, rating, text, author, created_at
      `;
      return res.status(200).json(result[0]);
    }
    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      await sql`DELETE FROM feedback WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Feedback API error:', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
