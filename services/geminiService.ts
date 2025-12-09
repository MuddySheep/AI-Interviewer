import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { REPORT_JSON_SCHEMA, SYSTEM_INSTRUCTION_BASE, MODE_INSTRUCTIONS } from "../constants";
import { UserConfig, ReportData, TranscriptItem } from "../types";

// Helper for PCM Audio
function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export class GeminiService {
  private ai: GoogleGenAI;
  private session: any = null; 
  private config: UserConfig | null = null;
  private transcript: TranscriptItem[] = [];

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  // Generate the Final Report using Gemini Flash 2.5
  async generateReport(transcript: TranscriptItem[], config: UserConfig): Promise<ReportData> {
    try {
      const transcriptText = transcript.map(t => `${t.role.toUpperCase()}: ${t.text}`).join('\n');
      
      const resumeContext = config.resume && config.resume.trim().length > 10 
        ? `User Resume Context: "${config.resume.slice(0, 1000)}..."` 
        : "User Resume Context: N/A (The user did not provide a resume. Do not make up facts about their background.)";

      const prompt = `
        Analyze this interview transcript based on the following Job Description:
        "${config.jobDescription}"

        ${resumeContext}

        Interview Mode: ${config.mode}

        TRANSCRIPT:
        ${transcriptText}

        Provide a structured JSON evaluation.
      `;

      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: REPORT_JSON_SCHEMA as any,
        },
      });

      const jsonText = response.text || "{}";
      return JSON.parse(jsonText) as ReportData;

    } catch (e) {
      console.error("Error generating report:", e);
      throw e;
    }
  }

  // Connect to Live API
  async connect(
    config: UserConfig, 
    onAudioData: (buffer: ArrayBuffer) => void,
    onTranscript: (item: TranscriptItem) => void,
    onError: (err: any) => void
  ) {
    this.config = config;
    this.transcript = [];

    const resumeSection = config.resume && config.resume.trim().length > 10
      ? `CANDIDATE RESUME SUMMARY:\n${config.resume.slice(0, 500)}...`
      : `CANDIDATE RESUME SUMMARY:\n[No resume provided. Ask about their background generally.]`;

    const sysInstruction = `
      ${SYSTEM_INSTRUCTION_BASE}
      ${MODE_INSTRUCTIONS[config.mode]}

      JOB DESCRIPTION:
      ${config.jobDescription}

      ${resumeSection}
    `;

    try {
      // Create a promise wrapper to capture the session for the callback
      let sessionPromise: Promise<any>;

      sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Connected");
            sessionPromise.then(session => {
                // Send "Wake Up" Signal immediately
                this.sendWakeupSignal(session);
            });
          },
          onmessage: (message: LiveServerMessage) => {
            // Handle Audio
            const audioStr = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioStr) {
               const audioData = base64ToUint8Array(audioStr);
               onAudioData(audioData.buffer);
            }

            // Handle Transcription from model turn
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
              const text = message.serverContent.modelTurn.parts[0].text;
              const item: TranscriptItem = { role: 'model', text, timestamp: Date.now() };
              this.transcript.push(item);
              onTranscript(item);
            }
            
            // Handle Output Transcription
            if (message.serverContent?.outputTranscription?.text) {
               const text = message.serverContent.outputTranscription.text;
               const item: TranscriptItem = { role: 'model', text, timestamp: Date.now() };
               this.transcript.push(item);
               onTranscript(item);
            }

            // Handle Input Transcription
            if (message.serverContent?.inputTranscription?.text) {
               const text = message.serverContent.inputTranscription.text;
               const item: TranscriptItem = { role: 'user', text, timestamp: Date.now() };
               this.transcript.push(item);
               onTranscript(item);
            }
          },
          onerror: (e) => {
            console.error("Gemini Live Error", e);
            onError(e);
          },
          onclose: () => {
            console.log("Gemini Live Closed");
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: sysInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } 
          },
          inputAudioTranscription: {}, 
          outputAudioTranscription: {},
        }
      });
      
      this.session = await sessionPromise;
      return this.session;

    } catch (err) {
      console.error("Connection failed", err);
      onError(err);
      return null;
    }
  }

  // Sends a "Chirp" / Sine wave tone to reliably trigger VAD
  async sendWakeupSignal(sessionInstance: any = null) {
      const s = sessionInstance || this.session;
      if (!s) return;

      console.log("Sending wake-up signal...");
      
      // Create a 440Hz Sine Wave (A4) for 0.2 seconds
      // Sine waves cut through noise suppression better than random noise
      const sampleRate = 16000;
      const duration = 0.2; 
      const noise = new Float32Array(sampleRate * duration);
      const frequency = 440.0;
      
      for(let i=0; i<noise.length; i++) {
          // Sine wave generator
          noise[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.1; 
      }
      
      // Send it twice to ensure it catches a frame window
      this.sendAudioChunk(noise, s);
      setTimeout(() => this.sendAudioChunk(noise, s), 200);
  }

  async sendAudioChunk(float32Data: Float32Array, sessionInstance: any = null) {
    const s = sessionInstance || this.session;
    if (!s) return;
    
    // Convert Float32 (-1.0 to 1.0) to 16-bit PCM for Gemini
    const l = float32Data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = float32Data[i] * 32768;
    }
    
    const base64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));

    try {
        s.sendRealtimeInput({
            media: {
                mimeType: 'audio/pcm;rate=16000',
                data: base64
            }
        });
    } catch(e) {
        console.error("Error sending audio chunk", e);
    }
  }

  async sendVideoFrame(base64Data: string) {
    if(!this.session) return;
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");

    try {
        this.session.sendRealtimeInput({
        media: {
            mimeType: 'image/jpeg',
            data: cleanBase64
        }
        });
    } catch(e) {
        console.error("Error sending video frame", e);
    }
  }

  disconnect() {
    if (this.session && typeof this.session.close === 'function') {
        this.session.close();
    }
    this.session = null;
  }
  
  getTranscript() {
    return this.transcript;
  }

  addLocalTranscriptItem(role: string, text: string) {
    this.transcript.push({
      role: role,
      text: text,
      timestamp: Date.now()
    });
  }
}

export const geminiService = new GeminiService();