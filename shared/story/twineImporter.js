import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtime = JSON.parse(readFileSync(path.join(__dirname, '../config/runtime.json'), 'utf8'));

const LINK_REGEX = /\[\[(.+?)(?:->|\|)(.+?)\]\]/g;

/** Strip JSON underscore-prefixed documentation keys */
function stripConfigMeta(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (k.startsWith('_')) {
      delete out[k];
    }
  }
  return out;
}

function parsePassages(rawTwine) {
  const sections = rawTwine.split('::').map((s) => s.trim()).filter(Boolean);
  const passages = [];

  for (const section of sections) {
    const [header, ...bodyParts] = section.split('\n');
    if (!header || bodyParts.length === 0) {
      continue;
    }

    const name = header.trim().split('[')[0].trim();
    const body = bodyParts.join('\n').trim();
    passages.push({ name, body });
  }

  return passages;
}

function stripChoiceMarkup(body) {
  return body.replace(LINK_REGEX, '').trim();
}

function extractChoices(body) {
  const choices = [];
  for (const match of body.matchAll(LINK_REGEX)) {
    choices.push({
      id: `choice_${choices.length + 1}`,
      label: match[1].trim(),
      targetSceneId: match[2].trim()
    });
  }
  return choices;
}

function applyChoiceOverrides(extracted, perScene) {
  if (Array.isArray(perScene.choices) && perScene.choices.length > 0) {
    return perScene.choices;
  }
  const n = extracted.length;
  let choices = extracted;
  const ids = perScene.choiceIds;
  const labels = perScene.choiceLabels;
  if (Array.isArray(ids) && ids.length === n && n > 0) {
    choices = choices.map((c, i) => ({ ...c, id: ids[i] ?? c.id }));
  }
  if (Array.isArray(labels) && labels.length === n && n > 0) {
    choices = choices.map((c, i) => ({ ...c, label: labels[i] ?? c.label }));
  }
  return choices;
}

export function importTwineToStory(rawTwine, options = {}) {
  const sceneConfig = stripConfigMeta(options.sceneConfig ?? null);
  const fileDefaults = stripConfigMeta(sceneConfig?.defaults ?? {});

  const defaultTimeoutSeconds =
    fileDefaults.timeoutSeconds ?? options.defaultTimeoutSeconds ?? runtime.defaultTimeoutSeconds;
  const startSceneId =
    sceneConfig?.startSceneId ?? options.startSceneId ?? runtime.storyStartSceneId;
  const defaultReveal =
    fileDefaults.choicesRevealSecondsBeforeEnd ??
    options.defaultChoicesRevealSecondsBeforeEnd ??
    runtime.defaultChoicesRevealSecondsBeforeEnd;
  const defaultOnTimeout = fileDefaults.onTimeout ?? startSceneId;

  const passages = parsePassages(rawTwine);

  const scenes = passages.map((passage) => {
    const perScene = stripConfigMeta(sceneConfig?.scenes?.[passage.name] ?? {});
    const extracted = extractChoices(passage.body);
    const choices = applyChoiceOverrides(extracted, perScene);
    const stripText = stripChoiceMarkup(passage.body);

    const narration =
      perScene.narrationAudio !== undefined
        ? perScene.narrationAudio
        : (fileDefaults.narrationAudio ?? '');
    const ambient =
      perScene.ambientSfx !== undefined ? perScene.ambientSfx : (fileDefaults.ambientSfx ?? '');
    const soundtrack =
      perScene.soundtrack !== undefined ? perScene.soundtrack : (fileDefaults.soundtrack ?? '');

    const scene = {
      sceneId: passage.name,
      displayText: perScene.displayText ?? stripText,
      narrationAudio: narration,
      backgroundVideo:
        perScene.backgroundVideo !== undefined
          ? perScene.backgroundVideo
          : (fileDefaults.backgroundVideo ?? ''),
      ambientSfx: ambient,
      soundtrack,
      timeoutSeconds: perScene.timeoutSeconds ?? defaultTimeoutSeconds,
      choicesRevealSecondsBeforeEnd: perScene.choicesRevealSecondsBeforeEnd ?? defaultReveal,
      onTimeout: perScene.onTimeout ?? defaultOnTimeout,
      choices
    };
    if (perScene.holdFirstFrame === true) {
      scene.holdFirstFrame = true;
    }
    if (perScene.hideTabletTimer === true) {
      scene.hideTabletTimer = true;
    }
    const ns = perScene.nextSceneId;
    if (typeof ns === 'string' && ns.trim() !== '') {
      scene.nextSceneId = ns.trim();
    }
    return scene;
  });

  return {
    title: sceneConfig?.title ?? options.title ?? 'The Price of Absolution',
    startSceneId,
    scenes
  };
}

export function validateStory(story) {
  const errors = [];
  const sceneIdSet = new Set(story.scenes.map((scene) => scene.sceneId));

  if (!sceneIdSet.has(story.startSceneId)) {
    errors.push(`startSceneId "${story.startSceneId}" is missing from scenes`);
  }

  for (const scene of story.scenes) {
    const choiceCount = scene.choices?.length ?? 0;
    if (choiceCount === 0) {
      if (!scene.nextSceneId || !sceneIdSet.has(scene.nextSceneId)) {
        errors.push(
          `scene "${scene.sceneId}" has no choices and must set nextSceneId to a valid scene`
        );
      }
    }

    if (scene.onTimeout == null || scene.onTimeout === '' || !sceneIdSet.has(scene.onTimeout)) {
      errors.push(`scene "${scene.sceneId}" has missing or unknown onTimeout target "${scene.onTimeout}"`);
    }

    for (const choice of scene.choices ?? []) {
      if (!sceneIdSet.has(choice.targetSceneId)) {
        errors.push(
          `scene "${scene.sceneId}" choice "${choice.id}" targets unknown scene "${choice.targetSceneId}"`
        );
      }
    }

    if (
      scene.nextSceneId &&
      scene.nextSceneId !== '' &&
      !sceneIdSet.has(scene.nextSceneId)
    ) {
      errors.push(`scene "${scene.sceneId}" has unknown nextSceneId "${scene.nextSceneId}"`);
    }

    const reveal = scene.choicesRevealSecondsBeforeEnd;
    if (reveal !== undefined) {
      if (typeof reveal !== 'number' || reveal < 1) {
        errors.push(
          `scene "${scene.sceneId}" choicesRevealSecondsBeforeEnd must be a number >= 1 when set`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
