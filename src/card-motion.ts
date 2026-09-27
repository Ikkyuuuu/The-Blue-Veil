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
      const lift = slot.offsetWidth * 0.64;
      const card = document.createElement('div');
      card.className = 'deal-card';
      const back = document.createElement('span');
      back.className = 'deal-back';
      back.setAttribute('aria-hidden', 'true');
      const shadow = document.createElement('div');
      shadow.className = 'deal-shadow';
      shadow.setAttribute('aria-hidden', 'true');
      const light = document.createElement('span');
      light.className = 'deal-light';
      light.setAttribute('aria-hidden', 'true');
      slot.classList.add('dealing');
      face.append(light);
      card.append(face, back);
      slot.append(shadow, card);
      const options: KeyframeAnimationOptions = { duration: 1500, fill: 'both' };
      const animations = [
        slot.animate(
          [
            {
              transform: `translate(${x}px, ${y}px) scale(${scale})`,
              offset: 0,
              easing: 'cubic-bezier(0.3, 0.1, 0.3, 1)',
            },
            { transform: 'translate(0, 0) scale(1)', offset: 0.38 },
            { transform: 'translate(0, 0) scale(1)', offset: 1 },
          ],
          options,
        ),
        // One rigid sheet with two faces. Height clears half the card width at
        // the edge-on point, so its lower edge never cuts through the cloth.
        card.animate(
          [
            { transform: 'translateZ(0) rotateY(180deg)', offset: 0 },
            {
              transform: 'translateZ(0) rotateY(180deg)',
              offset: 0.42,
              easing: 'cubic-bezier(0.42, 0, 1, 1)',
            },
            { transform: `translateZ(${lift * 0.65}px) rotateY(145deg)`, offset: 0.54 },
            { transform: `translateZ(${lift}px) rotateY(90deg)`, offset: 0.67 },
            {
              transform: `translateZ(${lift * 0.65}px) rotateY(35deg)`,
              offset: 0.8,
              easing: 'cubic-bezier(0, 0, 0.25, 1)',
            },
            { transform: 'translateZ(3px) rotateY(0deg)', offset: 0.94, easing: 'ease-out' },
            { transform: 'translateZ(0) rotateY(0deg)', offset: 1 },
          ],
          options,
        ),
        shadow.animate(
          [
            { transform: 'translate(3px, 5px) scale(1)', opacity: 0.5, offset: 0 },
            { transform: 'translate(3px, 5px) scale(1)', opacity: 0.5, offset: 0.42 },
            {
              transform: 'translate(8px, 18px) scale(0.28, 0.94)',
              opacity: 0.18,
              offset: 0.67,
            },
            { transform: 'translate(3px, 5px) scale(1)', opacity: 0.5, offset: 1 },
          ],
          options,
        ),
        light.animate(
          [
            { opacity: 0, offset: 0 },
            { opacity: 0.65, offset: 0.67 },
            { opacity: 0.25, offset: 0.8 },
            { opacity: 0, offset: 1 },
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
        light.remove();
        card.replaceWith(face);
        shadow.remove();
        if (active === animations) active = [];
      }
    },
  };
}
