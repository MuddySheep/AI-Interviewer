export enum AppMode {
  SETUP = 'SETUP',
  INTERVIEW = 'INTERVIEW',
  REPORT = 'REPORT'
}

export enum InterviewMode {
  PRACTICE = 'Practice',
  SIMULATION = 'Simulation'
}

export type AspectRatio = '9:16' | '16:9' | '4:3' | '1:1';

export interface UserConfig {
  jobDescription: string;
  resume: string;
  durationMinutes: number;
  mode: InterviewMode;
  aspectRatio: AspectRatio;
}

export interface Nudge {
  id: string;
  type: 'posture' | 'eye-contact' | 'audio' | 'general';
  message: string;
  timestamp: number;
}

export interface ReportData {
  overallScore: number;
  dimensions: {
    firstImpression: number;
    communicationClarity: number;
    technicalKnowledge: number;
    behavioralExamples: number;
    eyeContact: number;
    posturePresence: number;
    voiceTone: number;
    fillerWords: number;
    questionHandling: number;
    enthusiasm: number;
    closingStrength: number;
  };
  feedback: {
    wentWell: string[];
    needsWork: string[];
    improvementPlan: string[];
  };
  transcriptSummary: string;
}

export interface TranscriptItem {
  role: string;
  text: string;
  timestamp: number;
}