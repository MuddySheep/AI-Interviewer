import React, { useEffect, useRef, useState } from 'react';
import { UserConfig, Nudge, TranscriptItem, InterviewMode } from '../types';
import { geminiService } from '../services/geminiService';
import { visionService } from '../services/visionService';
import { NUDGE_COOLDOWN, NUDGE_DISPLAY_TIME } from '../constants';

interface InterviewScreenProps {
  config: UserConfig;
  onFinish: (transcript: TranscriptItem[], recordingBlob: Blob | null) => void;
}

const InterviewScreen: React.FC<InterviewScreenProps> = ({ config, onFinish }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [timeLeft, setTimeLeft] = useState(config.durationMinutes * 60);
  const [isRecording, setIsRecording] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSignaling, setIsSignaling] = useState(false);
  const [showEyeWarning, setShowEyeWarning] = useState(false);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  
  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  
  // Speech Analysis Refs
  const speechRateDataRef = useRef<{
    peaks: number;
    startTime: number;
    lastPeakTime: number;
  }>({ peaks: 0, startTime: 0, lastPeakTime: 0 });

  // Recorder Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // State for logic
  const lastNudgeTimeRef = useRef<Record<string, number>>({});
  const animationFrameRef = useRef<number>(0);
  const transcriptRef = useRef<TranscriptItem[]>([]);
  const lastAnalysisTimeRef = useRef<number>(0);

  // Helper to add nudge
  const addNudge = (type: Nudge['type'], message: string) => {
    const now = Date.now();
    const lastTime = lastNudgeTimeRef.current[type] || 0;
    
    // Check global cooldown (max 1 nudge at a time) and specific type cooldown
    if (nudges.length > 0) return;
    if (now - lastTime < NUDGE_COOLDOWN) return;

    const newNudge: Nudge = { id: Math.random().toString(), type, message, timestamp: now };
    setNudges([newNudge]);
    lastNudgeTimeRef.current[type] = now;

    setTimeout(() => {
      setNudges(prev => prev.filter(n => n.id !== newNudge.id));
    }, NUDGE_DISPLAY_TIME);
  };

  // Decode raw PCM audio data manually
  const decodePCMData = (buffer: ArrayBuffer, ctx: AudioContext) => {
      const pcmData = new Int16Array(buffer);
      const float32Data = new Float32Array(pcmData.length);
      
      for (let i = 0; i < pcmData.length; i++) {
          float32Data[i] = pcmData[i] / 32768.0;
      }

      const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);
      
      return audioBuffer;
  };

  // Simple Peak Detection for Speech Rate (Syllable estimation proxy)
  const analyzeSpeechRate = (inputData: Float32Array) => {
    const now = Date.now();
    const data = speechRateDataRef.current;
    
    // Reset window every 3 seconds
    if (now - data.startTime > 3000) {
      // Calculate rate (peaks per second)
      const durationSec = (now - data.startTime) / 1000;
      const rate = data.peaks / durationSec;
      
      // Only analyze if we had enough volume to count as speaking
      if (data.peaks > 2 && !aiSpeaking) {
        if (rate > 4.5) {
          addNudge('audio', 'Speaking too fast. Breathe.');
        } else if (rate < 1.5) {
          addNudge('audio', 'Sounding uncertain. Project confidence.');
        }
      }

      // Reset
      data.peaks = 0;
      data.startTime = now;
    }

    // Count Peaks in this buffer
    // Threshold based heuristic
    const threshold = 0.15;
    const minPeakDist = 150; // ms
    
    // Simple envelope follower or threshold crossing
    for (let i = 1; i < inputData.length; i++) {
       if (inputData[i] > threshold && inputData[i-1] <= threshold) {
          // Rising edge
          if (now - data.lastPeakTime > minPeakDist) {
             data.peaks++;
             data.lastPeakTime = now;
          }
       }
    }
  };

  // Preview Camera Effect
  useEffect(() => {
    let localStream: MediaStream | null = null;
    
    if (!hasStarted) {
      const initPreview = async () => {
        try {
          // Request video only for preview to avoid audio feedback/permissions issues initially
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          localStream = stream;
          setPreviewStream(stream);
          if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = stream;
          }
        } catch (e) {
          console.warn("Preview camera init failed", e);
        }
      };
      initPreview();
    }

    return () => {
      // Cleanup preview tracks when starting session or unmounting
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      setPreviewStream(null);
    };
  }, [hasStarted]);

  const startSession = async () => {
    // Stop preview stream if active to release camera
    if (previewStream) {
        previewStream.getTracks().forEach(t => t.stop());
        setPreviewStream(null);
    }

    setHasStarted(true);
    setErrorMsg(null);
    speechRateDataRef.current.startTime = Date.now();
    
    // Reset Vision Stats for new session
    visionService.reset();

    try {
        const [_, stream] = await Promise.all([
             visionService.initialize().catch(e => console.error("Vision init failed", e)),
             navigator.mediaDevices.getUserMedia({ 
                video: { width: 1280, height: 720 }, 
                audio: true 
             })
        ]);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Setup Audio Context for Input
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const source = audioContextRef.current.createMediaStreamSource(stream);
        audioSourceRef.current = source;

        // ScriptProcessor for analysis
        const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          geminiService.sendAudioChunk(inputData);
          
          // Volume / Activity Check
          let sum = 0;
          for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
          const rms = Math.sqrt(sum / inputData.length);
          const isActive = rms > 0.02;
          setMicActive(isActive);

          // Speech Rate Analysis
          if (isActive) {
            analyzeSpeechRate(inputData);
          }
        };

        source.connect(processor);
        processor.connect(audioContextRef.current.destination);

        // Setup Output Audio
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        outputNodeRef.current = outputAudioContextRef.current.createGain();
        outputNodeRef.current.connect(outputAudioContextRef.current.destination);

        if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
        if (outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume();

        // Setup Gemini
        await geminiService.connect(
          config,
          async (audioBufferRaw) => {
             if (!outputAudioContextRef.current || !outputNodeRef.current) return;
             
             if (outputAudioContextRef.current.state === 'suspended') {
                await outputAudioContextRef.current.resume();
             }
             
             setAiSpeaking(true);
             setTimeout(() => setAiSpeaking(false), 200);

             nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
             
             try {
                 const buffer = decodePCMData(audioBufferRaw, outputAudioContextRef.current);
                 const source = outputAudioContextRef.current.createBufferSource();
                 source.buffer = buffer;
                 source.connect(outputNodeRef.current);
                 source.start(nextStartTimeRef.current);
                 nextStartTimeRef.current += buffer.duration;
             } catch (e) {
                 console.error("Audio decode error", e);
             }
          },
          (item) => {
            transcriptRef.current.push(item);
          },
          (err) => {
            console.error(err);
            setErrorMsg("Connection error: " + (err.message || "Unknown error"));
          }
        );
        
        setIsConnected(true);

        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };
        mediaRecorder.start();
        setIsRecording(true);

        const loop = () => {
          if (!hasStarted) return;
          const now = performance.now();
          if (now - lastAnalysisTimeRef.current > 100) {
              if (videoRef.current && videoRef.current.readyState === 4 && !videoRef.current.paused) {
                 const ts = Math.max(1, now);
                 const result = visionService.analyze(videoRef.current, ts);
                 lastAnalysisTimeRef.current = now;
                 
                 if (result) {
                    // Update Eye Contact Warning State (for visual border)
                    setShowEyeWarning(result.eyeContactIssue);
                    
                    if (result.eyeContactIssue) addNudge('eye-contact', "Maintain eye contact.");
                    if (result.postureIssue) addNudge('posture', result.postureMessage || "Check your posture.");
                 } else {
                    setShowEyeWarning(false);
                 }
                 
                 if (Math.random() < 0.02) { 
                   const canvas = document.createElement('canvas');
                   canvas.width = videoRef.current.videoWidth * 0.4;
                   canvas.height = videoRef.current.videoHeight * 0.4;
                   const ctx = canvas.getContext('2d');
                   if (ctx) {
                     ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                     const base64 = canvas.toDataURL('image/jpeg', 0.5);
                     geminiService.sendVideoFrame(base64);
                   }
                 }
              }
          }
          animationFrameRef.current = requestAnimationFrame(loop);
        };
        loop();

      } catch (err) {
        console.error("Initialization error", err);
        setErrorMsg("Could not access camera/microphone. Please check permissions.");
        setHasStarted(false);
      }
  };

  const handleManualStart = async () => {
      setIsSignaling(true);
      await geminiService.sendWakeupSignal();
      setTimeout(() => setIsSignaling(false), 1000);
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) audioContextRef.current.close();
      if (outputAudioContextRef.current) outputAudioContextRef.current.close();
      geminiService.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isConnected) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleEndSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isConnected]);

  const handleEndSession = () => {
    // Inject Vision/Audio Summary into transcript for report generation
    geminiService.addLocalTranscriptItem("SYSTEM_NOTE", visionService.getSummary());

    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setTimeout(() => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/mp4' });
        onFinish(geminiService.getTranscript(), blob);
      }, 500);
    } else {
        onFinish(geminiService.getTranscript(), null);
    }
  };

  const getAspectRatioClass = () => {
    switch(config.aspectRatio) {
      case '9:16': return 'aspect-[9/16] h-[85vh]';
      case '16:9': return 'aspect-video w-full max-w-5xl';
      case '4:3': return 'aspect-[4/3] h-[80vh]';
      case '1:1': return 'aspect-square h-[80vh]';
      default: return 'aspect-video w-full';
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (errorMsg) {
      return (
          <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-white text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold mb-2">Setup Error</h2>
              <p className="text-gray-400 mb-6">{errorMsg}</p>
              <button onClick={() => window.location.reload()} className="px-6 py-2 bg-blue-600 rounded-lg">Try Again</button>
          </div>
      );
  }

  if (!hasStarted) {
    return (
        <div className="min-h-screen bg-pastel-bg flex flex-col items-center justify-center p-6 text-center">
            <h2 className="text-3xl font-bold text-pastel-text mb-4">Ready for your Interview?</h2>
            <p className="text-gray-600 mb-8 max-w-md">
                We'll need access to your camera and microphone. 
                Find a quiet place and clear your throat.
            </p>
            <div className={`relative bg-black rounded-xl overflow-hidden shadow-xl mb-8 ${config.aspectRatio === '9:16' ? 'w-48 h-80' : 'w-96 h-56'} flex items-center justify-center`}>
                 <video 
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover transform scale-x-[-1] ${previewStream ? 'opacity-100' : 'opacity-0'}`}
                 />
                 {!previewStream && (
                   <span className="absolute text-white/50 text-sm">Camera Preview loading...</span>
                 )}
            </div>
            <button 
                onClick={startSession}
                className="bg-gray-900 text-white px-8 py-4 rounded-xl text-xl font-semibold hover:bg-gray-800 shadow-lg transform transition active:scale-95"
            >
                Start Interview
            </button>
        </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gray-900 flex flex-col items-center justify-center overflow-hidden p-4">
      {/* Header / Timer */}
      <div className="absolute top-4 left-0 right-0 z-20 flex justify-between px-8 items-start">
        <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full text-white font-mono border border-white/10 flex items-center gap-2">
          {formatTime(timeLeft)}
          {!isConnected && <span className="text-xs text-yellow-300 animate-pulse">Connecting...</span>}
        </div>
        <div className="flex gap-2">
            {isConnected && (
                <button 
                    onClick={handleManualStart}
                    disabled={isSignaling}
                    className={`${isSignaling ? 'bg-green-500 text-white' : 'bg-pastel-blue/80 text-blue-900 hover:bg-pastel-blue'} px-4 py-2 rounded-full font-medium backdrop-blur-md transition text-sm flex items-center gap-2`}
                >
                    {isSignaling ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-white opacity-75"></span>
                          Signaling...
                        </>
                    ) : (
                        "Start / POKE AI"
                    )}
                </button>
            )}
            <button 
            onClick={handleEndSession}
            className="bg-red-500/80 hover:bg-red-600 text-white px-6 py-2 rounded-full font-medium backdrop-blur-md transition"
            >
            End Interview
            </button>
        </div>
      </div>

      {/* Main Video Container */}
      <div className={`relative bg-black rounded-3xl overflow-hidden shadow-2xl transition-all duration-500 ${getAspectRatioClass()} ${showEyeWarning ? 'border-4 border-red-500/70 shadow-[0_0_50px_rgba(239,68,68,0.5)]' : 'border border-gray-700'}`}>
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover transform scale-x-[-1]" 
        />
        
        {/* Loading Overlay */}
        {!isConnected && (
           <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white z-10">
             <div className="animate-spin text-4xl mb-3">⏳</div>
             <p className="font-light">Connecting to Interviewer...</p>
           </div>
        )}
        
        {/* Audio Visualizers */}
        {isConnected && (
          <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10">
                <span className="text-white/80 text-xs font-medium">You</span>
                <div className={`w-2 h-2 rounded-full transition-colors duration-100 ${micActive ? 'bg-green-400' : 'bg-gray-500'}`} />
              </div>
              <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10">
                <span className="text-white/80 text-xs font-medium">Interviewer</span>
                <div className={`w-2 h-2 rounded-full transition-colors duration-100 ${aiSpeaking ? 'bg-pastel-blue shadow-[0_0_10px_#A8D5E5]' : 'bg-gray-500'}`} />
              </div>
          </div>
        )}

        {/* Nudges Overlay */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-end pb-24 px-10">
           {nudges.map(nudge => (
             <div 
               key={nudge.id}
               className="animate-fade-in-up bg-white/90 backdrop-blur-md text-gray-800 px-6 py-3 rounded-2xl shadow-lg border border-pastel-purple/50 flex items-center gap-3 mb-2"
             >
               <span className="text-2xl">
                 {nudge.type === 'eye-contact' ? '👁️' : 
                  nudge.type === 'posture' ? '🧘' : 
                  nudge.type === 'audio' ? '🔊' : '💡'}
               </span>
               <span className="font-medium">{nudge.message}</span>
             </div>
           ))}
        </div>
      </div>

      {config.mode === InterviewMode.PRACTICE && isConnected && (
        <div className="absolute bottom-8 text-white/50 text-sm">
          Practice Mode
        </div>
      )}
    </div>
  );
};

export default InterviewScreen;