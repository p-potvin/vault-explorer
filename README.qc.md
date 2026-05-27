# 📂 L'Explorateur de Voûte (Vault Explorer)

L'Explorateur de Voûte est une application de bureau hautement avancée et intégrée nativement, conçue spécifiquement pour gérer, naviguer et optimiser votre bibliothèque vidéo locale à des vitesses fulgurantes. Fonctionnant comme un explorateur extraverti, il est entièrement localisé (Français Québécois), sécurisé et non destructif.

---

## 🚀 Fonctionnalités Clés

* **Indexation Asynchrone Éclair :** Bâtie de façon sécuritaire sur des générateurs Node `fs.promises` natifs pour ramper récursivement à travers des structures de dossiers géantes en quelques secondes sans jamais bloquer l'interface.
* **Dossiers Virtuels ("Fausses Chemises") :** Organisez vos vidéos de manière 100% virtuelle ! Créez des « faux dossiers » abstraits, gérés par métadonnées locales, vous permettant de classer vos fichiers d'une session à l'autre sans jamais toucher ni modifier vos fichiers réels sur le disque.
* **Aperçu WebM au Survol & Superpositions :** Au survol de la souris, une fenêtre d'aperçu intelligente et accélérée matériellement se superpose de façon fluide sur vos miniatures. Les aperçus sont générés dynamiquement en se branchant directement sur FFmpeg.
* **Renommage Global Intelligent :** Appuyez sur `F2` pour lancer une expression régulière locale intelligente qui renomme symétriquement le fichier vidéo ainsi que toutes les affiches, miniatures et sous-actifs rattachés.
* **Lecteur Média HTML5 Intégré :** Double-cliquez instantanément sur vos vidéos pour invoquer un cinéma de visionnement sans bordure et assombri, propulsé par la logique HTML5 de Chromium pour une lecture fluide et accélérée par carte graphique.
* **Mini-Lecteur Incrustation d'Image (PiP) :** Basculez vers un mini-lecteur flottant persistant et non-bloquant pour continuer à visionner votre média tout en naviguant dans d'autres répertoires.
* **Minuteur de Lecture Automatique Continu :** Visionnez vos listes de lecture les mains libres grâce à un compte à rebours de transition automatique vers la vidéo suivante dès que la lecture en cours se termine.
* **⚡ Téléchargeur Débridé Real-Debrid :** Débridage et téléchargement ultra-rapide pour liens Rapidgator, Turbobit et magnets, avec un tunnel proxy sécurisé intégré (ex: VPS GreenCloud via Tailscale).
* **Banc d'Essai de Reconnaissance Vocale (ASR) :** Suites de tests de performance natives GPU CUDA et simulateurs pour évaluer le temps de latence du traitement de la parole et la performance globale du système.
* **Pipeline de Traduction de Flux en Direct en Temps Réel :** Un pipeline de traduction parole-à-parole de pointe conçu pour traduire les flux audio anglais vers le français en temps réel.
  * **Double Mode d'Ingestion :** Supporte la capture de boucle audio système WASAPI standard (pour capturer les navigateurs web, VLC ou lecteurs de musique) ou l'ingestion directe de flux média HTTPS (via un tuyau FFmpeg robuste).
  * **Pile Technologique d'IA Moderne :** Utilise NVIDIA NeMo `ParakeetV3` local accéléré par GPU pour la transcription, et `Kokoro-82M ONNX` local pour une synthèse vocale de qualité supérieure en float 32 bits.
  * **Atténuation Sonore Automatique (Ducking) :** Intègre `pycaw` pour baisser automatiquement le volume des navigateurs/applications à 15% pendant que la voix synthétisée parle, éliminant ainsi les boucles de rétroaction.
  * **Visualisateur d'Ondes Sci-Fi :** Anime un visualisateur de pics audio lumineux à 20 bandes cartographié directement sur le tampon de synthèse de Kokoro.
  * **Profils de Voix & Accent Personnalisés :** Ajustez les préréglages de voix, calibrez la sensibilité de détection du silence, ajustez les volumes de mixage et choisissez entre le français européen standard ou des profils d'accent Québécois localisés.
* **Persistance Bilingue de l'Interface :** Supporte une bascule persistante Anglais/Québécois et la sauvegarde de vos thèmes personnalisés (ex: Golden Slate, WinUI 3 Glass).

---

## 📦 Pile Technologique

* **Electron:** Cadre d'application Chromium propulsant le moteur de façon native et fluide.
* **Javascript & Node.js:** Backends asynchrones à haut indice d'octane reliant les nœuds DOM internes aux systèmes de protocoles standards IPC.
* **WinUI 3 Glass Design Aesthetics:** Design WinUI 3 aux esthétiques d'acrylique dynamique, modes sombres, arrière-plans floutés et animations fluides.

---

## 🔨 Développement

1. **Lancer l'environnement de dev :**

   ```bash
   npm start
   ```

   *(ou / ou `electron .`)*

2. **Paqueter l'exécutable Windows (NSIS) :**
   
   ```bash
   npm run dist
   ```

---

## 🛠️ Outils PowerShell Autonomes

L'Explorateur de Voûte est livré avec une collection d'enveloppes PowerShell autonomes de haute performance situées dans le répertoire `powershell/`. Celles-ci vous permettent d'exécuter des tâches lourdes en arrière-plan, des tests de performance, de la normalisation audio et de la traduction en direct directement à partir de la console.

Chaque script résout automatiquement son environnement virtuel requis (`vault-explorer/.venv` pour les services loopback légers et `vaultwares-media-processing/.venv` pour les réseaux de neurones lourds) afin de garantir une exécution fluide.

### 1. Start-LivestreamTranslator.ps1
Lance le pipeline de traduction de boucle WASAPI système, capturant la lecture en temps réel de votre navigateur ou lecteur audio, traduisant de l'anglais vers le français québécois, et lisant la voix Kokoro TTS synthétisée.
* **Emplacement :** `powershell/Start-LivestreamTranslator.ps1`
* **Paramètres :**
  * `-Voice` (Chaîne) : Préréglage de voix Kokoro TTS. Par défaut `ff_siwis`. Autres choix : `af_bella`, `af_nicole`, `ff_siwis`, `bf_emma`.
  * `-Lang` (Chaîne) : Format de langue cible (ex: `fr-fr` ou `fr-ca`). Par défaut `fr-fr`.
  * `-Threshold` (Double) : Seuil de barrière de bruit d'amplitude pour déclencher la transcription. Par défaut `0.005`.
  * `-Volume` (Double) : Multiplicateur du volume de mixage de la voix de synthèse (de `0.0` à `1.0`). Par défaut `0.80`.
* **Exemple :**
  ```powershell
  .\powershell\Start-LivestreamTranslator.ps1 -Voice "af_bella" -Threshold 0.008 -Volume 0.90
  ```

### 2. Start-StreamTranslator.ps1
Canalise un flux HTTPS externe (audio/vidéo) en direct via FFmpeg directement dans le pipeline de traduction et synthèse vocale.
* **Emplacement :** `powershell/Start-StreamTranslator.ps1`
* **Paramètres :**
  * `-StreamUrl` (Chaîne, **Obligatoire**) : URL source du flux média HTTPS/RTMP direct.
  * `-Voice` (Chaîne) : Préréglage de voix Kokoro.
  * `-Lang` (Chaîne) : Format de langue cible.
  * `-Threshold` (Double) : Seuil de bruit d'amplitude.
  * `-Volume` (Double) : Multiplicateur de volume de sortie.
* **Exemple :**
  ```powershell
  .\powershell\Start-StreamTranslator.ps1 -StreamUrl "https://exemple.com/live/stream.m3u8" -Voice "bf_emma" -Volume 0.75
  ```

### 3. Start-AudioNormalization.ps1
Traite un fichier vidéo ciblé, isole les pistes de fond à l'aide de Demucs, exécute la transcription ASR, génère des sous-titres SRT et encode le mixage stéréo modernisé dans une copie de préservation.
* **Emplacement :** `powershell/Start-AudioNormalization.ps1`
* **Paramètres :**
  * `-VideoPath` (Chaîne, **Obligatoire**) : Chemin absolu vers le fichier vidéo source.
  * `-VaultRoot` (Chaîne, Optionnel) : Dossier racine de la voûte. Par défaut, le dossier parent de la vidéo.
  * `-Transcribe` (Bascule) : Si spécifié, exécute la transcription et génère les fichiers sous-titres `.srt`.
  * `-TranslateTo` (Chaîne, Optionnel) : Code de langue cible pour synthétiser des pistes de traduction.
* **Exemple :**
  ```powershell
  .\powershell\Start-AudioNormalization.ps1 -VideoPath "C:\Videos\movie.mp4" -Transcribe -TranslateTo "fr"
  ```

### 4. Start-AsrBenchmark.ps1
Exécute un profilage complet de performance sur les systèmes de transcription locaux, chargeant les poids de modèles de façon chaude et générant des télémétries de latence fidèles.
* **Emplacement :** `powershell/Start-AsrBenchmark.ps1`
* **Paramètres :**
  * `-Native` (Bascule) : Force les tests à charger les poids natifs NVIDIA NeMo sur CUDA.
  * `-ForceSimulation` (Bascule) : Force le mode simulateur hors ligne sans télécharger les poids de modèle.
* **Exemple :**
  ```powershell
  .\powershell\Start-AsrBenchmark.ps1 -Native
  ```

### 5. Start-PreviewGenerator.ps1
Parcourt récursivement une structure de dossiers et génère des extraits continus WebM au survol de la souris ainsi que des miniatures d'images clés pour toutes les vidéos découvertes.
* **Emplacement :** `powershell/Start-PreviewGenerator.ps1`
* **Paramètres :**
  * `-ScanDir` (Chaîne, Optionnel) : Chemin absolu du dossier à analyser.
* **Exemple :**
  ```powershell
  .\powershell\Start-PreviewGenerator.ps1 -ScanDir "C:\MaVoûte"
  ```
