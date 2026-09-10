# Bleum water adaptation

Reference: https://threeui.com/source-code/elemental-water.json
Revision: 7a6871fe99fa5e1551b27b2601f2a22dd23320ea2c90b5432c9c8e071f0b1d1d

All three registered files are preserved in elemental-water.source.json. Their SHA-256 hashes were verified before adapting the source.

This is a vanilla JavaScript adaptation, not the React ElementsCollection component. It retains the authored WebGL2 ping-pong wave simulation, circular pointer ripples, gradient refraction, lighting, and GPU particle system. The OpenAI mark is replaced by the selected bouquet photo, with a circular contour for particle spawning. The other two shader variants are omitted from the runtime.

Water configuration: speed 1, size 1 (zoom 1.56), particle amount 1 (160 particles), hue 0, saturation/brightness/opacity 1. The SDF detail patch uses 768/192; the canonical capped device DPR is retained for mobile performance. The photo receives a subtle cyan tint, preserving the original page palette.

The existing animation toggle pauses the effect. Rendering stops offscreen and in hidden tabs. Reduced motion, unavailable WebGL2/float buffers, and context loss show the HTML photo. Product selection updates the texture. No frameworks, remote runtime requests, or documentation embeds are used.
