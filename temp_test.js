import './server/env.js';
import { loadApprovedRules, validateLine } from './server/services/rules-validator.js';
import { defaultModel } from './server/services/ollama.js';

async function run() {
  const rules = await loadApprovedRules();
  const line = {
    designation: 'BP 1V',
    type_porte: 'BP 1V',
    gamme: 'CR3',
    vantail: '1V',
    hauteur_mm: 2290,
    largeur_mm: 900,
    prix_base_ht: 4211,
    ref_base: null,
    rc: 'CR3',
    pb: 'FB4',
    alertes: ['RC CR3', 'PB FB4']
  };

  const results = await validateLine(line, rules);
  
  const technicalVerdicts = results.filter(v => v.source === 'validation');
  const businessVerdicts = results.filter(v => v.source !== 'validation');

  console.log('rules count:', rules.length);
  console.log('verdicts count:', results.length);
  console.log('technical verdicts count:', technicalVerdicts.length);
  console.log('business verdicts count:', businessVerdicts.length);

  businessVerdicts.forEach(v => {
    const code = (v.rule_code || v.title || 'N/A').substring(0, 20);
    const reason = (v.reason || '').substring(0, 50);
    console.log(`${v.status}, ${code}, ${reason}`);
  });
}

run().catch(console.error);
