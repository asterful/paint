precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 texelSize; // 1/textureSize

void main(void) {
    vec4 currentPixel = texture2D(textureSampler, vUV);
    
    // If we already have good data, keep it!
    if (currentPixel.r > 0.0) {
        gl_FragColor = currentPixel;
        return;
    }
    
    // Otherwise: We are in a black void.
    // Moderate Seam Fix:
    // We search a 3x3 grid with stride 2.
    // This reaches 2 pixels out. Enough to bridge anti-aliasing gaps,
    // but small enough to avoid jumping meaningful UV gutters.
    
    float maxVal = 0.0;
    float stride = 2.0; 
    
    for(float x = -1.0; x <= 1.0; x++) {
        for(float y = -1.0; y <= 1.0; y++) {
             vec2 offset = vec2(x, y) * stride;
             vec4 n = texture2D(textureSampler, vUV + offset * texelSize);
             maxVal = max(maxVal, n.r);
        }
    }
    
    gl_FragColor = vec4(maxVal, 0.0, 0.0, 1.0);
}
