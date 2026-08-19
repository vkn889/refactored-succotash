# Vendored: FBXLoader.js

Copied from `three/examples/jsm/loaders/FBXLoader.js` (three@0.185.1) and
patched in exactly one place: `BinaryParser.parse()`'s main loop now
tolerates a parse failure that happens within the last ~1KB of the file,
instead of throwing and discarding everything already parsed.

**Why:** the "Vanguard" character model (`public/models/vanguard/base.fbx`)
throws `THREE.FBXLoader: Unknown property type` from the *stock* loader —
but only ~150 bytes before EOF, after the entire real scene (skeleton,
mesh, `Objects`, `Connections`, everything) has already parsed
successfully. Verified by instrumenting a standalone copy of the parser
outside the app and confirming the resulting `FBXTree` has all the expected
top-level sections. This is the exporter's footer padding not exactly
matching `endOfContent()`'s 160+16-byte/16-byte-aligned assumption, not a
real data problem — three.js's stock loader has no tolerance for that at
all, so the whole file fails to load over ~150 trailing bytes it doesn't
even need.

Imported by `components/game/MixamoFighter.tsx` instead of
`three/examples/jsm/loaders/FBXLoader.js`. If bumping the `three` version,
re-diff this file against the new stock `FBXLoader.js` and reapply the same
patch (search this file for "PATCHED").
