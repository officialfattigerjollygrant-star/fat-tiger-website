module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.PIXABAY_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!key) return res.status(500).json({ error: 'Vercel environment variable PIXABAY_API_KEY missing hai.' });
  if (!supabaseUrl || !anonKey) return res.status(500).json({ error: 'Vercel mein SUPABASE_URL aur SUPABASE_ANON_KEY environment variables bhi set karo.' });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Admin login required hai.' });
  try {
    const userRes = await fetch(supabaseUrl.replace(/\/$/, '') + '/auth/v1/user', { headers: { apikey: anonKey, Authorization: 'Bearer ' + token } });
    if (!userRes.ok) return res.status(401).json({ error: 'Admin session valid nahi hai. Dobara login karo.' });
    const adminRes = await fetch(supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/is_ft_admin', { method: 'POST', headers: { apikey: anonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
    if (!adminRes.ok || (await adminRes.json()) !== true) return res.status(403).json({ error: 'Yeh action sirf FAT TIGER admin kar sakta hai.' });
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return res.status(400).json({ error: 'Search term required hai.' });
    const upstream = new URL('https://pixabay.com/api/');
    upstream.searchParams.set('key', key);
    upstream.searchParams.set('q', q);
    upstream.searchParams.set('image_type', 'photo');
    upstream.searchParams.set('category', 'food');
    upstream.searchParams.set('safesearch', 'true');
    upstream.searchParams.set('per_page', '12');
    upstream.searchParams.set('order', 'popular');
    upstream.searchParams.set('lang', 'en');
    const apiRes = await fetch(upstream.toString());
    if (apiRes.status === 401 || apiRes.status === 403) return res.status(502).json({ error: 'Pixabay API key invalid ya access denied hai.' });
    if (apiRes.status === 429) return res.status(429).json({ error: 'Pixabay API rate limit aa gayi. Thodi der baad try karo.' });
    if (!apiRes.ok) return res.status(502).json({ error: 'Pixabay search failed (HTTP ' + apiRes.status + ').' });
    const data = await apiRes.json();
    // Browser-private 24h caching honours Pixabay's API cache requirement without exposing the key.
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Vary', 'Authorization');
    return res.status(200).json({ totalHits: data.totalHits || 0, hits: (data.hits || []).map(h => ({ id: h.id, tags: h.tags, previewURL: h.previewURL, webformatURL: h.webformatURL, largeImageURL: h.largeImageURL || h.webformatURL, pageURL: h.pageURL, user: h.user, user_id: h.user_id })) });
  } catch (err) {
    return res.status(500).json({ error: 'Search error: ' + (err && err.message ? err.message : 'Unknown error') });
  }
};
