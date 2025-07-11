import React, { useState, useEffect, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { GoogleGenAI } from '@google/genai';
import type { Clip } from '../App';
import { bufferToWave } from '../App';

interface ClipListProps {
  clips: Clip[];
  originalFileName: string;
  onReset: () => void;
  getAudioContext: () => AudioContext;
}

const DownloadIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
);

const ResetIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
        <path d="M3 3v5h5"></path>
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
        <path d="M21 21v-5h-5"></path>
    </svg>
);

const ZipIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
        <path d="M21 11.5v-1a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v1"></path><path d="M15 9.5l-3-3-3 3"></path><path d="M12 6.5v9"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    </svg>
);

const MergeIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
       <path d="M18 16.978V7.5a2.5 2.5 0 0 0-2.5-2.5h-5A2.5 2.5 0 0 0 8 7.5v9.478"/><path d="M12.5 14.5L16 18l3.5-3.5"/><path d="M6 7.022V16.5a2.5 2.5 0 0 0 2.5 2.5h5A2.5 2.5 0 0 0 16 16.5V7.022"/><path d="M11.5 9.5L8 6l-3.5 3.5"/>
    </svg>
);

const TranscriptIcon: React.FC = () => (
     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
        <path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18.1H3"/>
    </svg>
);

const CopyIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
    </svg>
);

const CheckIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M20 6 9 17l-5-5"></path>
    </svg>
);

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string)?.split(',')[1];
            if (base64String) {
                resolve(base64String);
            } else {
                reject(new Error("Failed to convert blob to base64."));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

export const ClipList: React.FC<ClipListProps> = ({ clips, originalFileName, onReset, getAudioContext }) => {
  const [startRange, setStartRange] = useState(1);
  const [endRange, setEndRange] = useState(clips.length);
  const [step, setStep] = useState(2);
  const [isZipping, setIsZipping] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean[]>(new Array(clips.length).fill(false));
  const [isBatchTranscribing, setIsBatchTranscribing] = useState(false);
  const [transcripts, setTranscripts] = useState<(string | null)[]>(new Array(clips.length).fill(null));
  const [error, setError] = useState<string | null>(null);
  const [selectedClips, setSelectedClips] = useState<number[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const aiRef = useRef<GoogleGenAI | null>(null);

  useEffect(() => {
    if (process.env.API_KEY) {
        aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
  }, []);

  useEffect(() => {
    setEndRange(clips.length);
  }, [clips]);

  const allClipsSelected = selectedClips.length === clips.length && clips.length > 0;

  const toggleClipSelection = useCallback((index: number) => {
    setSelectedClips(prevSelected => {
      if (prevSelected.includes(index)) {
        return prevSelected.filter(item => item !== index);
      } else {
        return [...prevSelected, index];
      }
    });
  }, []);

  const toggleSelectAll = () => {
    if (allClipsSelected) {
      setSelectedClips([]);
    } else {
      const allIndices = clips.map((_, i) => i);
      setSelectedClips(allIndices);
    }
  };
  
  const displayError = (message: string) => {
      setError(message);
      setTimeout(() => setError(null), 5000);
  };

  const createZipAndDownload = async (clipsToZip: { clip: Clip; index: number }[], zipFileName: string) => {
    if (clipsToZip.length === 0) {
      displayError("No clips were found for the selected criteria.");
      return;
    }
    setIsZipping(true);
    setError(null);
    const zip = new JSZip();
    try {
      const promises = clipsToZip.map(async (item) => {
        const blob = bufferToWave(item.clip.buffer, item.clip.buffer.length);
        zip.file(`${originalFileName}-clip-${item.index + 1}.wav`, blob);
      });
      await Promise.all(promises);
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${zipFileName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("Error creating ZIP file:", err);
      displayError("Failed to create ZIP file. Please try again.");
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadSelected = () => {
    const clipsToDownload = selectedClips.map(index => ({ clip: clips[index], index }));
    if (clipsToDownload.length === 0) {
        displayError("Please select at least one clip to download.");
        return;
    }
    createZipAndDownload(clipsToDownload, `${originalFileName}_selected_clips`);
  };

  const handleMergeSelected = async () => {
    if (selectedClips.length < 2) {
        displayError("Please select at least two clips to merge.");
        return;
    }
    setIsMerging(true);
    setError(null);
    try {
        const audioContext = getAudioContext();
        // Use selectedClips directly to respect the order of selection.
        const buffersToMerge = selectedClips.map(index => clips[index].buffer);

        const totalLength = buffersToMerge.reduce((acc, buffer) => acc + buffer.length, 0);
        const firstBuffer = buffersToMerge[0];
        const newBuffer = audioContext.createBuffer(firstBuffer.numberOfChannels, totalLength, firstBuffer.sampleRate);
        
        let offset = 0;
        for (const buffer of buffersToMerge) {
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                newBuffer.getChannelData(channel).set(buffer.getChannelData(channel), offset);
            }
            offset += buffer.length;
        }

        const wavBlob = bufferToWave(newBuffer, newBuffer.length);
        const url = URL.createObjectURL(wavBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${originalFileName}_merged_clip.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch(err) {
        console.error("Error merging clips:", err);
        displayError("Failed to merge clips. Please try again.");
    } finally {
        setIsMerging(false);
    }
  };
  
   const performTranscription = async (clip: Clip): Promise<string> => {
    if (!aiRef.current) {
        throw new Error("AI Client not initialized.");
    }
    const blob = bufferToWave(clip.buffer, clip.buffer.length);
    const base64String = await blobToBase64(blob);

    const response = await aiRef.current.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
              { inlineData: { mimeType: 'audio/wav', data: base64String } },
              { text: "Transcribe this audio clip accurately." }
            ]
        }
    });
    return response.text;
  };

  const handleTranscribe = async (index: number) => {
    setIsTranscribing(prev => {
        const newState = [...prev];
        newState[index] = true;
        return newState;
    });
    setError(null);
    try {
        const result = await performTranscription(clips[index]);
        setTranscripts(prev => {
            const newState = [...prev];
            newState[index] = result;
            return newState;
        });
    } catch (err) {
        console.error(`Error transcribing clip ${index + 1}:`, err);
        displayError(`Failed to transcribe clip ${index + 1}.`);
    } finally {
        setIsTranscribing(prev => {
            const newState = [...prev];
            newState[index] = false;
            return newState;
        });
    }
  };
  
   const handleTranscribeAll = async () => {
      if (!aiRef.current) {
          displayError("AI Client not initialized. Make sure API_KEY is set.");
          return;
      }
      setIsBatchTranscribing(true);
      setIsTranscribing(new Array(clips.length).fill(true));
      setError(null);
      try {
          const transcriptionPromises = clips.map(clip => performTranscription(clip).catch(e => e));
          const results = await Promise.all(transcriptionPromises);
          
          const newTranscripts = [...transcripts];
          let hadError = false;
          results.forEach((result, index) => {
              if (typeof result === 'string') {
                  newTranscripts[index] = result;
              } else {
                  console.error(`Error transcribing clip ${index + 1}:`, result);
                  newTranscripts[index] = "Transcription failed.";
                  hadError = true;
              }
          });
          setTranscripts(newTranscripts);
          if (hadError) {
              displayError("Some clips failed to transcribe. Please try again.");
          }
      } catch (err) {
          console.error("Error during batch transcription:", err);
          displayError("A critical error occurred during batch transcription.");
      } finally {
          setIsBatchTranscribing(false);
          setIsTranscribing(new Array(clips.length).fill(false));
      }
  };
  
  const handleCopy = (textToCopy: string, index: number) => {
      navigator.clipboard.writeText(textToCopy).then(() => {
          setCopiedIndex(index);
          setTimeout(() => setCopiedIndex(null), 2000);
      }, (err) => {
          console.error('Could not copy text: ', err);
          displayError("Failed to copy text.");
      });
  };

  const commonButtonClass = "flex items-center justify-center w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-red-500 transition-colors duration-200 disabled:bg-red-800 disabled:text-gray-400 disabled:cursor-not-allowed";
  
  return (
    <div className="w-full">
      <h2 className="text-2xl font-semibold text-center mb-6">Your Audio Clips ({clips.length} total)</h2>
      
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl shadow-lg p-6 mb-8 border border-gray-700">
        <h3 className="text-xl font-bold text-center mb-6 text-white">Batch Operations</h3>
        {error && (
             <div className="mb-4 w-full bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-center">
                <p>{error}</p>
            </div>
        )}
        
        <div className="border-b border-gray-700 pb-6 mb-6">
            <legend className="text-lg font-semibold text-center text-red-500 w-full mb-4">Download & Merge</legend>
            <div className="flex flex-col items-center justify-center gap-4">
                <div className="flex items-center space-x-3 cursor-pointer select-none" onClick={toggleSelectAll}>
                    <input id="select-all" type="checkbox" className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-red-600 focus:ring-red-500 cursor-pointer" checked={allClipsSelected} readOnly/>
                    <label htmlFor="select-all" className="font-medium text-gray-300 cursor-pointer">
                        Select All <span className="text-gray-400">({selectedClips.length} / {clips.length} selected)</span>
                    </label>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 mt-4 w-full sm:w-auto">
                    <button onClick={handleDownloadSelected} disabled={isZipping || isMerging || isBatchTranscribing || selectedClips.length === 0} className={`${commonButtonClass} sm:w-auto`}>
                        {isZipping ? 'Zipping...' : <><ZipIcon /> Download Selected ({selectedClips.length})</>}
                    </button>
                    <button onClick={handleMergeSelected} disabled={isMerging || isZipping || isBatchTranscribing || selectedClips.length < 2} className={`${commonButtonClass} sm:w-auto`}>
                        {isMerging ? 'Merging...' : <><MergeIcon /> Merge Selected ({selectedClips.length})</>}
                    </button>
                </div>
            </div>
        </div>

        <div>
            <legend className="text-lg font-semibold text-center text-sky-500 w-full mb-4">AI Tools</legend>
            <div className="flex justify-center">
                <button onClick={handleTranscribeAll} disabled={isBatchTranscribing || isMerging || isZipping || !aiRef.current} className="flex items-center justify-center sm:w-auto px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-sky-500 transition-colors duration-200 disabled:bg-sky-800 disabled:text-gray-400 disabled:cursor-not-allowed">
                     {isBatchTranscribing ? 'Transcribing All...' : <><TranscriptIcon /> Transcribe All ({clips.length})</>}
                </button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {clips.map(({ url }, index) => {
          const isSelected = selectedClips.includes(index);
          const transcript = transcripts[index];
          const isProcessing = isTranscribing[index];
          return (
            <div 
              key={index}
              onClick={() => toggleClipSelection(index)}
              className={`relative bg-gray-800 rounded-lg p-4 flex flex-col space-y-3 shadow-lg border transition-all duration-200 cursor-pointer ${isSelected ? 'border-red-500 ring-2 ring-red-500/50' : 'border-gray-700 hover:border-red-600'}`}
            >
              <div className="absolute top-3 right-3 z-10">
                <input
                    type="checkbox" checked={isSelected}
                    onChange={(e) => { e.stopPropagation(); toggleClipSelection(index); }}
                    className="h-5 w-5 rounded bg-gray-900/50 border-gray-500 text-red-600 focus:ring-red-500 cursor-pointer"
                    aria-label={`Select clip ${index + 1}`}
                />
              </div>
              <h3 className="text-lg font-bold text-white pr-8">Clip {index + 1}</h3>
              <audio controls src={url} className="w-full h-12" onClick={e => e.stopPropagation()}></audio>
              
              {transcript && (
                  <div className="relative bg-gray-900/50 p-3 rounded-md max-h-28 overflow-y-auto border border-gray-700">
                      <button 
                          onClick={(e) => { e.stopPropagation(); handleCopy(transcript, index); }} 
                          className="absolute top-1.5 right-1.5 p-1 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white transition-colors z-20"
                          aria-label="Copy transcript"
                      >
                          {copiedIndex === index ? <CheckIcon className="text-green-500" /> : <CopyIcon />}
                      </button>
                      <p className="text-gray-300 text-sm leading-relaxed pr-6">{transcript}</p>
                  </div>
              )}
              
              {isProcessing && !transcript && (
                  <div className="flex items-center justify-center p-2">
                      <div className="w-6 h-6 border-2 border-dashed rounded-full animate-spin border-sky-500"></div>
                      <span className="ml-3 text-gray-400">Transcribing...</span>
                  </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <a href={url} download={`${originalFileName}-clip-${index + 1}.wav`} onClick={e => e.stopPropagation()}
                  className="flex-1 flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-red-500 transition-colors duration-200">
                  <DownloadIcon/> Download
                </a>
                <button onClick={(e) => { e.stopPropagation(); handleTranscribe(index); }} disabled={isProcessing || isBatchTranscribing || !aiRef.current}
                 className="flex-1 flex items-center justify-center px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors duration-200 disabled:bg-sky-800 disabled:text-gray-400 disabled:cursor-not-allowed">
                  <TranscriptIcon/> {transcript ? 'Re-Transcribe' : 'Transcribe'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="text-center">
        <button
          onClick={onReset}
          className="flex items-center justify-center mx-auto px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-gray-500 transition-colors duration-200"
        >
          <ResetIcon/>
          Process Another File
        </button>
      </div>
    </div>
  );
};