export class MediaEngine {
  /**
   * @param {import('p5').default} p
   * @param {import('./projectionView.js').ProjectionView} projectionView
   */
  constructor(p, projectionView) {
    this.p = p;
    this.projectionView = projectionView;
    this.narration = null;
    this.ambient = null;
    this.soundtrack = null;
  }

  /**
   * @param {object} hooks
   * @param {function(number): void} [hooks.onClipDurationSeconds]
   * @param {function(): void} [hooks.onVideoEnded]
   */
  applyScene(scene, runtimeConfig, hooks = {}) {
    const videoVol = runtimeConfig.audio?.videoVolume ?? 0;
    const loop = runtimeConfig.playback?.loopBackgroundVideo === true;
    const onClipDurationSeconds = hooks.onClipDurationSeconds;
    const onEnded = hooks.onVideoEnded;

    this.projectionView.setBackgroundVideo(scene.backgroundVideo ?? '', videoVol, {
      loop,
      holdFirstFrame: scene.holdFirstFrame === true,
      onClipDurationSeconds,
      onEnded
    });
    this._replaceAudio('narration', scene.narrationAudio, runtimeConfig.audio.narrationVolume, false);
    this._replaceAudio('ambient', scene.ambientSfx, runtimeConfig.audio.ambientVolume, true);
    this._replaceAudio('soundtrack', scene.soundtrack, runtimeConfig.audio.soundtrackVolume, true);
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

  /** Retry p5 scene clips after autoplay was blocked (call from a user-gesture handler). */
  resumeFromUserGesture() {
    for (const ch of ['narration', 'ambient', 'soundtrack']) {
      const el = this[ch];
      if (el && typeof el.play === 'function') {
        el.play().catch(() => {});
      }
    }
  }
}
