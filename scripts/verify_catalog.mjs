import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const dir = 'd:/ascend_hub/public/models/zzz-covers';

const all17Tapes = [
  { id: 'soldier11', agent: 'Soldier 11', title: 'Mole in the Hole', front: 'soldier11_front.webp', spine: 'soldier11_spine.webp' },
  { id: 'nekomiya_mana', agent: 'Nekomiya Mana', title: 'Cat and Mouse Game', front: 'nekomiya_mana_front.webp', spine: 'nekomiya_mana_spine.webp' },
  { id: 'grace_howard', agent: 'Grace Howard', title: 'The Iron Witch', front: 'grace_howard_front.webp', spine: 'grace_howard_spine.webp' },
  { id: 'koleda_belobog', agent: 'Koleda Belobog', title: 'Schoolyard Powerhouse', front: 'koleda_belobog_front.webp', spine: 'koleda_belobog_spine.webp' },
  { id: 'von_lycaon', agent: 'Von Lycaon', title: 'And the True Heroes Are Always Behind the Scenes', front: 'von_lycaon_front.webp', spine: 'von_lycaon_spine.webp' },
  { id: 'alexandrina_sebastiane', agent: 'Alexandrina Sebastiane', title: 'Until Your Memory Fades', front: 'alexandrina_sebastiane_front.webp', spine: 'alexandrina_sebastiane_spine.webp' },
  { id: 'qingyi', agent: 'Qingyi', title: 'The Case of a Missing Bangboo', front: 'qingyi_front.webp', spine: 'qingyi_spine.webp' },
  { id: 'burnice_white', agent: 'Burnice White', title: 'A Stroke of Luck', front: 'burnice_white_front.webp', spine: 'burnice_white_spine.webp' },
  { id: 'lighter', agent: 'Lighter', title: 'The Unsung Champion', front: 'lighter_front.webp', spine: 'lighter_spine.webp' },
  { id: 'asaba_harumasa', agent: 'Asaba Harumasa', title: 'A Name Written in Water', front: 'asaba_harumasa_front.webp', spine: 'asaba_harumasa_spine.webp' },
  { id: 'ellen_joe', agent: 'Ellen Joe', title: "It's Me... Leave a Message", front: 'ellen_joe_front.webp', spine: 'ellen_joe_spine.webp' },
  { id: 'soldier_0_anby', agent: 'Soldier 0 - Anby', title: 'Echoes of Silver', front: 'soldier_0_anby_front.webp', spine: 'soldier_0_anby_spine.webp' },
  { id: 'trigger', agent: 'Trigger', title: 'Out of Sight', front: 'trigger_front.webp', spine: 'trigger_spine.webp' },
  { id: 'ju_fufu', agent: 'Ju Fufu', title: 'Legend of the Tiger Warrior!', front: 'ju_fufu_front.webp', spine: 'ju_fufu_spine.webp' },
  { id: 'seed', agent: 'Seed', title: 'Flora of the Blooming Valley', front: 'seed_front.webp', spine: 'seed_spine.webp' },
  { id: 'lucia_elowen', agent: 'Lucia Elowen', title: 'Tales of the Dreamless', front: 'lucia_elowen_front.webp', spine: 'lucia_elowen_spine.webp' },
  { id: 'phaethon', agent: 'Phaethon', title: 'Just Another Day at the Video Store', front: 'phaethon_front.webp', spine: 'phaethon_spine.webp' }
];

console.log(`Checking all ${all17Tapes.length} tapes...`);

const verifiedList = [];
let allValid = true;

for (const t of all17Tapes) {
  const fPath = path.join(dir, t.front);
  const sPath = path.join(dir, t.spine);

  const fStat = fs.existsSync(fPath) ? fs.statSync(fPath) : null;
  const sStat = fs.existsSync(sPath) ? fs.statSync(sPath) : null;

  const fValid = fStat && fStat.size > 20000;
  const sValid = sStat && sStat.size > 10000;

  if (!fValid || !sValid) {
    allValid = false;
    console.error(`[FAIL] ${t.agent}: front=${fStat ? fStat.size : 0}b, spine=${sStat ? sStat.size : 0}b`);
  } else {
    console.log(`[PASS] ${t.agent.padEnd(22)} | "${t.title.padEnd(36)}" | Front: ${(fStat.size / 1024).toFixed(1)} KB | Spine: ${(sStat.size / 1024).toFixed(1)} KB`);
  }

  verifiedList.push({
    ...t,
    frontPath: `/models/zzz-covers/${t.front}`,
    spinePath: `/models/zzz-covers/${t.spine}`,
    frontBytes: fStat ? fStat.size : 0,
    spineBytes: sStat ? sStat.size : 0,
    status: fValid && sValid ? 'VERIFIED' : 'FAILED'
  });
}

// Write the master verified catalog
fs.writeFileSync(
  path.join(dir, 'master_agent_stories.json'),
  JSON.stringify(verifiedList, null, 2)
);

console.log(`\nCatalog verification complete: ${allValid ? 'ALL 17 TAPES VERIFIED 100%' : 'SOME TAPES FAILED'}`);
