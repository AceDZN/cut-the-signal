# Verification and playtest notes

## Verified on 24 October 2026

- 104 automated unit checks pass: all 20 full-value witnesses and intended failures, independent quota/perfect searches, every legal directed catwalk and receiver handoff, floor/equipment collision, large input steps, angled rail sliding, safe-return search, early-checkpoint guidance and guarded storage.
- The Chromium browser suite passed all 20 perfect extractions and rejected incomplete offline returns in all 20 levels on development and production builds.
- Control regressions cover closed-draft/overview driving, direct dark approaches and immediate reverse, E salvage/return/extract, repeated U recovery during offline movement, next-level progression, saved resume, Step/Pause, hints, help, sound, fullscreen and resize.
- Touch checks cover 390px and 320px viewports, reduced motion, no horizontal scroll, and separation of the footer/control regions. World labels hide behind objective text.
- Real Tripo models are required by the browser checks; fallback meshes cannot satisfy them. No console/page errors or external asset requests occurred in the passing sessions.
- Strict TypeScript/build and Prettier checks pass. Vite reports an advisory for the Three.js code chunk exceeding 500 KB.

## Reproduce

```sh
npm ci
npx playwright install chromium
npm test
npm run format:check
npm run build
npm run dev
# In another terminal:
npm run test:browser
npm run capture:reference
```

To test production, run `npm run preview` after building, then `GAME_URL=http://127.0.0.1:4173 GAME_ARTIFACT_NAME=production npm run test:browser`.

Reports and screenshots are generated under ignored `output/` directories. The README's gameplay image is a real browser capture, not a generated target.

## Human playtest questions

1. Does the next-action guidance make the salvage and return rule understandable without reading the controls?
2. Can you distinguish amber signal cables from walkable catwalks, and predict which receiver survives a cut?
3. Does U make mistakes easy to recover from, and does the later three-slot routing remain an interesting challenge?
4. Does the four-chapter difficulty curve introduce each dependency at a useful pace?

## Limits

The difficulty curve, camera preference and sound still need external human playtesting. Collision is deterministic and planar, rather than a rigid-body vehicle simulation. The models are static meshes: wheel/arm rigs and segmented destruction are not implemented. Lighting and dock architecture remain simpler than the generated visual targets. Safari, Firefox, physical phones and full nonvisual accessibility have not been verified.
