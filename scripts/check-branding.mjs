import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const repoRoot = process.cwd();

const filesToCheck = [
  'README.md',
  'SERVER-SETUP.md',
  'CLAUDE.md',
  'setup.sh',
  'admin/index.html',
  'admin/src/lib/brand.ts',
  'admin/src/pages/LoginPage.tsx',
  'admin/src/pages/DashboardPage.tsx',
  'admin/src/pages/AppEditorPage.tsx',
  'admin/src/components/template-configs/Custom01TimelineConfig.tsx',
  'admin/src/components/template-configs/Custom06ReceptionConfig.tsx',
  'admin/src/components/template-configs/Custom08MuseumKioskConfig.tsx',
  'display/index.html',
  'display/src/lib/brand.ts',
  'display/src/lib/logger.ts',
  'display/src/templates/custom/custom01-hilight-timeline/components/ambient/AmbientTitle.tsx',
  'display/src/templates/custom/custom01-hilight-timeline/context/timeline-data-store.ts',
  'display/src/templates/custom/custom08-museum-kiosk/components/CategoryInfoPanel/CategoryInfoPanel.tsx',
  'display/src/templates/custom/custom08-museum-kiosk/components/Screensaver/Screensaver.tsx',
  'display/src/templates/custom/custom08-museum-kiosk/data/categories.ts',
  'display/src/templates/custom/custom08-museum-kiosk/data/editorConfig.json',
  'server/package.json',
  'agent/package.json',
  'agent/configure-wol.ps1',
  'server/src/services/agentWs.ts',
  'server/src/services/displayWs.ts',
  'server/seeds/001_default_data.ts',
  'server/seeds/002_demo_apps.ts',
  'server/migrations/20260613_016_hilight_universal_branding.ts',
];

const legacyBrandPatterns = [
  /\bMUSEUM OS\b/,
  /\bMuseum OS\b/,
  /museumos/i,
  /\bhiLight\b/,
  /\bHiLight\b/,
  /\bHilight\b/,
  /\bHILIGHT\b/,
  /admin@hilight\.local/,
  /admin@museumos\.local/,
];

const allowedLegacyPatterns = [
  /custom01-hilight-timeline/,
  /hilight-museum/,
  /spirit_of_hiLight/,
];

const failures = [];

for (const file of filesToCheck) {
  const absolutePath = join(repoRoot, file);
  let content;
  try {
    content = await readFile(absolutePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') continue;
    throw err;
  }
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const hasLegacyBrand = legacyBrandPatterns.some((pattern) => pattern.test(line));
    const isAllowedLegacy = allowedLegacyPatterns.some((pattern) => pattern.test(line));

    if (hasLegacyBrand && !isAllowedLegacy) {
      failures.push(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (failures.length > 0) {
  console.error('Legacy visible branding found. Replace it with Curato:');
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Curato branding check passed.');
