const fs = require('fs');
const csv = fs.readFileSync('subjects.csv', 'utf8');
const lines = csv.trim().split('\n');
const seen = new Set();
const results = [];
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  if (cols.length < 5) continue;
  let name = cols[0].trim().replace(/^"+|"+$/g, '');
  const credit = cols[1].trim();
  const responsible = cols[2].trim().replace(/^"+|"+$/g, '');
  const language = cols[3].trim().replace(/^"+|"+$/g, '');
  const link = cols.slice(4).join(',').trim().replace(/^"+|"+$/g, '');
  if (!name) continue;
  const key = name + '|' + credit + '|' + responsible + '|' + link;
  if (seen.has(key)) continue;
  seen.add(key);
  const creditNum = Number(credit) || 0;
  results.push({ name, credit: creditNum, responsible, language, link });
}
fs.writeFileSync('courses.json', JSON.stringify(results, null, 2), 'utf8');
console.log('Wrote ' + results.length + ' unique courses');
const zero = results.filter(c => c.credit === 0);
console.log('0-credit:', zero.length);
console.log('Sample:', zero.slice(0, 3).map(c => c.name));
