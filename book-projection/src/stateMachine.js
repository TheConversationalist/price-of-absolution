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
    const choice = scene?.choices.find((entry) => entry.id === choiceId);
    if (!choice) {
      return null;
    }

    if (this.transitionToScene(choice.targetSceneId)) {
      return this.getCurrentScene();
    }

    return null;
  }

  timeout() {
    const scene = this.getCurrentScene();
    this.transitionToScene(scene.onTimeout);
    return this.getCurrentScene();
  }

  reset() {
    this.currentSceneId = this.story.startSceneId;
    return this.getCurrentScene();
  }
}
