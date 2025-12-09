import React, { useState } from 'react';
import SetupScreen from './components/SetupScreen';
import InterviewScreen from './components/InterviewScreen';
import ReportScreen from './components/ReportScreen';
import { AppMode, UserConfig, TranscriptItem } from './types';

const App: React.FC = () => {
  const [appMode, setAppMode] = useState<AppMode>(AppMode.SETUP);
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);

  const startInterview = (userConfig: UserConfig) => {
    setConfig(userConfig);
    setAppMode(AppMode.INTERVIEW);
  };

  const finishInterview = (finalTranscript: TranscriptItem[], blob: Blob | null) => {
    setTranscript(finalTranscript);
    setRecordingBlob(blob);
    setAppMode(AppMode.REPORT);
  };

  const restart = () => {
    setConfig(null);
    setTranscript([]);
    setRecordingBlob(null);
    setAppMode(AppMode.SETUP);
  };

  return (
    <div className="font-sans text-gray-900">
      {appMode === AppMode.SETUP && (
        <SetupScreen onStart={startInterview} />
      )}
      
      {appMode === AppMode.INTERVIEW && config && (
        <InterviewScreen 
          config={config} 
          onFinish={finishInterview} 
        />
      )}

      {appMode === AppMode.REPORT && config && (
        <ReportScreen 
          transcript={transcript} 
          recordingBlob={recordingBlob} 
          config={config}
          onRestart={restart}
        />
      )}
    </div>
  );
};

export default App;
