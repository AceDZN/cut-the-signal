# Asset provenance — 3D revision, 24 October 2026

## Generated references and textures

All were generated with the built-in imagegen tool using the installed imagegen skill. The full prompt set and file mapping are in `design/PROMPTS.md`.

- `design/references/gameplay-connected.png` and `gameplay-offline.png`: generated gameplay design targets, not running-game evidence.
- `design/references/drone-reference.png`, `relay-reference.png`, `deck-reference.png`: isolated asset references derived from the same art direction and uploaded to Tripo.
- `public/assets/textures/planet-albedo.png`: generated equirectangular ocean/cloud texture, mapped onto a 3D sphere. It is not the gameplay background image.

## Tripo models

Generated with Tripo Studio H3.1 using the above reference images, then exported as textured GLB models.

| Runtime file | Tripo task | Role |
| --- | --- | --- |
| `public/assets/models/salvage-drone.glb` | `c15bb6b8-3e1e-4842-8e0b-2aa52dd95b5c` | Player drone |
| `public/assets/models/relay.glb` | `16fac201-4a2b-4f06-84ef-fbdc7407b9e1` | Salvage/signal tower |
| `public/assets/models/deck.glb` | `9103fedc-13f9-4198-a2ce-424c4c497b5f` | Modular industrial platform |

Runtime versions were processed using glTF Transform 4.5.1: weld, simplify, prune and WebP texture conversion. Drone/relay use 1024px textures; the deck keeps 2048px texture detail. Geometry is uncompressed, avoiding extra runtime decoder downloads. Model provenance and processing values are in `public/assets/models/manifest.json`.

## Code-authored content

Catwalks, direction arrows, dock doorway, signal cables, lamps, atmosphere, stars, debris, cutting particles and fallback geometry are original Three.js geometry/materials. Interface symbols use text and CSS. Sound is local Web Audio synthesis. Fonts are system stacks, with no downloaded font files. No reference game's art, level, narrative or UI assets were imported.

The twenty mission graphs, values, rules and runtime interface are authored for Cut the Signal. No external runtime game services are called.

## Tooling

Pinned npm tooling/dependencies: Three.js 0.186.1 (MIT), @types/three 0.186.0 (MIT), Vite 8.3.5 (MIT), TypeScript 7.0.2 (Apache-2.0), tsx 4.23.15 (MIT), Playwright 1.61.1 (Apache-2.0), Prettier 3.9.10 (MIT), glTF Transform CLI 4.5.1 (MIT). Installed packages include their license files. Chromium and asset optimization tooling are development-only.
