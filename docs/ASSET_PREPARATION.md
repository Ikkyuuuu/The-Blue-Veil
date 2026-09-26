# Scene preparation

The owner-provided four loops are used for outside, entering, reader idle and the reading orb. Entry plays once; the other clips repeat. Deployment copies strip audio/metadata and compress the videos. Ambient sound/chimes are synthesized locally after the player opts in.

The built-in image-generation tool produced the independent-candle base at `public/assets/scenes/interior-unlit.png`. The source original was left intact. A soft central video mask preserves motion in the hooded reader and orb, while candle flames and local glow layers are controlled by game state over the unlit plate.

Prompt used:

> Use case: precise-object-edit. Edit target: the supplied pixel-art interior. Create an unlit-candle background plate for a game. Extinguish all three candle flames and remove their warm orange/brown halo glows behind them. Keep the three wax candle bodies and tiny black wicks at exactly the same positions and sizes. Keep everything else unchanged: full wide composition, black faceless hooded figure, purple curtains, gold hanging ornaments, blue crystal orb and blue reflections, tablecloth, perspective and pixel art rendering. Do not add/remove/move any objects except the candle flames and their warm light. No new text, cards or borders. Preserve the original image as closely as possible; this plate must align with the existing composition for separately animated candle sprites.

No generative editing is applied to the purchased tarot artwork. The importer copies its PNGs without changing their bytes. Minor Arcana require new owner-supplied assets and an explicit catalog update.
