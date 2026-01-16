precision highp float;

// Attributes
attribute vec3 position;
attribute vec2 uv2;

// Uniforms
uniform mat4 world;

// Varyings
varying vec3 vWorldPosition;

void main() {
    // Pass world position to fragment shader for distance calculation
    vWorldPosition = (world * vec4(position, 1.0)).xyz;
    
    // Use UV2 as clip space position (maps mesh into texture space)
    // This is the key: we're rendering in UV space, not screen space
    gl_Position = vec4(uv2 * 2.0 - 1.0, 0.0, 1.0);
}
