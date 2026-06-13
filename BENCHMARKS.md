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

| 2026-05-24T05:05:58.213Z | Akane Sas Live College Girls Big Boobs Giant Dildo Chat Room (2).mp4 | 1.56 MB | 8.0s | 327ms | 1179ms | SUCCESS |
| 2026-05-24T05:07:34.558Z | laureljeune strip tease.mp4 | 42.39 MB | 57.1s | 111ms | 5050ms | SUCCESS |
| 2026-05-24T05:12:56.176Z | Watch Alex_saeli live on Chaturbate(2).mp4 | 4.15 MB | 51.0s | 101ms | 2780ms | SUCCESS |
| 2026-05-24T05:35:16.122Z | Watch Helloiamastrid live on Chaturbate(7).mp4 | 4.16 MB | 368.0s | N/A | N/A | FAILED |

---

### **Benchmark Run: 2026-05-24 04:03:33**

### **VaultWares ASR Performance Benchmarks**

| Metric | Measured Performance Value | Description |
| :--- | :--- | :--- |
| **ASR Model Mode** | `SIMULATED FALLBACK` | Model engine implementation mode |
| **Execution Hardware** | `CPU` | Target GPU/CPU computation device |
| **ASR Initialization Latency** | `1.5002 seconds` | Time to warm-load ASR weights onto RAM/VRAM |
| **Inference Latency (10s audio)** | `0.2472 seconds` | Time spent transcribing isolated vocals track |
| **Real-Time Factor (RTF)** | `0.0247` | Processing throughput factor (Speed Ratio) |
| **Native Translation Latency** | `0.1717 seconds` | Time to decode speech with translation to French |
| **Translation Throughput RTF** | `0.0172` | Real-time factor for translated decoding |
| **PyTorch VRAM Allocated** | `0.00 MB` | Active VRAM footprint utilized by model weights |
| **PyTorch VRAM Reserved** | `0.00 MB` | Peak GPU caching pool |


---

### **Benchmark Run: 2026-05-24 04:04:35**

### **VaultWares ASR Performance Benchmarks**

| Metric | Measured Performance Value | Description |
| :--- | :--- | :--- |
| **ASR Model Mode** | `SIMULATED FALLBACK` | Model engine implementation mode |
| **Execution Hardware** | `CPU` | Target GPU/CPU computation device |
| **ASR Initialization Latency** | `1.5001 seconds` | Time to warm-load ASR weights onto RAM/VRAM |
| **Inference Latency (10s audio)** | `0.1765 seconds` | Time spent transcribing isolated vocals track |
| **Real-Time Factor (RTF)** | `0.0177` | Processing throughput factor (Speed Ratio) |
| **Native Translation Latency** | `0.1720 seconds` | Time to decode speech with translation to French |
| **Translation Throughput RTF** | `0.0172` | Real-time factor for translated decoding |
| **PyTorch VRAM Allocated** | `0.00 MB` | Active VRAM footprint utilized by model weights |
| **PyTorch VRAM Reserved** | `0.00 MB` | Peak GPU caching pool |



# Vault Explorer Hardware Enhancement Benchmark Report

Executed on local hardware via Playwright automated pipeline validation.

## Performance Metrics

| Pipeline Phase | Operation Details | Processing Duration | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1: Audio** | Demucs Vocal Isolation + Normalization + AI ASR Transcribe + QC Translation Synthesis | `54.34 s` | `FAILED` |
| **Phase 2: Video** | AI Super-Resolution (RealESRGAN-NCNN-Vulkan x2 upscaling) | `2.84 s` | `FAILED` |
| **Total Pipeline** | Fully Chained End-to-End Non-Destructive Enhancements | `57.18 s` | **COMPLETE** |

## File Metadata

- **Original Video File**: [NVIDIA_USD_Cosmos_Pipeline.mp4](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.mp4) (`6.17 MB`)
- **Enhanced Video File**: [NVIDIA_USD_Cosmos_Pipeline.mp4 (Enhanced)](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/.enhanced/NVIDIA_USD_Cosmos_Pipeline.mp4) (`2.12 MB`)
- **Generated Subtitles**: [NVIDIA_USD_Cosmos_Pipeline.mp4.srt](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/.enhanced/NVIDIA_USD_Cosmos_Pipeline.mp4.srt)
- **Enhancement Sidecar**: [NVIDIA_USD_Cosmos_Pipeline.mp4.meta.json](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.mp4.meta.json)




# Vault Explorer Hardware Enhancement Benchmark Report

Executed on local hardware via Playwright automated pipeline validation.

## Performance Metrics

| Pipeline Phase | Operation Details | Processing Duration | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1: Audio** | Demucs Vocal Isolation + Normalization + AI ASR Transcribe + QC Translation Synthesis | `29.02 s` | `FAILED` |
| **Phase 2: Video** | AI Super-Resolution (RealESRGAN-NCNN-Vulkan x2 upscaling on GPU) | `2.22 s` | `SUCCESS` |
| **Total Pipeline** | Fully Chained End-to-End Non-Destructive Enhancements | `31.24 s` | **COMPLETE** |

## File Metadata

- **Original Video File**: [NVIDIA_USD_Cosmos_Pipeline.mp4](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.mp4) (`6.17 MB`)
- **Enhanced Video File**: [NVIDIA_USD_Cosmos_Pipeline.mp4 (Enhanced)](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/.enhanced/NVIDIA_USD_Cosmos_Pipeline.mp4) (`2.04 MB`)
- **Original Image File**: [Gemini.jpg](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/Gemini.jpg) (`79.80 KB`)
- **Enhanced Image File**: [Gemini.jpg (Upscaled)](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/.enhanced/Gemini.jpg) (`2480.34 KB`)
- **Generated Subtitles**: [NVIDIA_USD_Cosmos_Pipeline.srt](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.srt)
- **Enhancement Sidecar**: [NVIDIA_USD_Cosmos_Pipeline.mp4.meta.json](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.mp4.meta.json)




# Vault Explorer Hardware Enhancement Benchmark Report

Executed on local hardware via Playwright automated pipeline validation.

## Performance Metrics

| Pipeline Phase | Operation Details | Processing Duration | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1: Audio** | Demucs Vocal Isolation + Normalization + AI ASR Transcribe + QC Translation Synthesis | `26.22 s` | `FAILED` |
| **Phase 2: Video** | AI Super-Resolution (RealESRGAN-NCNN-Vulkan x2 upscaling on GPU) | `4.50 s` | `SUCCESS` |
| **Total Pipeline** | Fully Chained End-to-End Non-Destructive Enhancements | `30.72 s` | **COMPLETE** |

## File Metadata

- **Original Video File**: [NVIDIA_USD_Cosmos_Pipeline.mp4](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.mp4) (`6.17 MB`)
- **Enhanced Video File**: [NVIDIA_USD_Cosmos_Pipeline.mp4 (Enhanced)](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/.enhanced/NVIDIA_USD_Cosmos_Pipeline.mp4) (`2.04 MB`)
- **Original Image File**: [Gemini.jpg](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/Gemini.jpg) (`79.80 KB`)
- **Enhanced Image File**: [Gemini.jpg (Upscaled)](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/.enhanced/Gemini.jpg) (`893.54 KB`)
- **Generated Subtitles**: [NVIDIA_USD_Cosmos_Pipeline.srt](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.srt)
- **Enhancement Sidecar**: [NVIDIA_USD_Cosmos_Pipeline.mp4.meta.json](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.mp4.meta.json)




# Vault Explorer Hardware Enhancement Benchmark Report

Executed on local hardware via Playwright automated pipeline validation.

## Performance Metrics

| Pipeline Phase | Operation Details | Processing Duration | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1: Audio** | Demucs Vocal Isolation + Normalization + AI ASR Transcribe + QC Translation Synthesis | `38.30 s` | `FAILED` |
| **Phase 2: Video** | AI Super-Resolution (RealESRGAN-NCNN-Vulkan x2 upscaling on GPU) | `8.87 s` | `FAILED` |
| **Total Pipeline** | Fully Chained End-to-End Non-Destructive Enhancements | `47.17 s` | **COMPLETE** |

## File Metadata

- **Original Video File**: [NVIDIA_USD_Cosmos_Pipeline.mp4](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.mp4) (`6.17 MB`)
- **Enhanced Video File**: [NVIDIA_USD_Cosmos_Pipeline.mp4 (Enhanced)](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/.enhanced/NVIDIA_USD_Cosmos_Pipeline.mp4) (`2.04 MB`)
- **Original Image File**: [Gemini.jpg](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/Gemini.jpg) (`79.80 KB`)
- **Enhanced Image File**: [Gemini.jpg (Upscaled)](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/.enhanced/Gemini.jpg) (`893.54 KB`)
- **Generated Subtitles**: [NVIDIA_USD_Cosmos_Pipeline.srt](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.srt)
- **Enhancement Sidecar**: [NVIDIA_USD_Cosmos_Pipeline.mp4.meta.json](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.mp4.meta.json)




# Vault Explorer Hardware Enhancement Benchmark Report

Executed on local hardware via Playwright automated pipeline validation.

## Performance Metrics

| Pipeline Phase | Operation Details | Processing Duration | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1: Audio** | Demucs Vocal Isolation + Normalization + AI ASR Transcribe + QC Translation Synthesis | `19.36 s` | `SUCCESS` |
| **Phase 2: Video** | AI Super-Resolution (RealESRGAN-NCNN-Vulkan x2 upscaling on GPU) | `8.88 s` | `FAILED` |
| **Total Pipeline** | Fully Chained End-to-End Non-Destructive Enhancements | `28.24 s` | **COMPLETE** |

## File Metadata

- **Original Video File**: [NVIDIA_USD_Cosmos_Pipeline.mp4](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.mp4) (`6.17 MB`)
- **Enhanced Video File**: [NVIDIA_USD_Cosmos_Pipeline.mp4 (Enhanced)](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/.enhanced/NVIDIA_USD_Cosmos_Pipeline.mp4) (`1.97 MB`)
- **Original Image File**: [Gemini.jpg](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/Gemini.jpg) (`79.80 KB`)
- **Enhanced Image File**: [Gemini.jpg (Upscaled)](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/.enhanced/Gemini.jpg) (`893.54 KB`)
- **Generated Subtitles**: [NVIDIA_USD_Cosmos_Pipeline.srt](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.srt)
- **Enhancement Sidecar**: [NVIDIA_USD_Cosmos_Pipeline.mp4.meta.json](file:///C:/Users/Administrator/Desktop/Agent%20Vaultwares%20files/NVIDIA_USD_Cosmos_Pipeline.mp4.meta.json)


| 2026-05-24T11:02:44.502Z | 12min count Watch Emmiep live on Chaturbate.mp4 | 379.31 MB | 963.2s | 202ms | 3587ms | SUCCESS |
| 2026-05-24T11:03:12.437Z | 1 Alejandra Millan Alejamillan11 X.mp4 | 2.64 MB | 13.4s | 95ms | 2154ms | SUCCESS |
| 2026-05-24T13:58:45.137Z | Flirt4Free cam clips of Girls Next Door with Talhia.mp4 | 2.34 GB | 9723.3s | 233ms | 3076ms | SUCCESS |
| 2026-05-24T13:59:56.946Z | foxyy_sophi (@foxyy_sophi) TikTok Watch foxyy_sophi's Newest(7).mp4 | 616.28 KB | 6.8s | 193ms | 710ms | SUCCESS |
| 2026-05-25T21:37:18.116Z | taylorstiles payluciarae pov bj.mp4 | 1.74 GB | 2423.1s | 291ms | 5452ms | SUCCESS |
| 2026-05-25T21:54:23.848Z | Gertrude Losheks Live Asian College Girls Bisexual Chat Room.mp4 | 12.4 MB | 78.0s | 198ms | 6654ms | SUCCESS |
| 2026-05-25T21:54:42.104Z | Watch Artemis_020 live on Chaturbate.mp4 | 366.24 MB | 1460.8s | 71ms | 1912ms | SUCCESS |

---

### **Benchmark Run: 2026-05-25 20:29:18**

### **VaultWares ASR Performance Benchmarks**

| Metric | Measured Performance Value | Description |
| :--- | :--- | :--- |
| **ASR Model Mode** | `SIMULATED FALLBACK` | Model engine implementation mode |
| **Execution Hardware** | `CUDA` | Target GPU/CPU computation device |
| **ASR Initialization Latency** | `1.5003 seconds` | Time to warm-load ASR weights onto RAM/VRAM |
| **Inference Latency (10s audio)** | `0.3072 seconds` | Time spent transcribing isolated vocals track |
| **Real-Time Factor (RTF)** | `0.0307` | Processing throughput factor (Speed Ratio) |
| **Native Translation Latency** | `0.1721 seconds` | Time to decode speech with translation to French |
| **Translation Throughput RTF** | `0.0172` | Real-time factor for translated decoding |
| **PyTorch VRAM Allocated** | `0.00 MB` | Active VRAM footprint utilized by model weights |
| **PyTorch VRAM Reserved** | `2.00 MB` | Peak GPU caching pool |

| 2026-05-26T01:10:24.367Z | Watch Artemis_020 live on Chaturbate.mp4 | 366.24 MB | 1460.8s | 188ms | 19142ms | SUCCESS |
| 2026-05-26T01:25:00.676Z | Watch Artemis_020 live on Chaturbate.mp4 | 366.24 MB | 1460.8s | 172ms | 2347ms | SUCCESS |
| 2026-05-26T01:25:35.015Z | 12min count Watch Emmiep live on Chaturbate.mp4 | 379.31 MB | 963.2s | 82ms | 3343ms | SUCCESS |
| 2026-05-26T01:26:11.828Z | 12min count Watch Emmiep live on Chaturbate.mp4 | 379.31 MB | 963.2s | 77ms | 3270ms | SUCCESS |

---

### **Benchmark Run: 2026-05-25 23:24:13**

### **VaultWares ASR Performance Benchmarks**

| Metric | Measured Performance Value | Description |
| :--- | :--- | :--- |
| **ASR Model Mode** | `SIMULATED FALLBACK` | Model engine implementation mode |
| **Execution Hardware** | `CUDA` | Target GPU/CPU computation device |
| **ASR Initialization Latency** | `1.5004 seconds` | Time to warm-load ASR weights onto RAM/VRAM |
| **Inference Latency (10s audio)** | `0.2684 seconds` | Time spent transcribing isolated vocals track |
| **Real-Time Factor (RTF)** | `0.0268` | Processing throughput factor (Speed Ratio) |
| **Native Translation Latency** | `0.1720 seconds` | Time to decode speech with translation to French |
| **Translation Throughput RTF** | `0.0172` | Real-time factor for translated decoding |
| **PyTorch VRAM Allocated** | `0.00 MB` | Active VRAM footprint utilized by model weights |
| **PyTorch VRAM Reserved** | `2.00 MB` | Peak GPU caching pool |


---

### **Benchmark Run: 2026-05-25 23:24:55**

### **VaultWares ASR Performance Benchmarks**

| Metric | Measured Performance Value | Description |
| :--- | :--- | :--- |
| **ASR Model Mode** | `SIMULATED FALLBACK` | Model engine implementation mode |
| **Execution Hardware** | `CPU` | Target GPU/CPU computation device |
| **ASR Initialization Latency** | `1.5005 seconds` | Time to warm-load ASR weights onto RAM/VRAM |
| **Inference Latency (10s audio)** | `0.1706 seconds` | Time spent transcribing isolated vocals track |
| **Real-Time Factor (RTF)** | `0.0171` | Processing throughput factor (Speed Ratio) |
| **Native Translation Latency** | `0.1709 seconds` | Time to decode speech with translation to French |
| **Translation Throughput RTF** | `0.0171` | Real-time factor for translated decoding |
| **PyTorch VRAM Allocated** | `0.00 MB` | Active VRAM footprint utilized by model weights |
| **PyTorch VRAM Reserved** | `0.00 MB` | Peak GPU caching pool |

| 2026-05-26T06:13:03.717Z | Watch Martina17x live on Chaturbate.mp4 | 43.76 MB | 220.8s | 180ms | 3181ms | SUCCESS |
| 2026-05-26T06:13:15.483Z | Anto Pierces Live Anal Girls Next Door Foot Fetish Chat Room (2).mp4 | 10.35 MB | 42.2s | 91ms | 4562ms | SUCCESS |
| 2026-05-26T06:15:32.338Z | test Watch B3cky_ live on Chaturbate.mp4 | 132.62 MB | 542.4s | 64ms | 18089ms | SUCCESS |
| 2026-05-26T06:17:05.525Z | maysweetshot dickrating 1min.mp4 | 44.47 MB | 60.0s | 97ms | 5686ms | SUCCESS |
| 2026-05-26T06:19:00.259Z | maysweetshot bundle 1.mp4 | 103.11 MB | 139.6s | 90ms | 2192ms | SUCCESS |
| 2026-05-26T06:19:11.268Z | maysweetshot bundle 2.mp4 | 62.61 MB | 84.4s | 90ms | 9395ms | SUCCESS |
| 2026-05-26T06:19:16.429Z | maysweetshot bundle bj.mp4 | 44.47 MB | 60.0s | 163ms | 9267ms | SUCCESS |
| 2026-05-26T06:19:17.016Z | maysweetshot bundle 4.mp4 | 67.88 MB | 91.6s | 107ms | 12794ms | SUCCESS |
| 2026-05-26T06:19:31.806Z | maysweetshot custom 1min.mp4 | 64.08 MB | 86.2s | 339ms | 21464ms | SUCCESS |
| 2026-05-26T06:20:25.427Z | laureljeunegif.mp4 | 6.62 MB | 8.3s | 200ms | 990ms | SUCCESS |
| 2026-05-26T06:20:25.550Z | laureljeune custom vid 4min dildo.mp4 | 178.22 MB | 241.8s | 156ms | 3583ms | SUCCESS |
| 2026-05-26T06:20:26.299Z | laureljeune dickrating.mp4 | 42.39 MB | 57.1s | 92ms | 6659ms | SUCCESS |
| 2026-05-26T06:20:29.856Z | 0h0niwvkznck1daw79jcy_720p.mp4 | 21.83 MB | 29.2s | 99ms | 3605ms | SUCCESS |
| 2026-05-26T06:20:38.275Z | amymarieukof.mp4 | 41.59 MB | 56.0s | 107ms | 9609ms | SUCCESS |
| 2026-05-26T06:20:42.632Z | amyamryukof.mp4 | 44.52 MB | 60.1s | 367ms | 12223ms | SUCCESS |
| 2026-05-26T06:20:44.615Z | indiscreethotandfit party tease 2.mp4 | 21.83 MB | 29.2s | 738ms | 6351ms | SUCCESS |
| 2026-05-26T06:20:48.227Z | indicreethotandfit party tease.mp4 | 50.64 MB | 68.3s | 286ms | 13452ms | SUCCESS |
| 2026-05-26T06:20:50.536Z | indiscreethotandfit masturbating in secret.mp4 | 69.76 MB | 94.4s | 164ms | 17353ms | SUCCESS |
| 2026-05-26T06:21:04.818Z | Watch Ingridblondy94 live on Chaturbate (3).mp4 | 94.9 MB | 400.0s | 71ms | 2176ms | SUCCESS |
| 2026-05-26T06:21:23.632Z | Watch Alexa_thaylor_ live on Chaturbate.mp4 | 31.43 MB | 328.0s | 66ms | 1233ms | SUCCESS |
| 2026-05-26T06:21:32.676Z | Watch Yourwishisme_val live on Chaturbate (2).mp4 | 73.01 MB | 291.2s | 70ms | 2793ms | SUCCESS |
| 2026-05-26T06:21:49.853Z | Watch Wekeepyoursecret live on Chaturbate.mp4 | 48.83 MB | 422.4s | 142ms | 2599ms | SUCCESS |
| 2026-05-26T06:22:22.244Z | 1 good-girl (1good-girl) Nude on Cam. Free Live Sex Chat Roo.mp4 | 31.78 MB | 450.0s | 78ms | 2969ms | SUCCESS |
| 2026-05-26T06:22:24.205Z | Alice Hower's Live Chat Room-2.mp4 | 70.76 MB | 859.0s | 76ms | 1681ms | SUCCESS |
| 2026-05-26T06:24:00.237Z | Watch Yourwishisme_val live on Chaturbate.mp4 | 158.38 MB | 1406.0s | 101ms | 2402ms | SUCCESS |
| 2026-05-26T06:24:03.580Z | Watch Yourwishisme_val live on Chaturbate(2).mp4 | 93.47 MB | 372.8s | 67ms | 2217ms | SUCCESS |
| 2026-05-26T06:26:39.446Z | Watch Scarleett_jones live on Chaturbate (2).mp4 | 648.24 MB | 2585.6s | 74ms | 2319ms | SUCCESS |
| 2026-05-26T07:20:34.446Z | 31 minute long College Girls movie from Hellen Cruz.mp4 | 506.19 MB | 1899.6s | 154ms | 3869ms | SUCCESS |
| 2026-05-26T19:01:13.852Z | taylorstiles payluciarae pov bj.mp4 | 1.74 GB | 2423.1s | 165ms | 5392ms | SUCCESS |
| 2026-05-28T04:59:33.635Z | Watch Alexxisrae live on Chaturbate.mp4 | 52.95 MB | 211.2s | 265ms | 2390ms | SUCCESS |
| 2026-05-28T04:59:51.779Z | Ambar Coles Live Strippers Roleplay Alternative Chat Room.mp4 | 12.08 MB | 76.0s | 88ms | 13100ms | SUCCESS |
| 2026-05-28T04:59:52.293Z | Daphne Millerrs Live Foot Fetish European Girls Alternative Chat.mp4 | 175.59 MB | 712.4s | 262ms | 7064ms | SUCCESS |
| 2026-05-28T04:59:53.677Z | Watch Tinacb live on Chaturbate.mp4 | 87.45 MB | 348.8s | 528ms | 4944ms | SUCCESS |
| 2026-05-28T04:59:53.991Z | Watch Issa_garcia live on Chaturbate.mp4 | 164.63 MB | 268.8s | 180ms | 12412ms | SUCCESS |
| 2026-05-28T04:59:54.845Z | Watch Maryjane3_14 live on Chaturbate(2).mp4 | 411.42 MB | 483.2s | 98ms | 18537ms | SUCCESS |
| 2026-05-28T06:16:18.201Z | Mind Under Master Haley Spades Hime Marie Jazmin Luv ASMR SPA Hy.mp4 | 420.04 MB | 1853.8s | 221ms | 6525ms | SUCCESS |
| 2026-05-28T06:18:29.785Z | ScreenRecording_07-26-2025 00-45-40_1.MP4 | 216.5 MB | 634.3s | 91ms | 2824ms | SUCCESS |
| 2026-05-28T06:18:34.119Z | ScreenRecording_08-11-2025 21-49-02_1.MP4 | 93.35 MB | 295.1s | 93ms | 2517ms | SUCCESS |
| 2026-05-28T06:18:38.732Z | ScreenRecording_09-16-2025 20-05-06_1.MP4 | 113.09 MB | 355.6s | 90ms | 3193ms | SUCCESS |
| 2026-05-28T06:18:40.519Z | ScreenRecording_10-06-2025 11-10-18_1.MP4 | 202.48 MB | 594.1s | 112ms | 3469ms | SUCCESS |
| 2026-05-28T06:18:42.547Z | ScreenRecording_10-15-2025 04-54-50_1.MP4 | 371.98 MB | 1078.8s | 109ms | 3430ms | SUCCESS |
| 2026-05-28T06:18:44.845Z | ScreenRecording_10-15-2025 05-56-13_1.MP4 | 504.33 MB | 1482.3s | 111ms | 3176ms | SUCCESS |
| 2026-05-28T06:57:22.202Z | Taylor Vidal Private Webcam Show.mp4 | 210.69 MB | 1142.0s | 184ms | 5977ms | SUCCESS |
| 2026-05-28T06:57:25.760Z | Mia Diamod Private Webcam Show.mp4 | 118.58 MB | 575.3s | 87ms | 3144ms | SUCCESS |
| 2026-05-28T10:36:32.357Z | Zendaya Jays Live Big Boobs College Girls Girls Next Door Chat R.mp4 | 286.38 MB | 1166.0s | 273ms | 6139ms | SUCCESS |
| 2026-05-28T10:36:33.553Z | Zendaya Jay's webcam clips - Flirt4Free Videos.mp4 | 1.36 GB | 6880.7s | 185ms | 4120ms | SUCCESS |
| 2026-05-28T10:36:37.203Z | 70 minute long Big Boobs movie from Zendaya Jay.mp4 | 1010 MB | 4240.0s | 195ms | 3648ms | SUCCESS |
| 2026-05-28T10:37:28.564Z | 70 minute long Big Boobs movie from Zendaya Jay.mp4 | 1010 MB | 4240.0s | 143ms | 3570ms | SUCCESS |
| 2026-05-29T05:58:18.922Z | Watch Maryjane3_14 live on Chaturbate.mp4 | 148.45 MB | 604.8s | 197ms | 10454ms | SUCCESS |
| 2026-05-29T06:22:18.814Z | Watch Margoviento live on Chaturbate.mp4 | 496.75 MB | 820.8s | 103ms | 82774ms | SUCCESS |
| 2026-05-30T21:51:27.843Z | tyannabb 1 Tyannabb1 - tyannabb1 Private from 2025-10-31 041105 .mp4 | 211.29 MB | 860.5s | 92ms | 1196ms | SUCCESS |
| 2026-05-30T22:17:01.664Z | 1 Alejandra Millan Alejamillan11 X - Copy (1).mp4 | 2.64 MB | 13.4s | 95ms | 856ms | SUCCESS |
| 2026-05-30T22:18:02.712Z | private 11min Alexa Goddess Live Anal Squirters Latina Chat Room.mp4 | 283.58 MB | 655.2s | 123ms | 1666ms | SUCCESS |
| 2026-05-31T08:04:12.961Z | 1001738.mp4 | 151.52 MB | 945.0s | 128ms | 1393ms | SUCCESS |
| 2026-05-31T08:19:15.977Z | 1001738.mp4 | 151.52 MB | 945.0s | 100ms | 1171ms | SUCCESS |
| 2026-06-01T02:05:04.885Z | pigtails for my lovers - Xxxnba Camsoda.mp4 | 18.49 MB | 87.6s | 302ms | 3763ms | SUCCESS |

---

### **Benchmark Run: 2026-06-02 15:16:19**

### **VaultWares ASR Performance Benchmarks**

| Metric | Measured Performance Value | Description |
| :--- | :--- | :--- |
| **ASR Model Mode** | `SIMULATED FALLBACK` | Model engine implementation mode |
| **Execution Hardware** | `CUDA` | Target GPU/CPU computation device |
| **ASR Initialization Latency** | `1.5005 seconds` | Time to warm-load ASR weights onto RAM/VRAM |
| **Inference Latency (10s audio)** | `0.3062 seconds` | Time spent transcribing isolated vocals track |
| **Real-Time Factor (RTF)** | `0.0306` | Processing throughput factor (Speed Ratio) |
| **Native Translation Latency** | `0.1722 seconds` | Time to decode speech with translation to French |
| **Translation Throughput RTF** | `0.0172` | Real-time factor for translated decoding |
| **PyTorch VRAM Allocated** | `0.00 MB` | Active VRAM footprint utilized by model weights |
| **PyTorch VRAM Reserved** | `2.00 MB` | Peak GPU caching pool |

| 2026-06-02T22:21:24.915Z | Watch Helloiamastrid live on Chaturbate(17).mp4 | 2.94 MB | 4.8s | 119ms | 568ms | SUCCESS |
| 2026-06-02T22:21:25.641Z | Watch Helloiamastrid live on Chaturbate(18).mp4 | 137.83 MB | 779.2s | 381ms | 5604ms | SUCCESS |
| 2026-06-02T22:21:30.396Z | Watch Helloiamastrid live on Chaturbate(16).mp4 | 1.13 GB | 2969.6s | 143ms | 5183ms | SUCCESS |
| 2026-06-02T22:21:38.876Z | Watch Helloiamastrid live on Chaturbate(15).mp4 | 955.67 MB | 2979.2s | 120ms | 8224ms | SUCCESS |
| 2026-06-02T22:21:40.348Z | Watch Helloiamastrid live on Chaturbate(14).mp4 | 6.84 MB | 28.8s | 75ms | 1298ms | SUCCESS |
| 2026-06-09T04:17:09.104Z | Gabriela Portmanss Live Alternative Blonde Exotic Chat Room.mp4 | 7.51 MB | 180.0s | 218ms | 2722ms | SUCCESS |
| 2026-06-09T04:17:11.248Z | Mary Loris Live Domination Squirters Big Boobs Chat Room.mp4 | 14.45 MB | 266.4s | 204ms | 1848ms | SUCCESS |
| 2026-06-09T04:17:21.343Z | Nelly Gales Live European Girls Big Boobs Big Butts Chat Room.mp4 | 21.03 MB | 1106.4s | 139ms | 9862ms | SUCCESS |
| 2026-06-09T04:17:22.850Z | Melanny Garcias Live Exotic Foot Fetish Squirters Chat Room.mp4 | 5.31 MB | 60.0s | 149ms | 1266ms | SUCCESS |
| 2026-06-09T04:17:24.972Z | Samantha Wooss Live Latina Hairy Pussy Big Boobs Chat Room.mp4 | 25.14 MB | 285.6s | 144ms | 1887ms | SUCCESS |
| 2026-06-09T04:17:26.495Z | Очередь из девушек к твоему члену смотреть онлайн или скачать.mp4 | 204.39 MB | 798.1s | 100ms | 1325ms | SUCCESS |
| 2026-06-09T04:36:13.690Z | Gabriela Portmanss Live Alternative Blonde Exotic Chat Room.mp4 | 7.51 MB | 180.0s | 126ms | 1597ms | SUCCESS |
| 2026-06-09T04:36:15.714Z | Mary Loris Live Domination Squirters Big Boobs Chat Room.mp4 | 14.45 MB | 266.4s | 125ms | 1815ms | SUCCESS |
| 2026-06-09T04:36:25.765Z | Nelly Gales Live European Girls Big Boobs Big Butts Chat Room.mp4 | 21.03 MB | 1106.4s | 135ms | 9824ms | SUCCESS |
| 2026-06-09T04:36:27.323Z | Melanny Garcias Live Exotic Foot Fetish Squirters Chat Room.mp4 | 5.31 MB | 60.0s | 156ms | 1308ms | SUCCESS |
| 2026-06-09T04:36:29.347Z | Samantha Wooss Live Latina Hairy Pussy Big Boobs Chat Room.mp4 | 25.14 MB | 285.6s | 142ms | 1796ms | SUCCESS |
| 2026-06-09T04:40:41.664Z | Gabriela Portmanss Live Alternative Blonde Exotic Chat Room.mp4 | 7.51 MB | 180.0s | 127ms | 1569ms | SUCCESS |
| 2026-06-09T04:40:43.654Z | Mary Loris Live Domination Squirters Big Boobs Chat Room.mp4 | 14.45 MB | 266.4s | 127ms | 1784ms | SUCCESS |
| 2026-06-09T04:40:54.103Z | Nelly Gales Live European Girls Big Boobs Big Butts Chat Room.mp4 | 21.03 MB | 1106.4s | 131ms | 10229ms | SUCCESS |
| 2026-06-09T04:40:55.648Z | Melanny Garcias Live Exotic Foot Fetish Squirters Chat Room.mp4 | 5.31 MB | 60.0s | 162ms | 1300ms | SUCCESS |
| 2026-06-09T04:40:57.664Z | Samantha Wooss Live Latina Hairy Pussy Big Boobs Chat Room.mp4 | 25.14 MB | 285.6s | 140ms | 1795ms | SUCCESS |
| 2026-06-09T09:08:47.538Z | Railly Vannaguiden Cam Free Live Nude Sex Show Chat - Camsoda.mp4 | 106.07 MB | 1289.4s | 199ms | 1101ms | SUCCESS |
| 2026-06-09T09:08:49.013Z | Michelle Floress Live Ebony Roleplay Small Tits Chat Room(1).mp4 | 85.28 MB | 418.0s | 163ms | 1223ms | SUCCESS |
| 2026-06-09T09:08:50.551Z | Michelle Floress Live Ebony Roleplay Small Tits Chat Room.mp4 | 137.09 MB | 672.0s | 163ms | 1282ms | SUCCESS |
| 2026-06-09T09:15:47.083Z | Samantha Wooss Live Latina Hairy Pussy Big Boobs Chat Room.mp4 | 25.14 MB | 285.6s | 531ms | 1953ms | SUCCESS |
| 2026-06-09T09:15:58.182Z | Nelly Gales Live European Girls Big Boobs Big Butts Chat Room.mp4 | 21.03 MB | 1106.4s | 311ms | 10192ms | SUCCESS |
| 2026-06-09T09:18:29.411Z | Nelly Gales Live European Girls Big Boobs Big Butts Chat Room.mp4 | 21.03 MB | 1106.4s | 302ms | 9529ms | SUCCESS |
| 2026-06-09T09:18:31.830Z | Samantha Wooss Live Latina Hairy Pussy Big Boobs Chat Room.mp4 | 25.14 MB | 285.6s | 354ms | 1965ms | SUCCESS |
| 2026-06-09T09:20:24.427Z | Nelly Gales Live European Girls Big Boobs Big Butts Chat Room.mp4 | 21.03 MB | 1106.4s | 288ms | 9562ms | SUCCESS |
| 2026-06-09T09:20:26.698Z | Samantha Wooss Live Latina Hairy Pussy Big Boobs Chat Room.mp4 | 25.14 MB | 285.6s | 294ms | 1895ms | SUCCESS |
| 2026-06-09T09:26:24.968Z | Nelly Gales Live European Girls Big Boobs Big Butts Chat Room.mp4 | 21.03 MB | 1106.4s | 316ms | 10082ms | SUCCESS |
| 2026-06-09T09:26:27.292Z | Samantha Wooss Live Latina Hairy Pussy Big Boobs Chat Room.mp4 | 25.14 MB | 285.6s | 320ms | 1914ms | SUCCESS |
| 2026-06-09T09:32:01.208Z | Nelly Gales Live European Girls Big Boobs Big Butts Chat Room.mp4 | 21.03 MB | 1106.4s | 299ms | 10335ms | SUCCESS |
| 2026-06-09T09:32:03.620Z | Samantha Wooss Live Latina Hairy Pussy Big Boobs Chat Room.mp4 | 25.14 MB | 285.6s | 314ms | 2007ms | SUCCESS |
| 2026-06-09T10:59:25.248Z | Beatrishaa Cam Free Live Nude Sex Show Chat - Camsoda.mp4 | 326.17 MB | 1704.0s | 226ms | 1552ms | SUCCESS |
| 2026-06-09T10:59:28.577Z | Cums When Choked PornXP.mp4 | 576.74 MB | 1764.6s | 435ms | 2776ms | SUCCESS |
| 2026-06-09T10:59:32.006Z | Horny and Ready PornXP.mp4 | 711.97 MB | 2008.4s | 437ms | 2876ms | SUCCESS |
| 2026-06-09T10:59:44.870Z | Nelly Gales Live European Girls Big Boobs Big Butts Chat Room.mp4 | 21.03 MB | 1106.4s | 379ms | 12371ms | SUCCESS |
| 2026-06-09T10:59:47.939Z | Squirts Twice PornXP.mp4 | 831.69 MB | 2151.0s | 408ms | 2543ms | SUCCESS |
| 2026-06-09T10:59:50.550Z | Samantha Wooss Live Latina Hairy Pussy Big Boobs Chat Room.mp4 | 25.14 MB | 285.6s | 341ms | 2177ms | SUCCESS |
| 2026-06-09T11:07:41.313Z | Nelly Gales Live European Girls Big Boobs Big Butts Chat Room.mp4 | 21.03 MB | 1106.4s | 353ms | 11514ms | SUCCESS |
| 2026-06-09T11:07:43.866Z | Samantha Wooss Live Latina Hairy Pussy Big Boobs Chat Room.mp4 | 25.14 MB | 285.6s | 342ms | 2094ms | SUCCESS |
| 2026-06-09T12:29:59.704Z | 011.mp4 | 508.03 MB | 2124.6s | 288ms | 1231ms | SUCCESS |
| 2026-06-09T12:30:01.087Z | 01_Sandra_Romain.avi | 148.25 MB | 926.2s | 142ms | 1162ms | SUCCESS |
| 2026-06-09T12:30:02.469Z | 01 Nadia White.mp4 | 685.3 MB | 2243.6s | 149ms | 1146ms | SUCCESS |
| 2026-06-09T12:30:03.855Z | 03 Katrina Jade.mp4 | 514.56 MB | 1619.8s | 175ms | 1125ms | SUCCESS |
| 2026-06-09T12:30:05.130Z | 00_Introduction.avi | 17.23 MB | 109.1s | 124ms | 1083ms | SUCCESS |
| 2026-06-09T12:30:06.569Z | 02 Ariella Ferrera.mp4 | 1019.27 MB | 2976.4s | 143ms | 1207ms | SUCCESS |
| 2026-06-09T12:30:07.972Z | 02_Roxy_Deville.avi | 83.92 MB | 524.2s | 139ms | 1184ms | SUCCESS |
| 2026-06-09T12:30:09.410Z | 03.mp4 | 420.35 MB | 1772.1s | 161ms | 1176ms | SUCCESS |
| 2026-06-09T12:30:10.800Z | 04 Maya Bijou.mp4 | 668.47 MB | 2129.5s | 145ms | 1144ms | SUCCESS |
| 2026-06-09T12:30:12.246Z | 02.mp4 | 366.55 MB | 1539.7s | 152ms | 1181ms | SUCCESS |
| 2026-06-09T12:30:13.607Z | 03_Jasmine_Tame.avi | 121.37 MB | 758.2s | 129ms | 1153ms | SUCCESS |
| 2026-06-09T12:30:14.938Z | 05 Abella Danger.mp4 | 540.58 MB | 1784.6s | 144ms | 1100ms | SUCCESS |
| 2026-06-09T12:30:16.334Z | 04_Hillary_Scott.avi | 116.05 MB | 725.2s | 129ms | 1192ms | SUCCESS |
| 2026-06-09T12:30:17.795Z | 05.mp4 | 430.94 MB | 1805.8s | 159ms | 1199ms | SUCCESS |
| 2026-06-09T12:30:19.302Z | 04.mp4 | 538.41 MB | 2256.6s | 155ms | 1250ms | SUCCESS |
| 2026-06-09T12:30:20.598Z | 06 Gina Valentina.mp4 | 363.53 MB | 1321.8s | 143ms | 1070ms | SUCCESS |
| 2026-06-09T12:30:21.938Z | 05_Marquetta_Jewel.avi | 164.46 MB | 1033.6s | 129ms | 1133ms | SUCCESS |
| 2026-06-09T12:30:23.250Z | 06_Lexi_Bardot.avi | 84.74 MB | 529.1s | 123ms | 1109ms | SUCCESS |
| 2026-06-09T12:30:24.570Z | 07 Jill Kassidy.mp4 | 464.95 MB | 1605.9s | 136ms | 1097ms | SUCCESS |
| 2026-06-09T12:30:25.894Z | 07_Dana_Vespoli.avi | 124.69 MB | 779.1s | 135ms | 1116ms | SUCCESS |
| 2026-06-09T12:30:27.263Z | 08 Holly Hendrix.mp4 | 598.27 MB | 1717.9s | 168ms | 1115ms | SUCCESS |
| 2026-06-09T12:30:28.613Z | 08_Adrianna.avi | 117.04 MB | 731.2s | 128ms | 1145ms | SUCCESS |
| 2026-06-09T12:30:29.954Z | 09 Brianna Bentley.mp4 | 360.36 MB | 1211.7s | 142ms | 1113ms | SUCCESS |
| 2026-06-09T12:30:31.592Z | 012.mp4 | 2.79 GB | 10901.0s | 171ms | 1343ms | SUCCESS |
| 2026-06-09T12:30:34.044Z | 'do You Want to Help Give Step Mommy a Massage¿'.mp4 | 870.17 MB | 1183.1s | 214ms | 2141ms | SUCCESS |
| 2026-06-09T12:30:35.356Z | 10 Jade Luv.mp4 | 282.25 MB | 1127.9s | 151ms | 1082ms | SUCCESS |
| 2026-06-09T12:30:37.313Z | 10.04.2026_WEBDL_Yurievij_Cum On My Face 3_Evil Angel_Jonni Darkko_720p.mp4 | 5.04 GB | 13817.2s | 195ms | 1593ms | SUCCESS |
| 2026-06-09T12:30:38.674Z | 13_Sativa_Rose.avi | 106.16 MB | 663.1s | 126ms | 1153ms | SUCCESS |
| 2026-06-09T12:30:40.055Z | 12_Arcadia.avi | 138.18 MB | 863.2s | 140ms | 1158ms | SUCCESS |
| 2026-06-09T12:30:41.486Z | 11_Nadia_Styles.avi | 99.6 MB | 622.2s | 141ms | 1212ms | SUCCESS |
| 2026-06-09T12:30:42.913Z | 15_Kelly_Wells.avi | 83.51 MB | 521.2s | 139ms | 1205ms | SUCCESS |
| 2026-06-09T12:30:44.291Z | 14_Tori_Lane.avi | 137.17 MB | 857.2s | 129ms | 1169ms | SUCCESS |
| 2026-06-09T12:30:45.665Z | 16_Closing_Credits.avi | 5.07 MB | 33.6s | 127ms | 1179ms | SUCCESS |
| 2026-06-09T12:30:46.999Z | 09_Delilah_Strong.avi | 92.56 MB | 578.1s | 129ms | 1135ms | SUCCESS |
| 2026-06-09T12:30:48.349Z | 10_Courtney_Simpson.avi | 88.11 MB | 550.1s | 128ms | 1149ms | SUCCESS |
| 2026-06-09T12:30:50.383Z | 21.04.2026_Yurievij_Dirty Talk_Robby D_Digital Playground_720p.mkv | 3.28 GB | 5467.1s | 295ms | 1668ms | SUCCESS |
| 2026-06-09T12:30:50.815Z | 2107. 9Young Blonde STEPDAUGHTER Takes TWO HUGE LOADS to Face now OUT OF TROUBLE_FabulousCash_1080p.mp4 | 337 MB | 1107.7s | N/A | N/A | FAILED |
| 2026-06-09T12:30:52.558Z | analonly.26.04.08.kalani.luana.and.emma.rosie.480p.mp4 | 708.62 MB | 5144.1s | 183ms | 1455ms | SUCCESS |
| 2026-06-09T12:30:54.131Z | alexa nicole Suck It Dry 10_Evil Angel_13_720p.mp4 | 689.28 MB | 1148.4s | 154ms | 1340ms | SUCCESS |
| 2026-06-09T12:30:55.767Z | anissa kate Suck It Dry 10_Evil Angel_12_720p.mp4 | 625.64 MB | 1056.2s | 158ms | 1394ms | SUCCESS |
| 2026-06-09T12:30:57.420Z | adrianna nicole Suck It Dry 10_Evil Angel_14_720p.mp4 | 933.25 MB | 1571.2s | 156ms | 1419ms | SUCCESS |
| 2026-06-09T12:30:59.414Z | Aunt Helps Step Mom Nurse Step Son After Taking Boner Pills.mp4 | 1.31 GB | 1825.4s | 205ms | 1693ms | SUCCESS |
| 2026-06-09T12:31:00.860Z | Anna Lee-Ass So Tight-MR POV-NEW July 29, 2015 torrent NEW.mp4 | 426.39 MB | 1280.6s | 145ms | 1222ms | SUCCESS |
| 2026-06-09T12:31:02.811Z | 246porn.com.2107.6YOUR ASIAN FANTASY Includes HOT CHINESE BABE for SUCK & FUCK & a MESSY FACE_FabulousCash_1080p.mp4 | 383.89 MB | 1008.1s | 203ms | 1666ms | SUCCESS |
| 2026-06-09T14:38:12.604Z | 2107. 9Young Blonde STEPDAUGHTER Takes TWO HUGE LOADS to Face now OUT OF TROUBLE_FabulousCash_1080p.mp4 | 337 MB | 1107.7s | N/A | N/A | FAILED |
| 2026-06-09T14:44:25.562Z | 2107. 9Young Blonde STEPDAUGHTER Takes TWO HUGE LOADS to Face now OUT OF TROUBLE_FabulousCash_1080p.mp4 | 337 MB | 1107.7s | N/A | N/A | FAILED |
| 2026-06-09T15:10:50.552Z | 2107. 9Young Blonde STEPDAUGHTER Takes TWO HUGE LOADS to Face now OUT OF TROUBLE_FabulousCash_1080p.mp4 | 337 MB | 1107.7s | N/A | N/A | FAILED |
| 2026-06-10T09:31:19.436Z | 15_Kelly_Wells.avi | 83.51 MB | 521.2s | 474ms | 1239ms | SUCCESS |
| 2026-06-10T09:31:20.958Z | 10_Courtney_Simpson.avi | 88.11 MB | 550.1s | 158ms | 1276ms | SUCCESS |
| 2026-06-10T09:31:22.455Z | 14_Tori_Lane.avi | 137.17 MB | 857.2s | 151ms | 1258ms | SUCCESS |
| 2026-06-10T09:31:23.913Z | 13_Sativa_Rose.avi | 106.16 MB | 663.1s | 151ms | 1218ms | SUCCESS |
| 2026-06-10T09:31:25.364Z | 09_Delilah_Strong.avi | 92.56 MB | 578.1s | 166ms | 1199ms | SUCCESS |
| 2026-06-10T09:31:26.840Z | 12_Arcadia.avi | 138.18 MB | 863.2s | 150ms | 1239ms | SUCCESS |
| 2026-06-10T09:31:28.332Z | 11_Nadia_Styles.avi | 99.6 MB | 622.2s | 149ms | 1258ms | SUCCESS |
| 2026-06-10T09:39:08.079Z | ThisGirlSucks.22.01.25.Leana.Lovings.Cutie.On.A.Leash.XXX.1080p.HEVC.x265.PRT.mkv | 309.97 MB | 1512.3s | 595ms | 2499ms | SUCCESS |
| 2026-06-10T09:39:10.401Z | thisgirlsucks.24.08.27.nicole.aria.i.fucking.love.sucking.dick.mp4 | 648.1 MB | 1674.4s | 291ms | 1914ms | SUCCESS |
| 2026-06-10T09:39:12.014Z | sislovesme.21.03.12.vivian.taylor.play.me.like.your.piano.mp4 | 426.75 MB | 3082.6s | 185ms | 1297ms | SUCCESS |
| 2026-06-10T09:39:13.518Z | SisLovesMe - Aria Sloane (27.12.2025) rq.mp4 | 345.28 MB | 3419.5s | 180ms | 1227ms | SUCCESS |
| 2026-06-10T09:39:15.061Z | thisgirlsucks.24.10.22.molly.little.480p.mp4 | 140.82 MB | 1023.4s | 191ms | 1270ms | SUCCESS |
| 2026-06-10T09:39:16.618Z | sislovesme.21.10.08.lily.lou.stepsisters.are.forever.mp4 | 338.74 MB | 2433.8s | 185ms | 1277ms | SUCCESS |
| 2026-06-10T09:39:18.277Z | SisLovesMe - Mckenzie Mae (02.05.2026) rq.mp4 | 244.84 MB | 2686.8s | 181ms | 1377ms | SUCCESS |
| 2026-06-10T09:39:19.320Z | Primal Fetish - Aspen Celeste - Getting Ready for Prom.mp4 | 340.39 MB | 2945.9s | 139ms | 824ms | SUCCESS |
| 2026-06-10T09:39:21.088Z | [PrimalFetish] Jasmine Grey Confronting My Step-Sister Part 2 (26.05.29)[720p][x264][xFans].mp4 | 165.68 MB | 908.8s | 220ms | 1446ms | SUCCESS |
| 2026-06-10T09:39:45.606Z | SisLovesMe - Kiana Kumani (07.02.2026) rq.mp4 | 362.5 MB | 3076.0s | 189ms | 1261ms | SUCCESS |
| 2026-06-10T09:39:47.150Z | SisLovesMe - Sasha Tatcha (18.04.2026) rq.mp4 | 281.31 MB | 3347.7s | 174ms | 1266ms | SUCCESS |
| 2026-06-10T09:39:48.942Z | sislovesme.26.04.04.linzee.ryder.and.ruby.moon.480p.mp4 | 586.18 MB | 4235.1s | 207ms | 1474ms | SUCCESS |
| 2026-06-10T09:39:50.546Z | SisLovesMe - Alina Voss (14.02.2026) rq.mp4 | 322.45 MB | 3349.5s | 183ms | 1317ms | SUCCESS |
| 2026-06-10T09:39:52.228Z | sislovesme.26.04.25.gracey.snow.480p.mp4 | 465.64 MB | 3373.8s | 212ms | 1360ms | SUCCESS |
| 2026-06-10T09:39:53.722Z | SisLovesMe - Violet Dawn (07.03.2026) rq.mp4 | 330.99 MB | 3517.8s | 178ms | 1210ms | SUCCESS |
| 2026-06-10T09:39:55.092Z | SisLovesMe - Madison Wilde (28.02.2026) rq.mp4 | 213.92 MB | 3123.7s | 170ms | 1106ms | SUCCESS |
| 2026-06-10T09:39:57.176Z | Suck It Dry 1.avi | 1.37 GB | 8331.0s | 204ms | 1681ms | SUCCESS |
| 2026-06-10T09:41:49.509Z | ava-moore.deux.copines.utilisent.la.grosse.queue.d.un.pote.pour.se.faire.jouir.mp4 | 246.01 MB | 784.3s | 200ms | 1629ms | SUCCESS |
| 2026-06-10T09:41:51.454Z | ava-moore.deux.salopes.excitees.se.font.baiser.a.la.suite.par.une.enorme.queue.mp4 | 538.21 MB | 1702.8s | 197ms | 1640ms | SUCCESS |
| 2026-06-10T09:41:52.870Z | Ava Dalush - Pretty Sucks It Up To The Balls (27.10.2018)_406p.mp4 | 408.19 MB | 2104.9s | 155ms | 1166ms | SUCCESS |
| 2026-06-10T09:41:54.845Z | ava-moore.une.lapine.sexy.se.fait.baiser.dans.les.bois.et.remplir.la.chatte.de.sperme.mp4 | 425.84 MB | 1348.6s | 188ms | 1677ms | SUCCESS |
| 2026-06-10T09:41:55.373Z | badmommypov.22.04.16.linzee.ryder.step.mommy.is.supplementing.the.ine.mp4 | 141.13 MB | 0.0s | N/A | N/A | FAILED |
| 2026-06-10T09:41:57.588Z | baddaddypov.25.05.20.gracie.gates.please.fuck.me.stepdaddy.mp4 | 1.87 GB | 1682.7s | 281ms | 1837ms | SUCCESS |
| 2026-06-10T09:41:59.961Z | baddaddypov.25.11.18.sona.bella.will.do.anything.for.stepdads.cock.mp4 | 1.71 GB | 1575.0s | 304ms | 1974ms | SUCCESS |
| 2026-06-10T10:10:22.507Z | badmommypov.22.04.16.linzee.ryder.step.mommy.is.supplementing.the.ine.mp4 | 141.13 MB | 0.0s | N/A | N/A | FAILED |
| 2026-06-10T10:13:21.854Z | scene2_Bobbi Bliss.avi | 101.03 MB | 1057.0s | 213ms | 1386ms | SUCCESS |
| 2026-06-10T10:13:23.608Z | scene7_Jenna Haze.avi | 93.42 MB | 534.8s | 220ms | 1440ms | SUCCESS |
| 2026-06-10T10:13:25.310Z | scene15_Renee Cruz.avi | 73.98 MB | 497.3s | 206ms | 1402ms | SUCCESS |
| 2026-06-10T10:13:26.895Z | opening credits.avi | 54.34 MB | 254.5s | 166ms | 1331ms | SUCCESS |
| 2026-06-10T10:13:28.457Z | 16_Closing_Credits.avi | 5.07 MB | 33.6s | 157ms | 1318ms | SUCCESS |
| 2026-06-10T10:13:29.961Z | 06_Lexi_Bardot.avi | 84.74 MB | 529.1s | 159ms | 1255ms | SUCCESS |
| 2026-06-10T10:13:31.729Z | ending credits.avi | 6.71 MB | 41.6s | 159ms | 1529ms | SUCCESS |
| 2026-06-10T10:13:33.429Z | BadDaddyPOV - Gracie Gates - Just Wants to Please Her Step Dad (10.09.2025) rq.mp4 | 591.79 MB | 1593.9s | 203ms | 1404ms | SUCCESS |
| 2026-06-10T10:13:35.260Z | YesGirlz - Indica Marie - Pink Lingerie Tease Wild Fuck Fest (14.08.2025) rq.mp4 | 540.02 MB | 2465.9s | 228ms | 1496ms | SUCCESS |
| 2026-06-10T10:13:37.152Z | ted.26.05.08.emma.rosie.mp4 | 399.53 MB | 1394.4s | 221ms | 1573ms | SUCCESS |
| 2026-06-10T10:13:57.223Z | OnlyFans - Little Puck - Jealous Step Mom Has Her Way With You rq.mp4 | 533.06 MB | 2093.8s | 240ms | 1583ms | SUCCESS |
| 2026-06-10T10:13:58.792Z | Cum.On.My.Cute.Face.1.2020.P2.mp4 | 1.28 GB | 9086.8s | 200ms | 1280ms | SUCCESS |
| 2026-06-10T10:14:00.723Z | Cum.On.My.Cute.Face.1.2020.P1.mp4 | 1.78 GB | 9500.9s | 244ms | 1553ms | SUCCESS |
| 2026-06-10T10:14:02.419Z | Dirty.Talk.9.XXX.DVDRip.x264-GalaXXXy.mkv | 1.04 GB | 8143.5s | 194ms | 1413ms | SUCCESS |
| 2026-06-10T10:14:04.105Z | daughterjoi.26.01.06.sasha.pearl.dirty.talk.for.stepdaddy.480p.mp4 | 107.95 MB | 781.2s | 223ms | 1365ms | SUCCESS |
| 2026-06-10T10:14:06.283Z | OnlyFans - Jessie And Jackson - Dirty Talk Doggy Anal Creampie rq.mp4 | 247.55 MB | 798.0s | 246ms | 1833ms | SUCCESS |
| 2026-06-10T10:14:08.174Z | YesGirlz - Nikki Nicole - Tattoos, Fishnets, and Wild Sex (25.09.2025) rq.mp4 | 440.36 MB | 1579.4s | 242ms | 1550ms | SUCCESS |
| 2026-06-10T10:14:10.969Z | yesgirlz.25.10.09.asteria.jade.mp4 | 628.06 MB | 1756.3s | 412ms | 2273ms | SUCCESS |
| 2026-06-10T10:14:12.652Z | bdpov.23.03.21.maria.anjel.all.natural.blonde.spreads.for.stepdaddys.cock.mp4 | 131.62 MB | 945.0s | 208ms | 1378ms | SUCCESS |
| 2026-06-10T10:14:14.663Z | [BadDaddyPOV] Dakota Skye The Best Daddy-'s Day (26.06.01)[720p][x264][xFans].mp4 | 194.78 MB | 1073.6s | 243ms | 1664ms | SUCCESS |
| 2026-06-10T10:14:16.291Z | BadDaddyPOV - Aubry Babcock - Good Girl for StepDaddy (01.07.2025) rq.mp4 | 404.56 MB | 1080.0s | 204ms | 1323ms | SUCCESS |
| 2026-06-10T10:14:17.943Z | bdpov.21.05.03.everly.haze.fuck.my.pretty.pink.pussy.step.daddy.mp4 | 125.75 MB | 907.7s | 216ms | 1337ms | SUCCESS |
| 2026-06-10T10:14:20.659Z | Dakota Skye - Dakota Skye Wants You To Have The Best Daddy's Day (01.06.2026)_1080p.mp4 | 1.03 GB | 1073.6s | 321ms | 2299ms | SUCCESS |
| 2026-06-10T10:14:22.785Z | Cum.On.My.Cute.Face.4.2023.mp4 | 2.72 GB | 14316.8s | 231ms | 1702ms | SUCCESS |
| 2026-06-10T10:14:25.228Z | evilangel.26.05.18.emma.rosie.mp4 | 921.89 MB | 1715.0s | 312ms | 2023ms | SUCCESS |
| 2026-06-10T10:14:31.108Z | DickDrainers.24.08.16.Emma.Rosie.XXX.1080p.HEVC.x265.PRT.mkv | 1.09 GB | 5904.7s | 1297ms | 4487ms | SUCCESS |
| 2026-06-10T10:14:33.354Z | Tiny4k - Emma Rosie - Tiny Sleepover (04.09.2025) rq.mp4 | 490.34 MB | 2239.0s | 219ms | 1912ms | SUCCESS |
| 2026-06-10T10:14:35.004Z | JulesJordan - Emma Rosie - Petite Freak Emma Rosie Shows Off Her Anal rq.mp4 | 533.2 MB | 2095.2s | 185ms | 1360ms | SUCCESS |
| 2026-06-10T10:59:34.203Z | Elsa Jean - Cock Worship Princess.mp4 | 1011.82 MB | 697.7s | 571ms | 3148ms | SUCCESS |
| 2026-06-10T10:59:35.868Z | thisgirlsucks.23.01.10.harley.king.perfect.cocksucking.skills.mp4 | 175.98 MB | 1280.3s | 198ms | 1372ms | SUCCESS |
| 2026-06-10T10:59:37.407Z | doghousedigital.26.04.15.emma.rosie.she.loves.to.squirt.480p.mp4 | 202.25 MB | 1468.1s | 195ms | 1251ms | SUCCESS |
| 2026-06-10T10:59:41.992Z | Emma Rosie - Emma Rosie Deepthroats BBC And Gets A Huge Facial Cumshot (08.04.2026)_2160p.mp4 | 1.13 GB | 773.8s | 319ms | 4154ms | SUCCESS |
| 2026-06-10T10:59:43.599Z | thisgirlsucks.22.11.08.haley.spades.haley.loves.cock.mp4 | 125.56 MB | 913.1s | 216ms | 1294ms | SUCCESS |
| 2026-06-10T10:59:45.022Z | BlackedRaw - Isabella Jules, Emma Rosie - Tiny Blonde And BFF Take Turns With Massive BBC (28.09.2025) rq.mp4 | 485.92 MB | 1926.2s | 165ms | 1166ms | SUCCESS |
| 2026-06-10T10:59:46.984Z | otb.26.03.19.emma.rosie.mp4 | 665.18 MB | 1555.3s | 223ms | 1644ms | SUCCESS |
| 2026-06-10T10:59:48.516Z | PervzSingles - Coco Lovelock, Demi Hawks, Emma Rosie (27.04.2026) rq.mp4 | 273.29 MB | 2821.9s | 193ms | 1231ms | SUCCESS |
| 2026-06-10T10:59:50.815Z | PrimalFetish.26.05.13.Lory.Lace.XXX.720p.MP4-MaMi.mp4 | 663.2 MB | 2175.6s | 220ms | 1969ms | SUCCESS |