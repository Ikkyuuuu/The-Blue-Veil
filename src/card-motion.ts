export function createCardMotion() {
  let active: Animation[] = [],
    paused = false,
    reduced = false;
  const finish = () => active.forEach((animation) => animation.finish());
  // A resized table has new coordinates; settle the card into its current slot.
  window.addEventListener('resize', finish);

  return {
    update(nextPaused: boolean, nextReduced: boolean) {
      paused = nextPaused;
      reduced = nextReduced;
      if (reduced) finish();
      else active.forEach((animation) => (paused ? animation.pause() : animation.play()));
    },
    async deal(deck: HTMLElement, slot: HTMLElement) {
      if (reduced || !slot.animate) return;
      const spread = slot.parentElement!;
      const face = slot.querySelector<HTMLElement>('.tarot-card')!;
      // Work in the unprojected table plane so the existing perspective also
      // projects the moving card, including on portrait/tablet layouts.
      const x = deck.offsetLeft - spread.offsetLeft - slot.offsetLeft;
      const y =
        deck.offsetTop +
        deck.offsetHeight -
        (spread.offsetTop + slot.offsetTop + slot.offsetHeight);
      const scale = deck.offsetWidth / slot.offsetWidth;
      const back = document.createElement('span');
      back.className = 'deal-back';
      back.setAttribute('aria-hidden', 'true');
      slot.classList.add('dealing');
      slot.append(back);
      const options: KeyframeAnimationOptions = { duration: 850, fill: 'both' };
      const animations = [
        slot.animate(
          [
            {
              transform: `translate(${x}px, ${y}px) scale(${scale})`,
              offset: 0,
              easing: 'cubic-bezier(0.3, 0.1, 0.3, 1)',
            },
            { transform: 'translate(0, 0) scale(1)', offset: 0.7 },
            { transform: 'translate(0, 0) scale(1)', offset: 1 },
          ],
          options,
        ),
        back.animate(
          [
            { transform: 'scaleX(1)', opacity: 1, offset: 0 },
            { transform: 'scaleX(1)', opacity: 1, offset: 0.62 },
            { transform: 'scaleX(0)', opacity: 1, offset: 0.8 },
            { transform: 'scaleX(0)', opacity: 0, offset: 1 },
          ],
          options,
        ),
        face.animate(
          [
            { transform: 'scaleX(0)', offset: 0 },
            { transform: 'scaleX(0)', offset: 0.8 },
            { transform: 'scaleX(1)', offset: 1 },
          ],
          options,
        ),
      ];
      active = animations;
      if (paused) animations.forEach((animation) => animation.pause());
      try {
        await Promise.all(animations.map((animation) => animation.finished));
      } catch {
        // A removed scene or interrupted animation still leaves the dealt card.
      } finally {
        animations.forEach((animation) => animation.cancel());
        slot.classList.remove('dealing');
        back.remove();
        if (active === animations) active = [];
      }
    },
  };
}
