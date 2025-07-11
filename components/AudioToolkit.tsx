import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Uploader } from './Uploader';
import { bufferToWave } from '../App';

interface AudioToolkitProps {
  getAudioContext: () => AudioContext;
}

export const AudioToolkit: React.FC<AudioToolkitProps> = ({ getAudioContext }) => {
  const [file, setFile] = useState<File | null>(null);
  const [sourceBuffer, setSourceBuffer] = useState<AudioBuffer | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tool settings
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [shouldNormalize, setShouldNormalize] = useState(false);
  const [shouldRemoveSilence, setShouldRemoveSilence] = useState(false);
  const [silenceThreshold, setSilenceThreshold] = useState(-50); // dB

  const audioRef = useRef<HTMLAudioElement>(null);
  
  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, previewUrl]);

  const displayError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    if (!selectedFile.type.startsWith('audio/')) {
      displayError('Please upload a valid audio file.');
      return;
    }
    setFile(selectedFile);
    setError(null);
    setIsProcessing(true);
    try {
      const audioContext = getAudioContext();
      const arrayBuffer = await selectedFile.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      setSourceBuffer(audioBuffer);
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    } catch (e) {
      console.error('Error processing audio:', e);
      displayError('Could not process the audio file. It may be corrupted.');
      setFile(null);
      setSourceBuffer(null);
    } finally {
      setIsProcessing(false);
    }
  }, [getAudioContext]);
  
  const resetAll = () => {
      setFile(null);
      setSourceBuffer(null);
      setPreviewUrl(null);
      setError(null);
      setIsProcessing(false);
      setPlaybackSpeed(1);
      setShouldNormalize(false);
      setShouldRemoveSilence(false);
      setSilenceThreshold(-50);
  };

  const processAudio = async (): Promise<AudioBuffer> => {
    let currentBuffer = sourceBuffer;
    if (!currentBuffer) throw new Error("Source buffer is not available.");
    
    const audioContext = getAudioContext();

    if (shouldRemoveSilence) {
        const { sampleRate, numberOfChannels } = currentBuffer;
        const channelData = currentBuffer.getChannelData(0); // Analyze first channel
        const linearThreshold = Math.pow(10, silenceThreshold / 20);
        const paddingSamples = Math.floor(0.1 * sampleRate); // Add 100ms padding

        const nonSilentSegments: { start: number; end: number }[] = [];
        let segmentStart = -1;

        // Find segments of sound
        for (let i = 0; i < channelData.length; i++) {
            if (Math.abs(channelData[i]) > linearThreshold && segmentStart === -1) {
                segmentStart = i;
            } else if (Math.abs(channelData[i]) < linearThreshold && segmentStart !== -1) {
                const segmentEnd = i;
                nonSilentSegments.push({
                    start: Math.max(0, segmentStart - paddingSamples),
                    end: Math.min(channelData.length, segmentEnd + paddingSamples),
                });
                segmentStart = -1;
            }
        }
        if (segmentStart !== -1) {
            nonSilentSegments.push({ start: segmentStart, end: channelData.length });
        }
        
        // Merge overlapping segments
        if (nonSilentSegments.length > 0) {
            const mergedSegments = [nonSilentSegments.shift()!];
            for (const segment of nonSilentSegments) {
                const last = mergedSegments[mergedSegments.length - 1];
                if (segment.start < last.end) {
                    last.end = Math.max(last.end, segment.end);
                } else {
                    mergedSegments.push(segment);
                }
            }

            const totalLength = mergedSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
            if (totalLength > 0) {
                const newBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);
                let offset = 0;
                for (const segment of mergedSegments) {
                    for (let c = 0; c < numberOfChannels; c++) {
                        const originalChannel = currentBuffer.getChannelData(c);
                        const segmentData = originalChannel.subarray(segment.start, segment.end);
                        newBuffer.getChannelData(c).set(segmentData, offset);
                    }
                    offset += segment.end - segment.start;
                }
                currentBuffer = newBuffer;
            } else {
                 currentBuffer = audioContext.createBuffer(numberOfChannels, 1, sampleRate);
            }
        } else {
             currentBuffer = audioContext.createBuffer(numberOfChannels, 1, sampleRate);
        }
    }
    
    if (shouldNormalize) {
      let maxAmp = 0;
      for (let c = 0; c < currentBuffer.numberOfChannels; c++) {
        const channelData = currentBuffer.getChannelData(c);
        for (let i = 0; i < channelData.length; i++) {
          maxAmp = Math.max(maxAmp, Math.abs(channelData[i]));
        }
      }
      
      if (maxAmp > 0 && maxAmp < 1) { // Avoid amplifying already loud audio
        const gain = 1.0 / maxAmp;
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(gain, 0);
        
        const offlineCtx = new OfflineAudioContext(currentBuffer.numberOfChannels, currentBuffer.length, currentBuffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = currentBuffer;
        source.connect(gainNode);
        gainNode.connect(offlineCtx.destination);
        source.start();
        currentBuffer = await offlineCtx.startRendering();
      }
    }
    
    return currentBuffer;
  }

  const handleApplyAndDownload = async () => {
    setIsProcessing(true);
    setError(null);
    try {
        const processedBuffer = await processAudio();
        
        // Final pass for speed change
        const offlineCtx = new OfflineAudioContext(
            processedBuffer.numberOfChannels,
            Math.ceil(processedBuffer.length / playbackSpeed),
            processedBuffer.sampleRate
        );
        const source = offlineCtx.createBufferSource();
        source.buffer = processedBuffer;
        source.playbackRate.value = playbackSpeed;
        source.connect(offlineCtx.destination);
        source.start();
        const finalBuffer = await offlineCtx.startRendering();

        const wavBlob = bufferToWave(finalBuffer, finalBuffer.length);
        const url = URL.createObjectURL(wavBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${file?.name.replace(/\.[^/.]+$/, '')}_edited.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (err: any) {
      console.error("Error applying effects:", err);
      displayError(`Failed to apply effects: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!file) {
    return <Uploader onFileSelect={handleFileSelect} error={error} />;
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
        <div className="text-center mb-6">
            <p className="text-lg text-white mb-2">Editing File:</p>
            <p className="text-xl font-semibold text-red-500 truncate">{file.name}</p>
            {previewUrl && (
                <audio ref={audioRef} key={previewUrl} controls src={previewUrl} className="w-full mt-4 h-12"></audio>
            )}
        </div>

        <div className="space-y-6 bg-gray-900/50 p-6 rounded-xl border border-gray-700">
            {/* Speed Control */}
            <div>
                <label htmlFor="speed-control" className="block text-lg font-medium text-gray-300 mb-2">
                    Playback Speed: <span className="font-bold text-red-500">{playbackSpeed.toFixed(2)}x</span>
                </label>
                <input
                    id="speed-control"
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.05"
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
            </div>

            {/* Volume Control */}
            <div>
                <label className="block text-lg font-medium text-gray-300 mb-2">Volume Tools</label>
                <div className="flex items-center p-3 bg-gray-800 rounded-lg">
                    <input id="normalize-checkbox" type="checkbox" checked={shouldNormalize} onChange={() => setShouldNormalize(!shouldNormalize)} className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-red-600 focus:ring-red-500 cursor-pointer"/>
                    <label htmlFor="normalize-checkbox" className="ml-3 font-medium text-gray-300 cursor-pointer">
                        Normalize Volume
                        <span className="block text-sm text-gray-500">Boost quiet audio to a standard level</span>
                    </label>
                </div>
            </div>

            {/* Silence Remover */}
            <div>
                 <label className="block text-lg font-medium text-gray-300 mb-2">Silence Remover</label>
                 <div className="p-3 bg-gray-800 rounded-lg space-y-3">
                    <div className="flex items-center">
                        <input id="silence-checkbox" type="checkbox" checked={shouldRemoveSilence} onChange={() => setShouldRemoveSilence(!shouldRemoveSilence)} className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-red-600 focus:ring-red-500 cursor-pointer"/>
                        <label htmlFor="silence-checkbox" className="ml-3 font-medium text-gray-300 cursor-pointer">
                            Remove Silent Sections
                            <span className="block text-sm text-gray-500">Automatically cut long pauses</span>
                        </label>
                    </div>
                    {shouldRemoveSilence && (
                        <div>
                             <label htmlFor="threshold-control" className="block text-sm font-medium text-gray-400 mb-1">
                                Silence Threshold: <span className="font-bold text-red-500">{silenceThreshold} dB</span>
                            </label>
                            <input
                                id="threshold-control"
                                type="range"
                                min="-90"
                                max="-20"
                                step="1"
                                value={silenceThreshold}
                                onChange={(e) => setSilenceThreshold(parseInt(e.target.value))}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    )}
                 </div>
            </div>
        </div>
        
        {error && (
            <div className="mt-4 w-full bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-center">
                <p>{error}</p>
            </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <button onClick={handleApplyAndDownload} disabled={isProcessing} className="flex-1 px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors disabled:bg-red-800 disabled:cursor-not-allowed">
              {isProcessing ? 'Processing...' : 'Apply Changes & Download'}
            </button>
            <button onClick={resetAll} className="flex-1 px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition-colors">
              Start Over
            </button>
        </div>
    </div>
  );
};