module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({
      error: 'Vercel mein Supabase environment variables set karo.'
    });
  }

  const token = String(req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ error: 'Admin login required hai.' });
  }

  try {
    const baseUrl = supabaseUrl.replace(/\/$/, '');

    const userRes = await fetch(baseUrl + '/auth/v1/user', {
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + token
      }
    });

    if (!userRes.ok) {
      return res.status(401).json({
        error: 'Admin session valid nahi hai. Dobara login karo.'
      });
    }

    const adminRes = await fetch(baseUrl + '/rest/v1/rpc/is_ft_admin', {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });

    if (!adminRes.ok || (await adminRes.json()) !== true) {
      return res.status(403).json({
        error: 'Yeh action sirf FAT TIGER admin kar sakta hai.'
      });
    }

    const rawUrl = req.query.url;

    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({ error: 'Image URL required hai.' });
    }

    let imageUrl;
    try {
      imageUrl = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'Image URL invalid hai.' });
    }

    const allowed = imageUrl.protocol === 'https:' &&
      (
        (imageUrl.hostname === 'pixabay.com' &&
          imageUrl.pathname.startsWith('/get/')) ||
        (imageUrl.hostname === 'cdn.pixabay.com' &&
          imageUrl.pathname.startsWith('/photo/'))
      );

    if (!allowed) {
      return res.status(400).json({
        error: 'Only official Pixabay image links allowed hain.'
      });
    }

    const response = await fetch(imageUrl.toString());

    if (!response.ok) {
      return res.status(502).json({
        error: 'Pixabay image download fail hui.'
      });
    }

    const contentType = String(
      response.headers.get('content-type') || ''
    ).split(';')[0].toLowerCase();

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      return res.status(415).json({
        error: 'Image format supported nahi hai.'
      });
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
      return res.status(413).json({
        error: 'Image empty hai ya 8 MB se badi hai.'
      });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', String(bytes.length));

    return res.status(200).send(bytes);
  } catch (error) {
    return res.status(500).json({
      error: 'Image download error: ' +
        (error && error.message ? error.message : 'Unknown error')
    });
  }
};
