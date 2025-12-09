import React, { useState } from 'react';
import { UserConfig, InterviewMode, AspectRatio, AppMode } from '../types';

interface SetupScreenProps {
  onStart: (config: UserConfig) => void;
}

const SetupScreen: React.FC<SetupScreenProps> = ({ onStart }) => {
  const [jobDescription, setJobDescription] = useState('');
  const [resume, setResume] = useState('');
  const [duration, setDuration] = useState(15);
  const [mode, setMode] = useState<InterviewMode>(InterviewMode.PRACTICE);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    if (!jobDescription) {
      alert("Please enter a job description.");
      return;
    }
    
    setLoading(true);
    // Simulate a brief setup delay or validation
    setTimeout(() => {
      onStart({
        jobDescription,
        resume,
        durationMinutes: duration,
        mode,
        aspectRatio
      });
      setLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-pastel-bg p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-xl p-8 md:p-12 border border-pastel-blue/30">
        <h1 className="text-4xl font-bold text-pastel-text mb-2 text-center">PastelPrep</h1>
        <p className="text-center text-gray-500 mb-10">AI-Powered Interview Practice & Body Language Coach</p>

        <div className="space-y-8">
          {/* Job Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Job Description *</label>
            <textarea
              className="w-full p-4 rounded-xl border border-gray-200 focus:border-pastel-blue focus:ring-2 focus:ring-pastel-blue/50 outline-none transition h-32 resize-none bg-gray-50"
              placeholder="Paste the job posting here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>

          {/* Resume */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Your Resume / Experience (Optional)</label>
            <textarea
              className="w-full p-4 rounded-xl border border-gray-200 focus:border-pastel-purple focus:ring-2 focus:ring-pastel-purple/50 outline-none transition h-24 resize-none bg-gray-50"
              placeholder="Paste your resume summary or key skills here..."
              value={resume}
              onChange={(e) => setResume(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Mode Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Mode</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode(InterviewMode.PRACTICE)}
                  className={`flex-1 py-3 px-4 rounded-xl border transition ${
                    mode === InterviewMode.PRACTICE 
                      ? 'bg-pastel-green/20 border-pastel-green text-green-800 font-medium' 
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Practice
                  <span className="block text-xs font-normal opacity-70">Friendly, with hints</span>
                </button>
                <button
                  onClick={() => setMode(InterviewMode.SIMULATION)}
                  className={`flex-1 py-3 px-4 rounded-xl border transition ${
                    mode === InterviewMode.SIMULATION 
                      ? 'bg-pastel-pink/20 border-pastel-pink text-red-800 font-medium' 
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Simulation
                  <span className="block text-xs font-normal opacity-70">Strict, realistic</span>
                </button>
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Duration</label>
              <div className="flex gap-2">
                {[15, 20, 30].map(m => (
                  <button
                    key={m}
                    onClick={() => setDuration(m)}
                    className={`flex-1 py-3 rounded-xl border transition ${
                      duration === m 
                        ? 'bg-pastel-blue/20 border-pastel-blue text-blue-800 font-medium' 
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>
          </div>

           {/* Aspect Ratio */}
           <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Video Layout</label>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {(['9:16', '16:9', '4:3', '1:1'] as AspectRatio[]).map(ratio => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`flex-1 min-w-[80px] py-2 rounded-xl border transition ${
                      aspectRatio === ratio
                        ? 'bg-pastel-yellow/30 border-pastel-yellow text-yellow-800 font-medium' 
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>
        </div>

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full mt-10 py-4 bg-gray-900 text-white rounded-xl text-lg font-semibold hover:bg-gray-800 transform active:scale-[0.99] transition shadow-lg disabled:opacity-50"
        >
          {loading ? "Preparing Interview..." : "Start Interview"}
        </button>
      </div>
    </div>
  );
};

export default SetupScreen;
