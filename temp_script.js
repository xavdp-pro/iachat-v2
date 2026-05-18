require('./server/env.js');
const https = require('https');

const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const ownerEmail = 'armand.guilhot@zerux.com';
const dealNames = ['Test Armand 12.05', 'Test deal Armand 13.05'];

async function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.hubapi.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  try {
    const ownersResp = await request('/crm/v3/owners?limit=100');
    const owner = (ownersResp.results || []).find(o => o.email === ownerEmail);
    if (!owner) {
      console.log('Owner not found');
      return;
    }
    const ownerId = owner.id;

    const searchBody = {
      filterGroups: [{
        filters: [{
          propertyName: 'dealname',
          operator: 'IN',
          values: dealNames
        }]
      }],
      properties: ['dealname', 'hubspot_owner_id']
    };
    const searchResp = await request('/crm/v3/objects/deals/search', 'POST', searchBody);
    
    if (!searchResp.results || searchResp.results.length === 0) {
        console.log('No deals found');
        return;
    }

    for (const deal of searchResp.results) {
      await request(`/crm/v3/objects/deals/${deal.id}`, 'PATCH', {
        properties: { hubspot_owner_id: ownerId }
      });
      
      const updatedDeal = await request(`/crm/v3/objects/deals/${deal.id}?properties=dealname,hubspot_owner_id`);
      console.log(JSON.stringify({
        dealId: updatedDeal.id,
        dealname: updatedDeal.properties.dealname,
        hubspot_owner_id: updatedDeal.properties.hubspot_owner_id,
        targetOwnerId: ownerId,
        success: updatedDeal.properties.hubspot_owner_id === ownerId
      }));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
