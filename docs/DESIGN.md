# Visual identity: a held moment

The core metaphor is **an open protective loop holding a seed**—care without surveillance. The two asymmetrical strokes never form a lock or shield, and the middle point is a small person/medication moment rather than a clinical cross. Its single source is `public/icon.svg`; rasterized equivalents are supplied at 96, 180, 192 and 512 pixels for the badge, iOS, PWA home screen and install prompt.

## Typography

- **Fraunces Variable:** display headlines, intimate statements, and the dates in the medication ledger. Curved editorial letterforms give warmth without illustrations.
- **DM Sans:** legible, disciplined controls, navigation, and bodies.
- **IBM Plex Mono:** temporal/context metadata; numbers are never hidden inside ambiguous status dots.
- All fonts are self-hosted packages. No third-party font requests are required at runtime.

## Palette

| Token | Light | Meaning |
|---|---|---|
| Paper | `#F4F1E9` | Warm workspace / understated stationery |
| Ink | `#232522` | Readable primary text |
| Forest | `#354A3D` | Quiet care and grounding |
| Coral | `#D8725D` | The seed; attention without alarm fatigue |
| Citron | `#C8DD7E` | A small moment of warmth / positive action |
| Lilac | `#B9A4D4` | People and contemplative writing |

Dark theme reverses paper and ink thoughtfully rather than simply applying `filter: invert(1)`. Every status also has written text and accessible focus states. The app starts with a system-aware theme and saves explicit override in non-sensitive localStorage.

## Layout principles

Medication records live in a **ruled chronological ledger**, with a time rail, person, dose, explicit outcome, and record action. The UI has one grounded summary strip, not a grid of statistic cards. People live in an index and detail view; prompts appear as large editorial quotes separated by hairline rules. Modals are single-task sheets. Motion is nonessential and disappears under reduced-motion settings. Phone design retains clear access via a bottom index rather than nesting navigation in hamburger drawers.
