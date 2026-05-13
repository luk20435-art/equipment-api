const bcrypt = require('bcrypt');

// Generate password hashes for demo accounts
const passwords = ['admin123', 'manager123', 'employee123', 'tech123'];

async function generateHashes() {
  console.log('Generating password hashes...\n');
  
  for (const password of passwords) {
    const hash = await bcrypt.hash(password, 10);
    console.log(`Password: ${password}`);
    console.log(`Hash: ${hash}\n`);
  }
}

generateHashes();
