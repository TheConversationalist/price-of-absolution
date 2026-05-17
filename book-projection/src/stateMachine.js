export class StoryStateMachine {
  constructor(story) {
    this.story = story;
    this.sceneMap = new Map(story.scenes.map((scene) => [scene.sceneId, scene]));
    this.currentSceneId = story.startSceneId;
  }

  getCurrentScene() {
    return this.sceneMap.get(this.currentSceneId);
  }

  transitionToScene(sceneId) {
    if (!this.sceneMap.has(sceneId)) {
      return false;
    }

    this.currentSceneId = sceneId;
    return true;
  }

  chooseOption(choiceId) {
    const scene = this.getCurrentScene();
    const choice = scene?.choices?.find((entry) => entry.id === choiceId);
    if (!choice) {
      return null;
    }

    if (this.transitionToScene(choice.targetSceneId)) {
      return this.getCurrentScene();
    }

    return null;
  }

  /** After background video ends: linear scenes follow nextSceneId; branching scenes use onTimeout. */
  advanceAfterClip() {
    const scene = this.getCurrentScene();
    if (!scene) {
      return null;
    }
    const hasBranches = (scene.choices?.length ?? 0) > 0;
    if (!hasBranches) {
      const next = scene.nextSceneId;
      if (typeof next === 'string' && next.length > 0 && this.sceneMap.has(next)) {
        this.currentSceneId = next;
        return this.getCurrentScene();
      }
    }
    return this.timeout();
  }

  timeout() {
    const scene = this.getCurrentScene();
    const target = scene?.onTimeout;
    if (target && this.sceneMap.has(target)) {
      this.currentSceneId = target;
    }
    return this.getCurrentScene();
  }

  reset() {
    this.currentSceneId = this.story.startSceneId;
    return this.getCurrentScene();
  }
}
