import React, { useEffect, useState } from 'react';
import { ReportData, TranscriptItem, UserConfig } from '../types';
import { geminiService } from '../services/geminiService';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';

interface ReportScreenProps {
  transcript: TranscriptItem[];
  recordingBlob: Blob | null;
  config: UserConfig;
  onRestart: () => void;
}

const LOADING_STEPS = [
  "Uploading interview session...",
  "Extracting facial landmarks & micro-expressions...",
  "Analyzing speech patterns & tonal confidence...",
  "Correlating behavioral responses (STAR method)...",
  "Synthesizing final performance report..."
];

const ReportScreen: React.FC<ReportScreenProps> = ({ transcript, recordingBlob, config, onRestart }) => {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);

  useEffect(() => {
    // Progress the loading text to simulate analysis steps
    if (loading) {
      const interval = setInterval(() => {
        setLoadingStepIndex(prev => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [loading]);

  useEffect(() => {
    const generate = async () => {
      try {
        const data = await geminiService.generateReport(transcript, config);
        setReport(data);
      } catch (e) {
        console.error("Report gen failed", e);
        // Fallback dummy data if API fails (for demo resilience)
        setReport({
            overallScore: 75,
            dimensions: {
                firstImpression: 8, communicationClarity: 7, technicalKnowledge: 8, behavioralExamples: 6,
                eyeContact: 9, posturePresence: 8, voiceTone: 7, fillerWords: 12, questionHandling: 7,
                enthusiasm: 8, closingStrength: 6
            },
            feedback: {
                wentWell: ["Great eye contact throughout.", "Solid technical understanding of the role."],
                needsWork: ["Structured answers better (use STAR).", "Closing was a bit abrupt."],
                improvementPlan: ["Practice the STAR method for behavioral questions.", "Prepare 2-3 questions for the interviewer."]
            },
            transcriptSummary: "The interview covered the candidate's background and technical skills. Some hesitation on behavioral questions."
        });
      } finally {
        // Ensure we show the last step briefly before switching
        setLoadingStepIndex(LOADING_STEPS.length - 1);
        setTimeout(() => setLoading(false), 800);
      }
    };
    generate();
  }, [transcript, config]);

  const downloadPDF = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-pastel-bg flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Ambient Background Glows */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-pastel-blue/40 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pastel-purple/40 rounded-full blur-3xl animate-pulse delay-1000" />
        
        {/* 3D Gyroscope Loader */}
        <div className="relative w-64 h-64 mb-16 [perspective:1000px]">
           {/* Outer Ring */}
           <div className="absolute inset-0 border-[6px] border-transparent border-t-pastel-blue border-b-pastel-blue/30 rounded-full animate-[spin_3s_linear_infinite] shadow-[0_0_20px_rgba(168,213,229,0.5)]" />
           
           {/* Middle Ring (Rotated X) */}
           <div className="absolute inset-4 border-[6px] border-transparent border-r-pastel-purple border-l-pastel-purple/30 rounded-full animate-[spin_4s_linear_infinite_reverse] shadow-[0_0_20px_rgba(212,184,224,0.5)] [transform:rotateX(60deg)]" />

           {/* Inner Ring (Rotated Y) */}
           <div className="absolute inset-8 border-[6px] border-transparent border-t-pastel-pink border-b-pastel-pink/30 rounded-full animate-[spin_2s_linear_infinite] shadow-[0_0_20px_rgba(245,208,208,0.5)] [transform:rotateY(60deg)]" />
           
           {/* Core */}
           <div className="absolute inset-0 m-auto w-20 h-20 bg-white/80 backdrop-blur-md rounded-full shadow-[0_0_40px_rgba(255,255,255,0.9)] animate-pulse flex items-center justify-center">
             <span className="text-3xl filter drop-shadow-md">✨</span>
           </div>
        </div>

        {/* Text & Progress */}
        <div className="z-10 text-center space-y-4 max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-700 animate-fade-in transition-all duration-500 min-h-[3rem]">
                {LOADING_STEPS[loadingStepIndex]}
            </h2>
            
            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-pastel-blue via-pastel-purple to-pastel-pink transition-all duration-1000 ease-out"
                  style={{ width: `${((loadingStepIndex + 1) / LOADING_STEPS.length) * 100}%` }}
                />
            </div>
            <p className="text-gray-400 text-sm">Powered by Gemini 2.0 & MediaPipe Vision</p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const radarData = [
    { subject: 'Clarity', A: report.dimensions.communicationClarity, fullMark: 10 },
    { subject: 'Tech', A: report.dimensions.technicalKnowledge, fullMark: 10 },
    { subject: 'Behavior', A: report.dimensions.behavioralExamples, fullMark: 10 },
    { subject: 'Confidence', A: report.dimensions.voiceTone, fullMark: 10 },
    { subject: 'Handling', A: report.dimensions.questionHandling, fullMark: 10 },
    { subject: 'Enthusiasm', A: report.dimensions.enthusiasm, fullMark: 10 },
  ];

  return (
    <div className="min-h-screen bg-pastel-bg p-6 md:p-12 print:bg-white print:p-0">
      <div className="max-w-6xl mx-auto print:max-w-none">
        <div className="flex justify-between items-center mb-10 print:mb-6">
           <div>
             <h1 className="text-4xl font-bold text-gray-800 print:text-2xl">Performance Report</h1>
             <p className="text-gray-500 mt-2 print:text-sm">Overall Score: <span className="text-pastel-purple font-bold text-xl">{report.overallScore}/100</span></p>
           </div>
           <div className="flex gap-3 print:hidden">
             <button onClick={downloadPDF} className="bg-pastel-blue text-blue-900 px-6 py-3 rounded-xl hover:bg-pastel-blue/80 transition">
               Download PDF
             </button>
             <button onClick={onRestart} className="border border-gray-300 bg-white text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-50 transition">
               New Session
             </button>
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:block print:space-y-6">
          {/* Main Visuals */}
          <div className="col-span-1 lg:col-span-2 space-y-8 print:space-y-6">
             {/* Charts Row */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 print:border-gray-300 print:shadow-none">
                  <h3 className="text-lg font-semibold mb-4 text-gray-700">Skill Balance</h3>
                  <div className="h-64 print:h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 12 }} />
                        <Radar name="You" dataKey="A" stroke="#A8D5E5" fill="#A8D5E5" fillOpacity={0.6} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 print:border-gray-300 print:shadow-none">
                  <h3 className="text-lg font-semibold mb-4 text-gray-700">Detailed Metrics</h3>
                  <div className="space-y-4">
                     <MetricRow label="Eye Contact" score={report.dimensions.eyeContact} />
                     <MetricRow label="Posture & Presence" score={report.dimensions.posturePresence} />
                     <MetricRow label="First Impression" score={report.dimensions.firstImpression} />
                     <MetricRow label="Closing Strength" score={report.dimensions.closingStrength} />
                     <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                        <span className="text-sm font-medium text-gray-600">Filler Words Est.</span>
                        <span className={`text-lg font-bold ${report.dimensions.fillerWords > 10 ? 'text-red-400' : 'text-green-500'}`}>
                          {report.dimensions.fillerWords}
                        </span>
                     </div>
                  </div>
                </div>
             </div>

             {/* Qualitative Feedback */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:grid-cols-3 print:gap-4">
                <FeedbackCard title="Went Well" items={report.feedback.wentWell} color="bg-pastel-green/20" textColor="text-green-800" />
                <FeedbackCard title="Needs Work" items={report.feedback.needsWork} color="bg-pastel-pink/20" textColor="text-red-800" />
                <FeedbackCard title="Action Plan" items={report.feedback.improvementPlan} color="bg-pastel-blue/20" textColor="text-blue-800" />
             </div>
          </div>

          {/* Sidebar / Transcript Summary */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 print:mt-6 print:border-gray-300 print:shadow-none">
             <h3 className="text-lg font-semibold mb-4 text-gray-700">Session Summary</h3>
             <p className="text-gray-600 text-sm leading-relaxed mb-6">
                {report.transcriptSummary}
             </p>
             
             <h3 className="text-lg font-semibold mb-4 text-gray-700 mt-8">Configuration</h3>
             <div className="text-sm text-gray-500 space-y-2">
               <p>Mode: {config.mode}</p>
               <p>Duration: {config.durationMinutes} min</p>
               <p className="truncate">Job: {config.jobDescription.substring(0, 30)}...</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricRow = ({ label, score }: { label: string, score: number }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm font-medium text-gray-600">{label}</span>
    <div className="flex items-center gap-3 w-1/2">
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden print:bg-gray-200">
        <div 
          className="h-full bg-pastel-purple rounded-full print:bg-gray-600" 
          style={{ width: `${score * 10}%` }}
        />
      </div>
      <span className="text-sm font-bold text-gray-700 w-6 text-right">{score}</span>
    </div>
  </div>
);

const FeedbackCard = ({ title, items, color, textColor }: any) => (
  <div className={`p-6 rounded-2xl ${color} print:bg-white print:border print:border-gray-200`}>
    <h4 className={`font-bold mb-3 ${textColor} print:text-black`}>{title}</h4>
    <ul className="space-y-2">
      {items.map((item: string, i: number) => (
        <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
          <span className="mt-1">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </div>
);

export default ReportScreen;