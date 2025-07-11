import React, { useState, useCallback, useRef } from 'react';
import { bufferToWave } from '../App';

interface MergerProps {
  getAudioContext: () => AudioContext;
}

interface FileItem {
  id: string;
  file: File;
}

const UploadIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-gray-500 group-hover:text-red-600 transition-colors">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
    </svg>
);

const DragHandleIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle>
        <circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle>
    </svg>
);

export const Merger: React.FC<MergerProps> = ({ getAudioContext }) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const displayError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles = Array.from(selectedFiles)
      .filter(file => file.type.startsWith('audio/'))
      .map(file => ({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        file,
      }));
    
    if (newFiles.length !== selectedFiles.length) {
        displayError("Some files were not valid audio files and were ignored.");
    }

    setFiles(prevFiles => [...prevFiles, ...newFiles]);
  }, []);
  
  const handleDragStart = (e: React.DragEvent<HTMLLIElement>, position: number) => {
    dragItem.current = position;
  };

  const handleDragEnter = (e: React.DragEvent<HTMLLIElement>, position: number) => {
    dragOverItem.current = position;
  };
  
  const handleDrop = (e: React.DragEvent<HTMLUListElement>) => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const newFiles = [...files];
    const dragItemContent = newFiles[dragItem.current];
    newFiles.splice(dragItem.current, 1);
    newFiles.splice(dragOverItem.current, 0, dragItemContent);
    dragItem.current = null;
    dragOverItem.current = null;
    setFiles(newFiles);
  };
  
  const handleMerge = async () => {
    if (files.length < 2) {
      displayError("Please select at least two clips to merge.");
      return;
    }
    setIsMerging(true);
    setError(null);
    try {
      const audioContext = getAudioContext();
      const buffers: AudioBuffer[] = [];
      
      for (const item of files) {
          const arrayBuffer = await item.file.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          buffers.push(audioBuffer);
      }
      
      const firstBuffer = buffers[0];
      const { numberOfChannels, sampleRate } = firstBuffer;

      for(let i = 1; i < buffers.length; i++) {
          if(buffers[i].numberOfChannels !== numberOfChannels || buffers[i].sampleRate !== sampleRate) {
              displayError(`File "${files[i].file.name}" has a different format. All files must have the same channel count and sample rate.`);
              setIsMerging(false);
              return;
          }
      }

      const totalLength = buffers.reduce((acc, buffer) => acc + buffer.length, 0);
      const newBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);
      
      let offset = 0;
      for (const buffer of buffers) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
          newBuffer.getChannelData(channel).set(buffer.getChannelData(channel), offset);
        }
        offset += buffer.length;
      }
      
      const wavBlob = bufferToWave(newBuffer, newBuffer.length);
      const url = URL.createObjectURL(wavBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `merged_output.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error merging clips:", err);
      displayError("Failed to merge clips. One or more files may be corrupted.");
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full">
      {files.length === 0 ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); handleFileSelect(e.dataTransfer.files); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          className={`group w-full p-10 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 ${isDragging ? 'border-red-600 bg-gray-700/50' : 'border-gray-600 hover:border-red-600 hover:bg-gray-800/50'}`}
        >
          <input ref={inputRef} type="file" accept="audio/*" multiple className="hidden" onChange={(e) => handleFileSelect(e.target.files)} />
          <div className="flex flex-col items-center justify-center space-y-4">
            <UploadIcon />
            <p className="text-lg text-gray-300"><span className="font-semibold text-red-500">Click to upload</span> or drag and drop</p>
            <p className="text-sm text-gray-500">Select multiple audio files to merge</p>
          </div>
        </div>
      ) : (
        <div className="w-full">
          <ul onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} className="space-y-3 mb-6 max-h-80 overflow-y-auto pr-2">
            {files.map((item, index) => (
              <li
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnter={(e) => handleDragEnter(e, index)}
                className="flex items-center bg-gray-700/50 p-3 rounded-lg cursor-grab active:cursor-grabbing border border-gray-600"
              >
                <span className="text-gray-400 mr-3"><DragHandleIcon /></span>
                <span className="text-white font-medium truncate">{item.file.name}</span>
                <button onClick={() => setFiles(f => f.filter(i => i.id !== item.id))} className="ml-auto text-gray-500 hover:text-red-500 transition-colors p-1 rounded-full">&times;</button>
              </li>
            ))}
          </ul>
           {error && (
                <div className="mb-4 w-full bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-center">
                    <p>{error}</p>
                </div>
            )}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={handleMerge} disabled={isMerging || files.length < 2} className="flex-1 px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors disabled:bg-red-800 disabled:cursor-not-allowed">
              {isMerging ? 'Merging...' : `Merge All Clips (${files.length})`}
            </button>
            <button onClick={() => inputRef.current?.click()} className="flex-1 px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition-colors">
              Add More
            </button>
             <button onClick={() => setFiles([])} className="px-6 py-3 bg-gray-800 text-gray-300 font-bold rounded-lg hover:bg-black transition-colors">
              Clear All
            </button>
          </div>
        </div>
      )}
    </div>
  );
};