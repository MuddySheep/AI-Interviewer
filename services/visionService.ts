import { FilesetResolver, FaceLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

class VisionService {
  private faceLandmarker: FaceLandmarker | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
  private isInitialized = false;
  private lastTimestamp = -1;

  // Analysis Stats
  private totalFrames = 0;
  private eyeContactFrames = 0;
  private goodPostureFrames = 0;

  async initialize() {
    if (this.isInitialized) return;

    try {
      const visionGen = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );

      this.faceLandmarker = await FaceLandmarker.createFromOptions(visionGen, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });

      this.poseLandmarker = await PoseLandmarker.createFromOptions(visionGen, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 1
      });

      this.isInitialized = true;
      this.lastTimestamp = -1;
      this.reset();
      console.log("MediaPipe Initialized");
    } catch (error) {
      console.error("Failed to initialize MediaPipe", error);
    }
  }

  reset() {
    this.totalFrames = 0;
    this.eyeContactFrames = 0;
    this.goodPostureFrames = 0;
    this.lastTimestamp = -1;
  }

  analyze(video: HTMLVideoElement, timestamp: number) {
    if (!this.isInitialized || !this.faceLandmarker || !this.poseLandmarker) return null;
    
    // Ensure monotonically increasing timestamp to prevent graph errors
    // Also ensure timestamp > 0, as 0 can cause "timestamp mismatch" errors in some graphs
    if (timestamp <= this.lastTimestamp || timestamp <= 0) {
        return null;
    }
    this.lastTimestamp = timestamp;

    try {
        // Run detections
        const faceResult = this.faceLandmarker.detectForVideo(video, timestamp);
        const poseResult = this.poseLandmarker.detectForVideo(video, timestamp);

        // Basic Logic for Nudges
        let eyeContactIssue = false;
        let postureIssue = false;
        let postureMessage = "";

        // 1. Eye Contact Analysis (simplified using blendshapes)
        if (faceResult.faceBlendshapes && faceResult.faceBlendshapes.length > 0) {
        const bs = faceResult.faceBlendshapes[0].categories;
        const findScore = (name: string) => bs.find(b => b.categoryName === name)?.score || 0;
        
        const lookLeft = findScore('eyeLookInLeft') + findScore('eyeLookOutRight');
        const lookRight = findScore('eyeLookOutLeft') + findScore('eyeLookInRight');
        const lookDown = findScore('eyeLookDownLeft') + findScore('eyeLookDownRight');
        const lookUp = findScore('eyeLookUpLeft') + findScore('eyeLookUpRight');

        if (lookLeft > 0.8 || lookRight > 0.8 || lookDown > 0.6 || lookUp > 0.6) {
            eyeContactIssue = true;
        }
        }

        // 2. Posture Analysis
        if (poseResult.landmarks && poseResult.landmarks.length > 0) {
        const landmarks = poseResult.landmarks[0];
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];

        const yDiff = Math.abs(leftShoulder.y - rightShoulder.y);
        if (yDiff > 0.15) {
            postureIssue = true;
            postureMessage = "You're tilting your shoulders.";
        }
        }

        // Stats Accumulation
        this.totalFrames++;
        if (!eyeContactIssue) this.eyeContactFrames++;
        if (!postureIssue) this.goodPostureFrames++;

        return {
        eyeContactIssue,
        postureIssue,
        postureMessage
        };
    } catch (e) {
        console.warn("MediaPipe analysis error", e);
        return null;
    }
  }

  getSummary() {
    if (this.totalFrames === 0) return "No visual analysis data available.";
    
    const eyeContactPct = Math.round((this.eyeContactFrames / this.totalFrames) * 100);
    const posturePct = Math.round((this.goodPostureFrames / this.totalFrames) * 100);
    
    return `VISUAL ANALYSIS SUMMARY:
    - Eye Contact Maintained: ${eyeContactPct}%
    - Good Posture Maintained: ${posturePct}%`;
  }
}

export const visionService = new VisionService();