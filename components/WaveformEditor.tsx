import React, { useState, useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import type { Clip } from '../App';
import { bufferToWave } from '../App';
import { ClipList } from './ClipList';

interface WaveformEditorProps {
  buffer: AudioBuffer;
  originalFileName: string;
  onReset: () => void;
  getAudioContext: () => AudioContext;
}

const ResetIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
        <path d="M3 3v5h5"></path>
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
        <path d="M21 21v-5h-5"></path>
    </svg>
);

export const WaveformEditor: React.FC<WaveformEditorProps> = ({ buffer, originalFileName, onReset, getAudioContext }) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeRegion, setActiveRegion] = useState<any>(null);

  useEffect(() => {
    if (!waveformRef.current || !buffer) return;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgb(200, 200, 200)',
      progressColor: 'rgb(100, 100, 100)',
      barWidth: 3,
      barGap: 2,
      barRadius: 3,
      height: 150,
      audioBuffer: buffer,
    });

    const regions = ws.registerPlugin(RegionsPlugin.create());

    regions.on('region-created', (region) => {
        // Only allow one region at a time
        const allRegions = regions.getRegions();
        if (allRegions.length > 1) {
            allRegions[0].remove();
        }
        setActiveRegion(region);
    });

    wavesurferRef.current = ws;

    return () => {
        ws.destroy();
    };
  }, [buffer]);

  const handlePlaySelection = () => {
    if (activeRegion) {
      activeRegion.play();
    }
  };

  const handleCreateClip = () => {
    if (activeRegion) {
      const clip: Clip = { start: activeRegion.start, end: activeRegion.end };
      setClips((prevClips) => [...prevClips, clip]);
      activeRegion.remove();
      setActiveRegion(null);
    }
  };

  return (
    <div className="w-full">
      <div className="bg-gray-900/70 p-4 rounded-xl mb-6 border border-gray-700">
        <div ref={waveformRef} id="waveform" className="w-full cursor-pointer" />
        <p className="text-center text-sm text-gray-400 mt-2">Click and drag on the waveform to select a region to clip.</p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
        <button 
            onClick={handlePlaySelection}
            disabled={!activeRegion}
            className="w-full sm:w-auto flex-1 px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition-colors disabled:bg-gray-800 disabled:cursor-not-allowed">
            Play Selection
        </button>
        <button 
            onClick={handleCreateClip} 
            disabled={!activeRegion}
            className="w-full sm:w-auto flex-1 px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors disabled:bg-red-800 disabled:cursor-not-allowed">
            Create Clip from Selection
        </button>
         <button
          onClick={onReset}
          className="w-full sm:w-auto flex items-center justify-center px-6 py-3 bg-gray-600/50 text-white rounded-md hover:bg-gray-700"
        >
          <ResetIcon />
          Start Over
        </button>
      </div>

      <ClipList clips={clips} originalFileName={originalFileName} onReset={onReset} getAudioContext={getAudioContext} />
    </div>
  );
};