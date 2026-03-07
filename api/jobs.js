export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { motsCles, commune, typeContrat, range } = req.query;

    const tokenRes = await fetch(
      'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: process.env.FT_CLIENT_ID,
          client_secret: process.env.FT_CLIENT_SECRET,
          scope: 'api_offresdemploiv2 o2dsoffre',
        }),
      }
    );

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(500).json({ error: 'Token error', detail: err });
    }

    const { access_token } = await tokenRes.json();

    const params = new URLSearchParams();
    if (motsCles) params.append('motsCles', motsCles);
    if (commune) params.append('commune', commune);
    if (typeContrat) params.append('typeContrat', typeContrat);
    params.append('range', range || '0-19');

    const offresRes = await fetch(
      `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params}`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: 'application/json',
        },
      }
    );

    if (!offresRes.ok) {
      const err = await offresRes.text();
      return res.status(500).json({ error: 'API error', detail: err });
    }

    const data = await offresRes.json();
    return res.status(200).json(data);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
