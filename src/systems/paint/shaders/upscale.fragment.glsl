precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler; // Source (512x512)
uniform vec2 texelSize; // 1 / SourceWidth
uniform float sourceSize; // e.g. 512.0

void main(void) {
    // SDF Reconstruction Algorithm
    // Identify "Source Cell" covering this pixel
    vec2 gridUV = vUV * sourceSize;
    vec2 cellOrigin = floor(gridUV);
    
    // Aggressive Dilation Loop: 7x7 block (-3 to +3)
    // This extends the search radius to ~3 source pixels (approx 12 target pixels).
    // This ensures we jump over even large UV island gaps.
    
    float maxInfluence = 0.0;
    
    // Radius configuration (Source Pixels)
    // Solid core radius: 1.5 pixels (6 target pixels) guarantees solid color at seams.
    // Fade softness: 1.5 pixels (6 target pixels) of gradient for anti-aliasing.
    float radius = 1.5;        
    float outerRadius = 3.0; // radius + softness
    
    for(float x = -3.0; x <= 3.0; x++) {
        for(float y = -3.0; y <= 3.0; y++) {
            
            // Optimization: Check if this neighbor is within circular reach
            if (length(vec2(x, y)) > outerRadius + 0.5) continue;

            vec2 neighborOffset = vec2(x, y);
            vec2 neighborCell = cellOrigin + neighborOffset;
            
            // Sample neighbor center
            vec2 neighborUV = (neighborCell + 0.5) * texelSize;
            vec4 sampleVal = texture2D(textureSampler, neighborUV);
            
            // Treat >0.1 as painted (binary threshold on source)
            if (sampleVal.r > 0.1) {
                vec2 neighborCenterInGrid = neighborCell + 0.5;
                float dist = distance(gridUV, neighborCenterInGrid);
                
                // SDF Falloff
                float influence = smoothstep(outerRadius, radius, dist);                            
                // CRITICAL FIX FOR SEAMS:
                // At grazing angles or extreme UV distortions, the soft gradient might drop below 1.0 
                // right at the seam edge, causing a visible dark line.
                // We FORCE any pixel comfortably inside the radius to check-mate as fully solid (1.0).
                if (dist < radius) influence = 1.0;
                maxInfluence = max(maxInfluence, influence);
            }
        }
    }
    
    gl_FragColor = vec4(maxInfluence, 0.0, 0.0, 1.0);
}
