# Asset provenance

## Pixel Tarot Deck

The owner purchased [Pixel Tarot Deck by Chorline](https://chorline.itch.io/pixeltarotdeck) and supplied the reworked Major Arcana PNGs and back. This build uses the 22 current faces and back, unchanged. The creator's published terms permit commercial and non-commercial use in projects and prohibit modifying or reselling the original assets. Terms checked 26 September 2026; the purchase receipt remains private.

The imported PNGs are ignored by Git: permission to incorporate the deck into a game is not explicit permission to distribute the paid source assets in a public repository. A deployed game may incorporate the purchased art under the stated usage terms; public source users must obtain the pack and run the import command. Do not commit the images or Aseprite/archive files without separate redistribution permission. The owner will supply minor arcana later; do not fabricate missing faces or draw unavailable cards.

## Scenes

The owner supplied AI-generated exterior/interior stills and four video loops for this game. Source files remain outside the repository; the working copies are in the app's asset directory. Record generation provenance and applicable usage terms before a public release. No reference-game art is copied.

The four web animations preserve the video streams of the owner's 1280 × 720 loop masters. They are remuxed without re-encoding; frame pixels, timing and blended joins are preserved. The color/pixel effect is rendered locally at playback time, avoiding an additional compressed export. The source videos' existing compression remains. The still images and purchased deck artwork remain unchanged.

## Video-to-Pixel-Art shader

The Acid palette, Bayer dithering and Sobel edge algorithm in `src/pixel-shader.ts` are adapted from [Video-to-Pixel-Art](https://collidingscopes.github.io/video-to-pixel-art/) by **Alan Ang / collidingScopes**, [source revision 773cbdea04cae8a3e87d2f273b1c2e5a41851085](https://github.com/collidingScopes/video-to-pixel-art/tree/773cbdea04cae8a3e87d2f273b1c2e5a41851085), copyright 2024 Alan Ang. The full MIT copyright and permission notice is included at `public/licenses/video-to-pixel-art-MIT.txt` and is served with the game. The game supplies its own rendering lifecycle and combines the unlit candle plate with the moving reader before applying the effect. The upstream tool's UI, webcam access, video recorder and unrelated palettes are not bundled.

## Code-created elements

The favicon, interface decoration, particle effects and synthesized sound effects are created for this project. No third-party font or icon service is contacted at runtime. Selecting a software/asset license for the public repository remains an owner decision.

## Interface font

VT323 by The VT323 Project Authors is self-hosted, unchanged, under the SIL Open Font License 1.1. The font and its license are in `public/assets/fonts/`. Source: [Google Fonts VT323](https://github.com/google/fonts/tree/main/ofl/vt323). This font license is separate from the purchased card-art terms.
