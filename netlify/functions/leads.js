// Geschützte Lead-Ansicht: liefert die Kontakte aus Brevo als JSON.
// Zugriff nur mit gültigem Token (Netlify-Env LEADS_TOKEN); Brevo-Key bleibt serverseitig.
// Quellen: Liste 45 = "TheSkai Zahnarzt LinkedIn", Liste 46 = "TheSkai Zahnarzt Freebie".

const LISTS = [
  { id: 45, name: 'LinkedIn' },
  { id: 46, name: 'Freebie' },
];

exports.handler = async (event) => {
  const KEY = process.env.BREVO_API_KEY;
  const TOKEN = process.env.LEADS_TOKEN;
  if (!KEY || !TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server nicht konfiguriert (BREVO_API_KEY / LEADS_TOKEN fehlt)' }) };
  }

  // Token aus Header oder Query
  const given = (event.headers['x-access-token'] || (event.queryStringParameters || {}).t || '').trim();
  if (given !== TOKEN) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Zugriff verweigert' }) };
  }

  try {
    const byEmail = new Map();
    for (const list of LISTS) {
      let offset = 0;
      const limit = 500;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await fetch(`https://api.brevo.com/v3/contacts/lists/${list.id}/contacts?limit=${limit}&offset=${offset}`, {
          headers: { 'api-key': KEY, accept: 'application/json' },
        });
        if (!res.ok) {
          const t = await res.text();
          return { statusCode: 502, body: JSON.stringify({ error: 'Brevo-Fehler', detail: t }) };
        }
        const data = await res.json();
        const contacts = data.contacts || [];
        for (const c of contacts) {
          const a = c.attributes || {};
          const email = c.email;
          let row = byEmail.get(email);
          if (!row) {
            row = {
              email,
              firstname: a.FIRSTNAME || '',
              lastname: a.LASTNAME || '',
              title: a.TITLE || '',
              company: a.JOB_COMPANY || '',
              jobtitle: a.JOB_TITLE || '',
              location: a.LOCATION || '',
              country: a.COUNTRY || '',
              linkedin: a.LINKEDIN_URL || a.LINKEDIN || '',
              premium: a.LINKEDIN_PREMIUM || '',
              source: a.SOURCE || '',
              status: a.STATUS || 'offen',
              lastEmailed: a.LAST_EMAILED || '',
              blacklisted: !!c.emailBlacklisted,
              lists: [],
              createdAt: c.createdAt || '',
            };
            byEmail.set(email, row);
          }
          if (!row.lists.includes(list.name)) row.lists.push(list.name);
        }
        if (contacts.length < limit) break;
        offset += limit;
      }
    }

    const rows = Array.from(byEmail.values());
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ ok: true, count: rows.length, rows }),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: String(e) }) };
  }
};
