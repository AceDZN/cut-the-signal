# 3D art direction — 24 October 2026

The game follows an image-first workflow: generated gameplay targets, matching Tripo models, playable implementation and comparison against actual runtime captures.

## Targets, not evidence

`references/gameplay-connected.png` and `references/gameplay-offline.png` are **AI-generated design targets**. They are not screenshots of the running implementation. All final game evidence belongs in `output/3d-browser/` or `output/3d-production/`, produced from the real WebGL canvas and HTML HUD by browser tests. The target images are not loaded as a fake game background.

## Composition contract

- The playable 3D world fills the window. No persistent dashboard sidebar.
- A high three-quarter camera follows the robot. Overview shows the entire known wreck. Right-drag orbits; the wheel changes distance.
- Rectangular blue-gray industrial deck modules, short grated catwalks, thick undersides, copper/amber cables and low cutaway rails.
- A blue planet and sparse stars establish depth. The planet is a real sphere with a generated albedo texture and separate atmosphere.
- A squat ivory robot with chunky wheels and amber camera eye is the recognizable player silhouette. Tall narrow relay towers contrast with it.
- The live relay glows; a cut loses the glow, physically compresses into scrap, and emits sparks. Motion continues on the uploaded return while manual control is unavailable.
- Top left: compact title and mission. Top right: salvage and explicit signal state. Bottom center: four slots (three in the finale), current command, upload action. Bottom corners: keys and contextual interaction.
- The programming overlay appears only when requested, preserving most of the world view. Controls are real HTML and the world is rendered with Three.js.

## Gameplay contract

Direct WASD driving is continuous and collision-bounded. Receiver changes still follow the authored outgoing-corridor graph. Program editing is relative to its endpoint and obeys the same tested interpreter. Direct entry into an offline room without an uploaded route strands the drone. The player can always restart explicitly.

## Model pipeline

The isolated drone, relay and platform references were used for Tripo image-to-3D generation. Textured GLBs were simplified, pruned and resized with glTF Transform, keeping the runtime asset set around 6 MB. Source model tasks and processing values are in `public/assets/models/manifest.json`. The planet texture maps onto a sphere. No runtime model service is used.

## Review criteria

Compare the actual connected, cutting and offline frames beside the matching target. Assess camera height/framing, drone visibility, relay scale, deck surface detail, cool/warm balance, physical route legibility, HUD placement and action discoverability. A solved route is not visual parity. Do not claim pixel identity or human-tested fun from automated checks.
