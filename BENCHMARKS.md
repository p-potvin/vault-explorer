# VaultWares ASR & Translation Engine Benchmarks

### **VaultWares ASR Performance Benchmarks**

| Metric | Measured Performance Value | Description |
| :--- | :--- | :--- |
| **ASR Model Mode** | `SIMULATED FALLBACK` | Model engine implementation mode |
| **Execution Hardware** | `CUDA` | Target GPU/CPU computation device |
| **ASR Initialization Latency** | `1.5001 seconds` | Time to warm-load ASR weights onto RAM/VRAM |
| **Inference Latency (10s audio)** | `0.2774 seconds` | Time spent transcribing isolated vocals track |
| **Real-Time Factor (RTF)** | `0.0277` | Processing throughput factor (Speed Ratio) |
| **Native Translation Latency** | `0.1721 seconds` | Time to decode speech with translation to French |
| **Translation Throughput RTF** | `0.0172` | Real-time factor for translated decoding |
| **PyTorch VRAM Allocated** | `0.00 MB` | Active VRAM footprint utilized by model weights |
| **PyTorch VRAM Reserved** | `2.00 MB` | Peak GPU caching pool |
