const fs = require('fs');
const path = require('path');

async function run() {
  try {
    require('./server/env.js');
    const db = require('./server/db/index.js');
    const axios = require('axios');

    const HUBSPOT_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    if (!HUBSPOT_TOKEN) {
      console.error('Missing HUBSPOT_PRIVATE_APP_TOKEN');
      process.exit(1);
    }

    const hsHeaders = {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json'
    };

    const ownersRes = await axios.get('https://api.hubapi.com/crm/v3/owners?limit=100', { headers: hsHeaders });
    const owners = ownersRes.data.results;
    const ownersByEmail = {};
    owners.forEach(o => {
      if (o.email) ownersByEmail[o.email.toLowerCase()] = o;
    });

    const [users] = await db.query('SELECT id, email, hubspot_user_email FROM users WHERE hubspot_user_email IS NOT NULL');
    
    let userUpdates = 0;
    for (const user of users) {
      const email = user.hubspot_user_email.toLowerCase();
      if (ownersByEmail[email]) {
        const owner = ownersByEmail[email];
        const name = `${owner.firstName || ''} ${owner.lastName || ''}`.trim();
        await db.query('UPDATE users SET hubspot_user_id = ?, hubspot_user_name = ? WHERE id = ?', [owner.id, name, user.id]);
        userUpdates++;
      }
    }

    const armandOwner = owners.find(o => (o.firstName && o.firstName.toLowerCase().includes('armand')) || (o.email && o.email.toLowerCase().includes('armand')));
    
    const dealsRes = await axios.get('https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=dealname,hubspot_owner_id', { headers: hsHeaders });
    const deals = dealsRes.data.results;

    const summary = {
      usersUpdated: userUpdates,
      dealsUpdated: [],
      dealsIgnored: [],
      errors: []
    };

    for (const deal of deals) {
      const name = deal.properties.dealname || '';
      const currentOwner = deal.properties.hubspot_owner_id;

      if (!currentOwner) {
        if (name.includes('Armand')) {
          if (armandOwner) {
            await axios.patch(`https://api.hubapi.com/crm/v3/objects/deals/${deal.id}`, {
              properties: { hubspot_owner_id: armandOwner.id }
            }, { headers: hsHeaders });
            summary.dealsUpdated.push(`${name} (ID: ${deal.id}) -> Armand`);
          } else {
            summary.errors.push(`Armand owner not found in HS for deal: ${name}`);
          }
        } else if (name.includes('Nouveau projet')) {
          const [rows] = await db.query('SELECT u.hubspot_user_id FROM quotes q JOIN users u ON q.created_by = u.id WHERE q.hubspot_deal_id = ? AND u.hubspot_user_id IS NOT NULL LIMIT 1', [deal.id]);
          if (rows.length > 0) {
             await axios.patch(`https://api.hubapi.com/crm/v3/objects/deals/${deal.id}`, {
              properties: { hubspot_owner_id: rows[0].hubspot_user_id }
            }, { headers: hsHeaders });
            summary.dealsUpdated.push(`${name} (ID: ${deal.id}) -> ${rows[0].hubspot_user_id}`);
          } else {
            summary.dealsIgnored.push(`${name} (ID: ${deal.id}) - No local creator with hubspot_user_id found`);
          }
        }
      }
    }

    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) console.error('Response Data:', JSON.stringify(err.response.data));
    process.exit(1);
  }
}

run();
