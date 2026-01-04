precision highp float;
varying vec2 vUV;

uniform sampler2D floorSampler;
uniform sampler2D inkSampler;
uniform sampler2D maskSampler;

void main() {
    vec3 floorColor = texture2D(floorSampler, vUV * 10.0).rgb;
    vec3 inkColor = texture2D(inkSampler, vUV * 15.0).rgb;
    float alpha = texture2D(maskSampler, vUV).a;
    
    vec3 finalColor = mix(floorColor, inkColor, alpha);
    
    gl_FragColor = vec4(finalColor, 1.0);
}
