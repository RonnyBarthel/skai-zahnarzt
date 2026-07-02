// Serverless-Proxy: nimmt das Formular entgegen und legt den Lead in Brevo an.
// Der API-Key liegt NUR hier serverseitig (Netlify Env-Var BREVO_API_KEY) — nie im Browser.
// Zielliste: "TheSkai Zahnarzt Freebie" (Brevo-Listen-ID 46, Konto Power of AI).

const LIST_ID = 46;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const KEY = process.env.BREVO_API_KEY;
  if (!KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'BREVO_API_KEY fehlt' }) };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Ungültige Daten' }) };
  }

  const email = (data.email || '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'E-Mail ungültig' }) };
  }

  // Name in Vor-/Nachname aufteilen (best effort)
  const parts = (data.name || '').trim().split(/\s+/);
  const firstname = parts.shift() || '';
  const lastname = parts.join(' ');

  const payload = {
    email,
    updateEnabled: true,
    attributes: {
      FIRSTNAME: firstname,
      LASTNAME: lastname,
      // Telefon als reines Textfeld (SMS-Feld verlangt +49-Format und würde 0151-Nummern ablehnen).
      LANDLINE_NUMBER: (data.tel || '').trim() || undefined,
      SOURCE: 'LP Zahnarzt Freebie',
    },
    listIds: [LIST_ID],
  };

  try {
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'api-key': KEY, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // 201 = neu, 204 = aktualisiert. Beides ok.
    if (res.status === 201 || res.status === 204) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
    // Bereits vorhanden o.ä. — trotzdem als Erfolg werten, damit der Nutzer den Report bekommt.
    const detail = await res.text();
    if (res.status === 400 && /duplicate|already/i.test(detail)) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, note: 'exists' }) };
    }
    return { statusCode: 502, body: JSON.stringify({ error: 'Brevo-Fehler', detail }) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: String(e) }) };
  }
};
