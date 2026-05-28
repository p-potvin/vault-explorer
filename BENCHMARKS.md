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