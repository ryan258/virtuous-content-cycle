const databaseService = require('./databaseService');
const focusGroupPersonas = require('./focusGroupPersonas.json');

console.log('🔄 Starting database migration...\n');

// Seed personas from focusGroupPersonas.json
console.log('📝 Seeding personas from focusGroupPersonas.json...');
databaseService.seedPersonas(focusGroupPersonas);
console.log(`✅ Seeded ${focusGroupPersonas.length} personas\n`);

// Verify seeding
const allPersonas = databaseService.getAllPersonas();
console.log('📊 Personas in database:');
allPersonas.forEach(p => {
  console.log(`  - ${p.id} (${p.type}): ${p.persona}`);
});

console.log('\n✨ Migration complete!');
