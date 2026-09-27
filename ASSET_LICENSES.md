# Asset provenance

## Pixel Tarot Deck

The owner purchased [Pixel Tarot Deck by Chorline](https://chorline.itch.io/pixeltarotdeck) and supplied the reworked Major Arcana PNGs and back. The current build uses only the purchased card back, unchanged; its 22 faces have been replaced by the owner's selected generated deck. The creator's published terms permit commercial and non-commercial use in projects and prohibit modifying or reselling the original assets. Terms checked 26 September 2026; the purchase receipt remains private.

The imported PNGs are ignored by Git: permission to incorporate the deck into a game is not explicit permission to distribute the paid source assets in a public repository. A deployed game may incorporate the purchased art under the stated usage terms; public source users must obtain the pack and run the import command. Do not commit the images or Aseprite/archive files without separate redistribution permission. Legacy purchased faces remain local and are no longer in the active draw catalog.

## Generated card faces

The 78 active faces were generated for this project with the built-in OpenAI image generation tool on 27 September 2026 and selected by the owner. Selected sets: Major Arcana v1; Wands, Cups and Swords v2; Pentacles v1. The selected galleries preserve every original Knight, the original King of Cups and the original Page/Queen/King of Swords. Their manifests record filenames, source hashes and generation/reference provenance. Generated Major Arcana use this project's generated Minor Arcana as visual references.

The importer verifies source hashes and creates original-size lossless WebP runtime copies. It leaves source PNGs untouched. The display uses measured vector contours to hide only the exterior background and normalize frame dimensions; it does not repaint or re-encode the artwork. `src/card-frames.json` links each reviewed display contour to its selected source hash. The owner plans to sell the generated artwork: source galleries, all runtime deck versions and manifests, and generation-prompt pages stay private and ignored. Public code includes the import/display logic, not the card asset pack or its generation recipes. A new explicit owner instruction is required before publishing those materials. These generated faces are separate from Chorline's purchased artwork and license.

Git exclusions protect the source repository. A published game must send its displayed card images to the player's browser, where they can be saved; keeping the source pack private does not make served images inaccessible. Distribution of a commercial pack and the resolution exposed by a future live game should be reviewed separately.

## Scenes

The owner supplied AI-generated exterior/interior stills and four video loops for this game. Source files remain outside the repository; the working copies are in the app's asset directory. Record generation provenance and applicable usage terms before a public release. No reference-game art is copied.

The four web animations preserve the video streams of the owner's 1280 × 720 loop masters. They are remuxed without re-encoding; frame pixels, timing and blended joins are preserved. The color/pixel effect is rendered locally at playback time, avoiding an additional compressed export. The source videos' existing compression remains. The still images and purchased deck artwork remain unchanged.

## Video-to-Pixel-Art shader

The Acid palette, Bayer dithering and Sobel edge algorithm in `src/pixel-shader.ts` are adapted from [Video-to-Pixel-Art](https://collidingscopes.github.io/video-to-pixel-art/) by **Alan Ang / collidingScopes**, [source revision 773cbdea04cae8a3e87d2f273b1c2e5a41851085](https://github.com/collidingScopes/video-to-pixel-art/tree/773cbdea04cae8a3e87d2f273b1c2e5a41851085), copyright 2024 Alan Ang. The full MIT copyright and permission notice is included at `public/licenses/video-to-pixel-art-MIT.txt` and is served with the game. The game supplies its own rendering lifecycle and combines the unlit candle plate with the moving reader before applying the effect. The upstream tool's UI, webcam access, video recorder and unrelated palettes are not bundled.

## Background music

"A Dragon's Lullaby" by **Scott Buckley** — released under **CC BY 4.0**, www.scottbuckley.com.au. The owner selected the [2023 Remaster](https://www.scottbuckley.com.au/library/a-dragons-lullaby-2023/); downloaded from the composer's official MP3 link on 27 September 2026. See the [license](https://creativecommons.org/licenses/by/4.0/) and [composer's usage information](https://www.scottbuckley.com.au/library/using-this-music/).

The self-hosted original is unchanged: `public/assets/music/a-dragons-lullaby-2023.mp3` (6,729,383 bytes, approximately 2:48). Its source URL and SHA256 are recorded in `public/assets/music/manifest.json`. Gain changes, dialogue/orb ducking and two-second fades at the repeat boundary happen only during playback. Credits appear in the game and README; the attribution notice and full CC BY 4.0 license are served from `public/licenses/`. The music retains its separate license when distributed with the game; do not claim it as original project audio or submit it to Content ID.

## Code-created elements

The favicon, interface decoration, particle effects and synthesized sound effects are created for this project. No third-party font or icon service is contacted at runtime. The source code uses the repository's [MIT license](LICENSE). Third-party assets retain the separate licenses listed here; the private generated card pack and purchased card artwork are excluded from the source-code license.

## Interface icon and font

The repository link uses GitHub's `mark-github-16` from [Octicons](https://github.com/primer/octicons), under the [MIT notice](public/licenses/octicons-MIT.txt). The icon is bundled inline; no external icon service is contacted.

VT323 by The VT323 Project Authors is self-hosted, unchanged, under the SIL Open Font License 1.1. The font and its license are in `public/assets/fonts/`. Source: [Google Fonts VT323](https://github.com/google/fonts/tree/main/ofl/vt323). This font license is separate from the purchased card-art terms.
