const fs = require('fs');
const code = fs.readFileSync('/apps/zeruxcom-v1/app/iachat-v2/src/pages/Admin.jsx', 'utf8');
const { parse } = require('@babel/parser');
try {
  parse(code, { sourceType: 'module', plugins: ['jsx'] });
  console.log('OK');
} catch (err) {
  console.error('Error line:', err.loc?.line, err.message);
  if (err.loc) {
    const lines = code.split('\n');
    for(let i = err.loc.line - 15; i <= err.loc.line + 5; i++) {
        console.log(`${i+1}: ${lines[i]}`);
    }
  }
}
