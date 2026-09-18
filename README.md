# PaintGame Map Authoring Requirements

## Paintable Object Requirements

Every paintable object must meet all of the following requirements before it is exported from Blender:

1. **Second UV channel:** Every paintable object must have a second UV channel. In Blender, this channel is named **Lightmap**, even though it is used for painting by the game.
2. **One island per face:** The Lightmap UV must contain every face of every object independently. Each face must be a separate UV island, with no overlapping islands.
3. **Preserve face shape:** Each UV island must preserve the exact shape of its source face. Minimize stretching, distortion, and warping to avoid painting artifacts.
4. **Uniform texel density:** Every UV island must use exactly the same pixel/texel density. Do not resize individual islands during packing.
5. **Shared materials:** Two objects may share a material only if they also share the same Lightmap UV layout and their UV islands do not overlap.
6. **Material paint channels:** Each unique material is a separate paint channel, and every object using that material is assigned that material's paint texture. In Blender, objects must therefore be made single-user unless objects sharing a material also share a non-overlapping Lightmap UV layout.

## Blender Workflow

Use this workflow for paintable map geometry:

1. Select all paintable objects and enter **Edit Mode**.
2. Switch to **Edge Select** mode and clear all existing seams.
3. Mark every edge as a seam.
4. Create the Lightmap UV using **UV Unwrap > Conformal**.
5. Use a texel-density checker to set every face to the same density.
6. Use a packing add-on to pack all faces while preserving their existing density and size. The packing step must not resize, stretch, or warp the islands, and islands must not overlap.

## Final Validation Checklist

- [ ] Every paintable object has a second UV channel named **Lightmap**.
- [ ] Every face is its own Lightmap UV island.
- [ ] No Lightmap UV islands overlap, including between objects sharing a material.
- [ ] Island shapes remain faithful to the source faces with minimal warping.
- [ ] All islands have identical texel density.
- [ ] Material sharing is limited to objects with a shared, non-overlapping Lightmap UV layout.
- [ ] Each unique material has the correct separate paint texture/channel.