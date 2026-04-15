export class MediaEngine {
  constructor(p) {
    this.p = p;
    this.video = null;
    this.narration = null;
    this.ambient = null;
    this.soundtrack = null;
  }

  applyScene(scene, runtimeConfig) {
    this._replaceVideo(scene.backgroundVideo);
    this._replaceAudio('narration', scene.narrationAudio, runtimeConfig.audio.narrationVolume, false);
    this._replaceAudio('ambient', scene.ambientSfx, runtimeConfig.audio.ambientVolume, true);
    this._replaceAudio('soundtrack', scene.soundtrack, runtimeConfig.audio.soundtrackVolume, true);
  }

  drawBackground() {
    if (!this.video) {
      this.p.background(10, 20, 35);
      return;
    }

    this.p.image(this.video, 0, 0, this.p.width, this.p.height);
  }

  _replaceVideo(path) {
    if (!path) {
      return;
    }

    if (this.video) {
      this.video.remove();
      this.video = null;
    }

    this.video = this.p.createVideo([path], () => {
      this.video.loop();
      this.video.volume(0);
    });
    this.video.hide();
  }

  _replaceAudio(channel, path, volume, loop) {
    const current = this[channel];
    if (current) {
      current.stop();
      current.remove();
      this[channel] = null;
    }

    if (!path) {
      return;
    }

    const audio = this.p.createAudio(path, () => {
      audio.volume(volume);
      if (loop) {
        audio.loop();
      } else {
        audio.play();
      }
    });

    this[channel] = audio;
  }
}
