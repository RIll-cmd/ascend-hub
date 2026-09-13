import fs from 'fs';

const content = fs.readFileSync('C:/Users/Cyrill Gerard/.gemini/antigravity-ide/brain/58791957-2ec3-4395-a935-4aa7f20c3233/.system_generated/steps/530/content.md', 'utf8');

const findUrls = (name) => {
  const re = new RegExp(`https://static\\.wikia\\.nocookie\\.net/zenless-zone-zero/images/[^"'><\\s]*${name}[^"'><\\s]*`, 'gi');
  const m = content.match(re) || [];
  return Array.from(new Set(m.map(u => u.split('/revision/')[0])));
};

console.log('Koleda:', findUrls('Koleda'));
console.log('Seed:', findUrls('Seed'));
console.log('Lycaon:', findUrls('Lycaon'));
console.log('Ellen:', findUrls('Ellen'));
