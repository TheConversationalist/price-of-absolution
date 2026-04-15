import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importTwineToStory, validateStory } from '../shared/story/twineImporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

const twinePath = process.argv[2] || path.join(repoRoot, 'story.twee');
const outputPath = process.argv[3] || path.join(repoRoot, 'shared/story/story.generated.json');

const rawTwine = await fs.readFile(twinePath, 'utf8');
const story = importTwineToStory(rawTwine);
const validation = validateStory(story);

if (!validation.valid) {
  console.error('Story validation failed:');
  for (const error of validation.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

await fs.writeFile(outputPath, JSON.stringify(story, null, 2));
console.log(`Generated story JSON at ${outputPath}`);
