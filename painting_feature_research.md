# Technical Implementation of High-Performance Volumetric Surface Painting in Real-Time Rendering Engines

---

## 1. Executive Summary and Architectural Thesis

The implementation of a high-performance, aesthetically cohesive paint mechanic akin to that found in Nintendo’s *Splatoon* series represents one of the most distinct and challenging intersections of texture mapping, shader logic, and memory management in modern real-time graphics.

The user’s specific query—requesting a method to utilize a **sphere** to paint **multiple objects** in the **cleanest way possible** while leveraging a pre-existing **second UV channel**—points definitively toward a technique known as **UV-Space Projection Painting**.

While simpler methods such as deferred decals or vertex color painting exist, they fail to meet the performance and fidelity requirements of a mechanic where the paint is not merely cosmetic but central to gameplay physics and navigation:

- **Deferred decals** incur prohibitive overdraw costs when layered heavily.
- **Vertex painting** lacks sufficient spatial resolution unless mesh density is absurdly high.

Therefore, the optimal architecture is a **Texture-Array-Based Deferred Projection Pipeline**.

This report details the construction of such a pipeline. To achieve the *cleanest* results—specifically minimizing texture bleeding and seam artifacts—the system must integrate:

- **Real-Time UV Dilation**
- **Conservative Rasterization**

To handle **multiple objects** efficiently, the system must avoid traditional texture atlases and instead use **Texture2DArrays**, managed via **GPU Command Buffers** to decouple simulation logic from rendering overhead.

The following analysis provides an exhaustive breakdown of the mathematical, graphical, and architectural steps required to realize this system at a professional production standard.

---

## 2. Theoretical Framework: The UV-Space Projection Model

To implement a paint mechanic that feels volumetric—where a spherical projectile impacts a complex environment and coats it naturally—developers must fundamentally invert the standard rendering pipeline.

- **Traditional rendering:** Projects 3D geometry onto a 2D screen.
- **UV-Space Projection Painting:** Projects a 3D volume of influence (the paint sphere) onto the 2D surface of an object’s texture map.

---

### 2.1 The Strategic Necessity of the Second UV Channel

The user’s existing use of a second UV channel (UV1 or UV2) is not a convenience—it is a **structural prerequisite**.

Standard UVs (UV0) are optimized for visual fidelity and often include:

- Overlapping UV islands
- Mirrored geometry
- Shared texture space

A dynamic paint system, however, requires a **strictly bijective (one-to-one) mapping** between 3D surface and 2D texture space.

#### Required properties of the second UV channel:

- **Zero overlaps**  
  Every face maps to a unique region of the texture.
- **Uniform texel density**  
  Paint splats appear consistent across differently sized objects.

This second UV channel allows the engine to *unwrap* the 3D mesh into 2D space during the paint pass. By rendering the mesh using UV coordinates as clip-space positions, the GPU effectively draws directly into the texture map, enabling precise identification of affected pixels.

---

### 2.2 The Geometric Projection Concept

The “sphere that paints” is implemented as a **boolean intersection test in the fragment shader**, not as a rendered sphere mesh.

#### Workflow:

1. The target mesh is rendered into an off-screen render texture.
2. The **Vertex Shader**:
   - Transforms vertices into texture-space (UVs → clip space).
   - Passes **World Space Position** to the fragment shader.
3. The **Fragment Shader**:
   - Computes the distance between each surface point and the paint sphere center.
   - Paints pixels whose distance is less than the sphere radius.

This volumetric test automatically handles:

- Corners
- Crevices
- Complex geometry

A sphere impacting a 90° corner will correctly paint both surfaces without special-case logic.

---

## 3. Memory Architecture: The Texture Array Advantage

Painting **multiple objects** introduces significant memory and performance challenges. Assigning a unique render texture per object is computationally infeasible.

---

### 3.1 The Failure of Texture Atlases

Texture atlases combine multiple textures into one large texture. While effective for static assets, they are disastrous for dynamic painting due to **mipmapping bleed**.

At lower mip levels, adjacent sub-textures bleed into one another, causing ink painted on one object to appear on others.

Mitigations such as padding and manual UV clamping:

- Increase shader complexity
- Decrease performance
- Are error-prone

---

### 3.2 The Superiority of Texture2DArrays

A **Texture2DArray** treats a stack of textures as a single GPU resource. Each slice is independent but shares resolution and format.

| Feature | Texture Atlas | Texture2DArray |
|------|---------------|----------------|
| Mipmapping | High bleed risk | No bleed (per-slice) |
| Addressing | Difficult clamping | Native wrap/clamp |
| Draw Calls | Good batching | Excellent batching |
| Shader Complexity | High | Low |
| Memory Overhead | Low | Medium |

Each paintable object (or world chunk) is assigned a **slice index**, enabling a single shader to paint across the entire scene efficiently.

---

### 3.3 VRAM and Bandwidth Implications

Using texture arrays requires careful memory planning.

- **Format selection**
  - Avoid RGBA32.
  - Prefer **R8** or **R8G8**.
    - R: Ink density
    - G: Team ID
- **Compression**
  - Render textures cannot be GPU-compressed.
  - A 1024×1024 R8G8 slice ≈ 2 MB.
  - 100 slices ≈ 200 MB VRAM.

This is acceptable for modern PC and consoles, but must be reconsidered for mobile platforms.

---

## 4. The “Cleanest Way”: Solving the Seam Problem

UV seams are the most persistent artifact in UV-based painting. Without mitigation, bilinear filtering pulls in background color, creating dark lines along UV borders.

To eliminate seams, the pipeline must implement:

- **Conservative Rasterization**
- **Real-Time UV Dilation**

---

### 4.1 Conservative Rasterization

Standard rasterization only processes pixels whose centers lie inside a triangle, leaving gaps at UV edges.

**Conservative rasterization** processes any pixel that overlaps the triangle at all, ensuring UV island boundaries are fully painted.

- Supported on DX11.3+, DX12, Vulkan
- Often enabled via a shader pass flag
- Most robust seam-prevention method

---

### 4.2 Real-Time UV Dilation (The “Ryan Brucks” Method)

Even with conservative rasterization, mipmapping can still introduce seams. UV dilation solves this by expanding painted pixels outward.

#### Algorithm:

1. Sample the current pixel.
2. If already painted, return it.
3. If empty:
   - Sample neighboring pixels.
   - If a neighbor contains ink, copy it.
4. Repeat with a small kernel (3×3 or 5×5).

This creates a safety border around UV islands, preventing background sampling.

---

## 5. The Rendering Pipeline Implementation

To avoid CPU stalls, painting must be driven via **GPU Command Buffers**.

---

### 5.1 Command Buffer Workflow

1. **Physics Query**  
   Determine impact position `P` and radius `R`.
2. **Target Identification**  
   `Physics.OverlapSphere` to find affected colliders.
3. **Batch Construction**  
   For each object:
   - Mesh reference
   - Texture array slice index
4. **Command Generation**
   - Populate `CommandBuffer` with `DrawMesh` calls.
5. **Execution**
   - Execute buffer asynchronously.

If all objects share the same material, batching is extremely efficient.

---

### 5.2 Handling `SV_RenderTargetArrayIndex`

To write into different slices of a texture array:

- **Modern GPUs**
  - Vertex shader outputs `SV_RenderTargetArrayIndex`.
  - No geometry shader required.
- **Fallback**
  - Geometry shader (slower).
  - Or CPU-side slice looping (very slow).

This capability enables dozens of objects to be painted in a single pass.

---

## 6. Visual Material Integration (The “Read” Pass)

The final mesh shader combines the base surface with dynamic ink.

---

### 6.1 The Triplanar Bridge

To avoid UV distortion:

- **Mask sampling**
  - Sample paint mask using UV1 + slice index.
- **Ink detail**
  - Sample ink textures using **triplanar world-space mapping**.
- **Blend**
  - Lerp base material with ink material using density.
- **Edge Highlight**
  - Use density gradients (`ddx/ddy`) to fake paint thickness.

This creates the viscous, volumetric feel characteristic of *Splatoon*.

---

### 6.2 Team Colorization

Since the G channel stores team ID:

- Ink color is derived by interpolating between team colors.
- Enables instant recoloring without repainting textures.

---

## 7. Optimization and Scalability

---

### 7.1 Dirty Rectangles and Scissor Testing

Painting an entire texture for a small splat is wasteful.

- **Chunking**
  - Divide the world into chunks (e.g., 5×5 m).
  - Each chunk maps to one texture slice.
- **Scissor Rects**
  - Restrict rasterization to affected UV regions when possible.

---

### 7.2 Instanced Drawing for Spray Weapons

Rapid-fire weapons generate too many draw calls.

- Accumulate hits into a buffer.
- Use instanced procedural drawing.
- Vertex shader iterates over instance data.

This drastically reduces CPU overhead.

---

### 7.3 Bit-Packing for Bandwidth

If paint has binary state (on/off):

- Use **R8_UINT**
- Store multiple states via bitmasking
- Reduces bandwidth significantly

Critical for mobile GPUs and Switch-class hardware.

---

## 8. Case Study Comparison: Splatoon Tech Analysis

- **Splatoon 1/2**
  - Used modified texture atlases.
  - Relied on careful UV layouts and level design.
- **Proposed System**
  - Uses texture arrays (modern hardware).
  - Cleaner seams via UV dilation.
  - Greater flexibility and scalability.

The emphasis on ink-generated normal maps aligns closely with Nintendo’s own focus on lighting and “sliminess.”

---

## 9. Conclusion

The request for a **clean**, **performant**, multi-object paint mechanic using a **sphere projection** is best satisfied by a **Texture-Array-Based Deferred Projection Pipeline**.

- **Cleanliness**
  - Conservative rasterization
  - Shader-based UV dilation
- **Performance**
  - Texture2DArrays
  - GPU command buffers
- **Functionality**
  - Volumetric distance-field projection
  - Seamless multi-object support

This architecture represents the state of the art in dynamic surface painting, suitable for a shipping title and flexible enough to support the complex mechanics of a *Splatoon*-like experience.

