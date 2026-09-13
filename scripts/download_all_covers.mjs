import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const targetDir = 'd:/ascend_hub/public/models/zzz-covers';
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Full 17 ZZZ Agent Story Tapes matching the official Wiki table
const allTapes = [
  {
    id: 'soldier11',
    agent: 'Soldier 11',
    title: 'Mole in the Hole',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/d/db/Chapter_Soldier_11_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/e/e6/Chapter_Soldier_11_1_Tape_Spine.png'
  },
  {
    id: 'nekomiya_mana',
    agent: 'Nekomiya Mana',
    title: 'Cat and Mouse Game',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/8/81/Chapter_Nekomiya_Mana_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/b/b2/Chapter_Nekomiya_Mana_1_Tape_Spine.png'
  },
  {
    id: 'grace_howard',
    agent: 'Grace Howard',
    title: 'The Iron Witch',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/4/46/Chapter_Grace_Howard_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/9/9c/Chapter_Grace_Howard_1_Tape_Spine.png'
  },
  {
    id: 'koleda_belobog',
    agent: 'Koleda Belobog',
    title: 'Schoolyard Powerhouse',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/c/cd/Chapter_Koleda_Belobog_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/9/94/Chapter_Koleda_Belobog_1_Tape_Spine.png'
  },
  {
    id: 'von_lycaon',
    agent: 'Von Lycaon',
    title: 'And the True Heroes Are Always Behind the Scenes',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/4/40/Chapter_Von_Lycaon_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/d/d0/Chapter_Von_Lycaon_1_Tape_Spine.png'
  },
  {
    id: 'alexandrina_sebastiane',
    agent: 'Alexandrina Sebastiane',
    title: 'Until Your Memory Fades',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/4/42/Chapter_Alexandrina_Sebastiane_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/5/57/Chapter_Alexandrina_Sebastiane_1_Tape_Spine.png'
  },
  {
    id: 'qingyi',
    agent: 'Qingyi',
    title: 'The Case of a Missing Bangboo',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/9/97/Chapter_Qingyi_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/5/5e/Chapter_Qingyi_1_Tape_Spine.png'
  },
  {
    id: 'burnice_white',
    agent: 'Burnice White',
    title: 'A Stroke of Luck',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/d/da/Chapter_Burnice_White_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/4/4e/Chapter_Burnice_White_1_Tape_Spine.png'
  },
  {
    id: 'lighter',
    agent: 'Lighter',
    title: 'The Unsung Champion',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/1/10/Chapter_Lighter_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/5/5b/Chapter_Lighter_1_Tape_Spine.png'
  },
  {
    id: 'asaba_harumasa',
    agent: 'Asaba Harumasa',
    title: 'A Name Written in Water',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/2/25/Chapter_Asaba_Harumasa_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/2/2b/Chapter_Asaba_Harumasa_1_Tape_Spine.png'
  },
  {
    id: 'ellen_joe',
    agent: 'Ellen Joe',
    title: "It's Me... Leave a Message",
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/3/30/Chapter_Ellen_Joe_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/e/e8/Chapter_Ellen_Joe_1_Tape_Spine.png'
  },
  {
    id: 'soldier_0_anby',
    agent: 'Soldier 0 - Anby',
    title: 'Echoes of Silver',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bc/Chapter_Soldier_0_-_Anby_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/c/c2/Chapter_Soldier_0_-_Anby_1_Tape_Spine.png'
  },
  {
    id: 'trigger',
    agent: 'Trigger',
    title: 'Out of Sight',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/f/f4/Chapter_Trigger_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/1/1d/Chapter_Trigger_1_Tape_Spine.png'
  },
  {
    id: 'ju_fufu',
    agent: 'Ju Fufu',
    title: 'Legend of the Tiger Warrior!',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/9/9a/Chapter_Ju_Fufu_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/3/3d/Chapter_Ju_Fufu_1_Tape_Spine.png'
  },
  {
    id: 'seed',
    agent: 'Seed',
    title: 'Flora of the Blooming Valley',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/6/6b/Chapter_Seed_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/6/6a/Chapter_Seed_1_Tape_Spine.png'
  },
  {
    id: 'lucia_elowen',
    agent: 'Lucia Elowen',
    title: 'Tales of the Dreamless',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/a/a9/Chapter_Lucia_Elowen_1_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/8/82/Chapter_Lucia_Elowen_1_Tape_Spine.png'
  },
  {
    id: 'phaethon',
    agent: 'Phaethon',
    title: 'Just Another Day at the Video Store',
    frontUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/b/bd/Chapter_Just_Another_Day_at_the_Video_Store_Tape_Cover_Front.png',
    spineUrl: 'https://static.wikia.nocookie.net/zenless-zone-zero/images/f/fc/Chapter_Just_Another_Day_at_the_Video_Store_Tape_Spine.png'
  }
];

console.log(`Starting download and verification of all ${allTapes.length} tapes...`);

const manifest = [];

for (const t of allTapes) {
  const frontFilename = `${t.id}_front.webp`;
  const spineFilename = `${t.id}_spine.webp`;
  const frontPath = path.join(targetDir, frontFilename);
  const spinePath = path.join(targetDir, spineFilename);

  // Download Front
  if (!fs.existsSync(frontPath) || fs.statSync(frontPath).size < 10000) {
    try {
      execSync(`curl.exe -s -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -o "${frontPath}" "${t.frontUrl}"`);
    } catch (e) {
      console.error(`Failed front ${t.agent}:`, e.message);
    }
  }

  // Download Spine
  if (!fs.existsSync(spinePath) || fs.statSync(spinePath).size < 5000) {
    try {
      execSync(`curl.exe -s -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -o "${spinePath}" "${t.spineUrl}"`);
    } catch (e) {
      console.error(`Failed spine ${t.agent}:`, e.message);
    }
  }

  const frontSize = fs.existsSync(frontPath) ? fs.statSync(frontPath).size : 0;
  const spineSize = fs.existsSync(spinePath) ? fs.statSync(spinePath).size : 0;

  console.log(`[OK] ${t.agent} - "${t.title}": front=${frontSize}b, spine=${spineSize}b`);

  manifest.push({
    ...t,
    frontFile: `/models/zzz-covers/${frontFilename}`,
    spineFile: `/models/zzz-covers/${spineFilename}`,
    frontBytes: frontSize,
    spineBytes: spineSize
  });
}

fs.writeFileSync(
  path.join(targetDir, 'all_covers_manifest.json'),
  JSON.stringify(manifest, null, 2)
);

console.log(`Saved all ${manifest.length} covers to ${targetDir}`);
