import runtime from '../config/runtime.json' assert { type: 'json' };

const LINK_REGEX = /\[\[(.+?)(?:->|\|)(.+?)\]\]/g;

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
  return choices.slice(0, 2);
}

export function importTwineToStory(rawTwine, options = {}) {
  const defaultTimeoutSeconds = options.defaultTimeoutSeconds ?? runtime.defaultTimeoutSeconds;
  const startSceneId = options.startSceneId ?? runtime.storyStartSceneId;
  const passages = parsePassages(rawTwine);

  const scenes = passages.map((passage) => ({
    sceneId: passage.name,
    displayText: stripChoiceMarkup(passage.body),
    narrationAudio: '',
    backgroundVideo: '',
    ambientSfx: '',
    soundtrack: '',
    timeoutSeconds: defaultTimeoutSeconds,
    onTimeout: startSceneId,
    choices: extractChoices(passage.body)
  }));

  return {
    title: options.title ?? 'Arctic Survival Story',
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
    if (scene.choices.length !== 2) {
      errors.push(`scene "${scene.sceneId}" must have exactly 2 choices`);
    }

    if (!sceneIdSet.has(scene.onTimeout)) {
      errors.push(`scene "${scene.sceneId}" has unknown onTimeout target "${scene.onTimeout}"`);
    }

    for (const choice of scene.choices) {
      if (!sceneIdSet.has(choice.targetSceneId)) {
        errors.push(
          `scene "${scene.sceneId}" choice "${choice.id}" targets unknown scene "${choice.targetSceneId}"`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
