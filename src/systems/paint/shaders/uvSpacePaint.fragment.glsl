precision highp float;
varying vec3 vWorldPosition;

uniform vec3 paintSphereCenter;
uniform float paintSphereRadius;

void main() {
    // Calculate the clean distance from the center of the brush
    float dist = distance(vWorldPosition, paintSphereCenter);

    // Hard circle cutoff with zero noise or randomization
    if (dist <= paintSphereRadius) {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    } else {
        discard;
    }
}