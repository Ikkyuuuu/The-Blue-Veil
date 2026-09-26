# Scene preparation

The owner-provided four full-length loop masters are used for outside, entering, reader idle and the reading orb. Entry plays once; the other clips repeat. `npm run assets:scenes -- "path to Tarot_Game_Loops"` imports them as `*-master.mp4` using stream copy: audio/metadata are stripped without re-encoding video pixels. Ambient sound/chimes are synthesized locally after the player opts in.

The built-in image-generation tool produced the independent-candle base at `public/assets/scenes/interior-unlit.png`. The source original was left intact. A soft central video mask preserves motion in the hooded reader and orb, while candle flames and local glow layers are controlled by game state over the unlit plate. The live shader composites this plate and motion before applying the same palette and dithering, so both layers match. The CSS version of the composition remains as a fallback if WebGL is unavailable.

The pixel effect runs locally using an adapted MIT-licensed shader from [Video-to-Pixel-Art by Alan Ang / collidingScopes](https://collidingscopes.github.io/video-to-pixel-art/). Keep the README/in-game credit and `public/licenses/video-to-pixel-art-MIT.txt`. The screenshot settings are recorded in `src/pixel-shader.ts`, with the owner's subsequent edge-color change to black. Do not bake this effect into another compressed export or use the short shader-tool recordings as replacements for the original loops.

Prompt used:

> Use case: precise-object-edit. Edit target: the supplied pixel-art interior. Create an unlit-candle background plate for a game. Extinguish all three candle flames and remove their warm orange/brown halo glows behind them. Keep the three wax candle bodies and tiny black wicks at exactly the same positions and sizes. Keep everything else unchanged: full wide composition, black faceless hooded figure, purple curtains, gold hanging ornaments, blue crystal orb and blue reflections, tablecloth, perspective and pixel art rendering. Do not add/remove/move any objects except the candle flames and their warm light. No new text, cards or borders. Preserve the original image as closely as possible; this plate must align with the existing composition for separately animated candle sprites.

No generative editing is applied to the purchased tarot artwork. The importer copies its PNGs without changing their bytes. Minor Arcana require new owner-supplied assets and an explicit catalog update.
