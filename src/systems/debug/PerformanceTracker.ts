import { Engine, Scene, EngineInstrumentation, SceneInstrumentation, Observer } from "@babylonjs/core";

export class PerformanceTracker {
    private engineInstrumentation: EngineInstrumentation;
    private sceneInstrumentation: SceneInstrumentation;
    private uiInterval: number | null = null;
    private scene: Scene;
    private renderObserver: Observer<Scene> | null = null;

    // UI elements
    private uiContainer: HTMLDivElement | null = null;
    private uiText: HTMLPreElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;

    // Graph Data
    private fpsHistory: number[] = [];
    private gpuHistory: number[] = [];
    private cpuHistory: number[] = [];
    private maxHistory = 300; // ~5 seconds at 60fps
    
    constructor(engine: Engine, scene: Scene) {
        this.scene = scene;

        // Track Engine/GPU level metrics
        this.engineInstrumentation = new EngineInstrumentation(engine);
        this.engineInstrumentation.captureGPUFrameTime = true;
        this.engineInstrumentation.captureShaderCompilationTime = true;

        // Track Scene/CPU level metrics
        this.sceneInstrumentation = new SceneInstrumentation(scene);
        this.sceneInstrumentation.captureActiveMeshesEvaluationTime = true;
        this.sceneInstrumentation.captureRenderTargetsRenderTime = true;
        this.sceneInstrumentation.captureFrameTime = true;

        this.setupLiveUI();
    }

    private setupLiveUI() {
        this.uiContainer = document.createElement("div");
        this.uiContainer.id = "perf-tracker-overlay";
        this.uiContainer.style.position = "absolute";
        this.uiContainer.style.top = "10px";
        this.uiContainer.style.right = "10px";
        this.uiContainer.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
        this.uiContainer.style.color = "#00ff00";
        this.uiContainer.style.padding = "10px 15px";
        this.uiContainer.style.borderRadius = "5px";
        this.uiContainer.style.fontFamily = "monospace";
        this.uiContainer.style.fontSize = "14px";
        this.uiContainer.style.lineHeight = "1.5";
        this.uiContainer.style.pointerEvents = "none";
        this.uiContainer.style.zIndex = "9999";
        
        this.uiText = document.createElement("pre");
        this.uiText.style.margin = "0 0 10px 0";
        this.uiContainer.appendChild(this.uiText);

        // Add Graph Canvas
        this.canvas = document.createElement("canvas");
        this.canvas.width = 250;
        this.canvas.height = 80;
        this.canvas.style.display = "block";
        this.canvas.style.borderTop = "1px solid #444";
        this.canvas.style.paddingTop = "5px";
        this.canvas.style.backgroundColor = "transparent";
        this.ctx = this.canvas.getContext("2d");
        this.uiContainer.appendChild(this.canvas);
        
        document.body.appendChild(this.uiContainer);

        this.uiInterval = window.setInterval(() => this.updateLiveUI(), 100);

        // Record high-frequency data for graphs on render
        this.renderObserver = this.scene.onAfterRenderObservable.add(() => {
            this.recordFrameData();
            this.drawGraphs();
        });
    }

    private recordFrameData() {
        const engine = this.engineInstrumentation.engine;
        const gpuTimeRaw = this.engineInstrumentation.gpuFrameTimeCounter.current;
        const gpuTimeMs = gpuTimeRaw * 0.000001;
        const cpuTimeMs = this.sceneInstrumentation.frameTimeCounter.current;
        const fps = engine.getFps();

        this.fpsHistory.push(fps);
        this.gpuHistory.push(gpuTimeMs);
        this.cpuHistory.push(cpuTimeMs);

        if (this.fpsHistory.length > this.maxHistory) this.fpsHistory.shift();
        if (this.gpuHistory.length > this.maxHistory) this.gpuHistory.shift();
        if (this.cpuHistory.length > this.maxHistory) this.cpuHistory.shift();
    }

    private drawGraphs() {
        if (!this.ctx || !this.canvas) return;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.ctx.clearRect(0, 0, width, height);

        // Draw scale lines
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, height / 2);
        this.ctx.lineTo(width, height / 2);
        this.ctx.stroke();

        // 60FPS target max scale vs 16.6ms max scale
        const maxFps = 80; 
        const maxTimeMs = 33; 

        this.drawPath(this.fpsHistory, maxFps, "#00ff00"); // Dynamic green for FPS
        this.drawPath(this.cpuHistory, maxTimeMs, "#00aaff"); // Blue for CPU
        this.drawPath(this.gpuHistory, maxTimeMs, "#ff3333"); // Red for GPU
    }

    private drawPath(data: number[], maxValue: number, color: string) {
        if (!this.ctx || data.length === 0) return;
        
        const width = this.canvas!.width;
        const height = this.canvas!.height;
        const stepX = width / this.maxHistory;

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        
        for (let i = 0; i < data.length; i++) {
            const val = data[i];
            const x = i * stepX;
            // clamp value
            const clampedVal = Math.max(0, Math.min(val, maxValue));
            // invert Y axis (0 at bottom)
            const y = height - ((clampedVal / maxValue) * height);
            
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
    }

    private updateLiveUI() {
        if (!this.uiText) return;

        const engine = this.engineInstrumentation.engine;
        const gpuTimeRaw = this.engineInstrumentation.gpuFrameTimeCounter.current;
        const gpuTimeMs = (gpuTimeRaw * 0.000001).toFixed(2);
        const cpuTimeMs = this.sceneInstrumentation.frameTimeCounter.current.toFixed(2);
        const activeMeshesTime = this.sceneInstrumentation.activeMeshesEvaluationTimeCounter.current.toFixed(2);
        const fps = Math.round(engine.getFps());
        const memory = this.getMemoryUsage();

        let text = `📊 LIVE PERFORMANCE\n`;
        text += `-----------------------\n`;
        text += `<span style="color:#00ff00">█</span> FPS:       ${fps}\n`;
        text += `<span style="color:#ff3333">█</span> GPU Time:  ${gpuTimeMs} ms\n`;
        text += `<span style="color:#00aaff">█</span> CPU Time:  ${cpuTimeMs} ms\n`;
        text += `  Eval Time: ${activeMeshesTime} ms\n`;
        text += `  Memory:    ${memory} MB`;

        this.uiText.innerHTML = text;
    }

    private getMemoryUsage(): string | number {
        const perf = window.performance as any;
        if (perf && perf.memory) {
            return (perf.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2);
        }
        return "Not Supported";
    }

    public dispose() {
        if (this.uiInterval !== null) {
            clearInterval(this.uiInterval);
        }
        if (this.renderObserver) {
            this.scene.onAfterRenderObservable.remove(this.renderObserver);
        }
        if (this.uiContainer && this.uiContainer.parentNode) {
            this.uiContainer.parentNode.removeChild(this.uiContainer);
        }
        this.engineInstrumentation.dispose();
        this.sceneInstrumentation.dispose();
    }
}
