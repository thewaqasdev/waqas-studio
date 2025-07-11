import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Uploader } from './components/Uploader';
import { Loader } from './components/Loader';
import { Merger } from './components/Merger';
import { Converter } from './components/Converter';
import { WaveformEditor } from './components/WaveformEditor';
import { AudioToolkit } from './components/AudioToolkit';

enum AppState {
  IDLE,
  PROCESSING,
  EDITING,
}

export interface Clip {
  url: string;
  buffer: AudioBuffer;
}

// Helper to convert AudioBuffer to a WAV file Blob
export const bufferToWave = (abuffer: AudioBuffer, len: number): Blob => {
  const numOfChan = abuffer.numberOfChannels;
  const length = len * numOfChan * 2;
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);
  const channels = [];
  let offset = 0;
  let pos = 0;

  const setUint16 = (data: number) => {
    view.setUint16(pos, data, true);
    pos += 2;
  };

  const setUint32 = (data: number) => {
    view.setUint32(pos, data, true);
    pos += 4;
  };

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length + 36); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length of format data
  setUint16(1); // PCM - integer samples
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16); // 16-bit samples

  setUint32(0x61746164); // "data" - chunk
  setUint32(length);

  // write the PCM samples
  for (let i = 0; i < abuffer.numberOfChannels; i++) {
    channels.push(abuffer.getChannelData(i));
  }
  
  // Interleave samples
  while (pos < 44 + length) {
    for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset] || 0));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        view.setInt16(pos, sample, true);
        pos += 2;
    }
    offset++;
  }

  return new Blob([view], { type: 'audio/wav' });
};


const App: React.FC = () => {
  const [mode, setMode] = useState<'clipper' | 'merger' | 'converter' | 'toolkit'>('clipper');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [sourceBuffer, setSourceBuffer] = useState<AudioBuffer | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>('');
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = (): AudioContext => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  };
  
  const resetApp = useCallback(() => {
    setAppState(AppState.IDLE);
    setSourceBuffer(null);
    setError(null);
    setOriginalFileName('');
  },[]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      setError('Please upload a valid audio file.');
      return;
    }

    setAppState(AppState.PROCESSING);
    setError(null);
    setOriginalFileName(file.name.replace(/\.[^/.]+$/, ""));

    try {
      const audioContext = getAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      setSourceBuffer(audioBuffer);
      setAppState(AppState.EDITING);

    } catch (e) {
      console.error('Error processing audio:', e);
      setError('Could not process the audio file. It may be corrupted or in an unsupported format.');
      setAppState(AppState.IDLE);
    }
  }, []);
  
  const { title, description } = useMemo(() => {
    switch(mode) {
        case 'clipper':
            return { title: 'Clipper', description: 'Visually select and cut clips from your audio.' };
        case 'merger':
            return { title: 'Merger', description: 'Join multiple clips into one file.' };
        case 'converter':
            return { title: 'Converter', description: 'Convert audio files between different formats.' };
        case 'toolkit':
            return { title: 'Toolkit', description: 'Apply effects like speed change, normalization, and silence removal.' };
        default:
            return { title: '', description: '' };
    }
  }, [mode]);

  const renderContent = () => {
    switch (mode) {
      case 'merger':
        return <Merger getAudioContext={getAudioContext} />;
      case 'converter':
        return <Converter getAudioContext={getAudioContext} />;
      case 'toolkit':
        return <AudioToolkit getAudioContext={getAudioContext} />;
      case 'clipper':
      default:
        switch (appState) {
          case AppState.PROCESSING:
            return <Loader />;
          case AppState.EDITING:
            if (sourceBuffer) {
              return <WaveformEditor buffer={sourceBuffer} originalFileName={originalFileName} onReset={resetApp} getAudioContext={getAudioContext} />;
            }
             // Fallback if buffer is null for some reason
            return <Uploader onFileSelect={handleFile} error={"An unexpected error occurred. Please try again."} />;
          case AppState.IDLE:
          default:
            return <Uploader onFileSelect={handleFile} error={error} />;
        }
    }
  };

  const commonButtonClass = "px-6 py-2 rounded-lg font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 text-sm md:text-base";
  const activeButtonClass = "bg-red-600 text-white shadow-lg";
  const inactiveButtonClass = "bg-gray-700/50 text-gray-300 hover:bg-gray-700";

  return (
    <div
      className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4 transition-all duration-500 bg-cover bg-center bg-fixed"
      style={{ backgroundImage: "url('https://images.unsplash.com/photo-1635805737707-575885ab0820?q=80&w=1887&auto=format&fit=crop')" }}
    >
      <div className="absolute inset-0 bg-black/75 z-0"></div>
      <div className="relative z-10 w-full max-w-5xl mx-auto">
        <header className="text-center mb-6">
           <div className="flex justify-center bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-xl p-1.5 max-w-lg mx-auto mb-8">
            <button onClick={() => setMode('clipper')} className={`${commonButtonClass} ${mode === 'clipper' ? activeButtonClass : inactiveButtonClass}`}>
              Clipper
            </button>
            <button onClick={() => setMode('merger')} className={`${commonButtonClass} ${mode === 'merger' ? activeButtonClass : inactiveButtonClass}`}>
              Merger
            </button>
            <button onClick={() => setMode('converter')} className={`${commonButtonClass} ${mode === 'converter' ? activeButtonClass : inactiveButtonClass}`}>
              Converter
            </button>
            <button onClick={() => setMode('toolkit')} className={`${commonButtonClass} ${mode === 'toolkit' ? activeButtonClass : inactiveButtonClass}`}>
              Toolkit
            </button>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">Audio <span className="text-red-600">{title}</span></h1>
          <p className="text-gray-400 mt-2 text-lg">{description}</p>
        </header>
        <main className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-6 md:p-8 border border-gray-700 min-h-[300px]">
          {renderContent()}
        </main>
        <footer className="text-center mt-8 text-gray-500">
            <p>Powered by Web Audio API & Google Gemini</p>
        </footer>
      </div>
    </div>
  );
};

export default App;