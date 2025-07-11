import React, { useState, useCallback, useRef } from 'react';
import { bufferToWave } from '../App';

interface ConverterProps {
  getAudioContext: () => AudioContext;
}

type OutputFormat = 'mp3' | 'wav' | 'mp4';
type ConversionStatus = 'idle' | 'loading-ffmpeg' | 'converting' | 'done' | 'error';


const UploadIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-gray-500 group-hover:text-red-600 transition-colors">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
    </svg>
);

const DownloadIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-3">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
);

const createThumbnail = (text: string): Promise<Uint8Array> => {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d')!;

        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#4B0000');
        gradient.addColorStop(1, '#111827');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        let fontSize = 80;
        ctx.font = `bold ${fontSize}px sans-serif`;
        while (ctx.measureText(text).width > canvas.width - 100) {
            fontSize -= 5;
            ctx.font = `bold ${fontSize}px sans-serif`;
        }
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        canvas.toBlob(async (blob) => {
            const buffer = await blob!.arrayBuffer();
            resolve(new Uint8Array(buffer));
        }, 'image/png');
    });
};


export const Converter: React.FC<ConverterProps> = ({ getAudioContext }) => {
  const [file, setFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('mp3');
  const [bitrate, setBitrate] = useState<number>(320);
  const [status, setStatus] = useState<ConversionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFileName, setDownloadFileName] = useState<string>('');
  const ffmpegRef = useRef<any>(null);

  const displayError = (message: string) => {
    setError(message);
    setStatus('error');
    setTimeout(() => {
        setError(null);
        if (status === 'error') setStatus('idle');
    }, 6000);
  };
  
  const handleFileSelect = (selectedFile: File | null) => {
    if(!selectedFile) return;
    if(!selectedFile.type.startsWith('audio/') && !selectedFile.type.startsWith('video/')) {
        displayError("Please upload a valid audio or video file.");
        return;
    }
    setFile(selectedFile);
    setOutputFormat(selectedFile.type.startsWith('audio/') ? 'mp4' : 'mp3');
    setDownloadUrl(null);
    setError(null);
    setStatus('idle');
  };

  const loadFfmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    
    const ffmpegGlobal = (window as any).FFmpeg;
    if (!ffmpegGlobal) {
        throw new Error("FFMPEG library not loaded. Please check your internet connection and refresh the page.");
    }
    
    setStatus('loading-ffmpeg');
    setStatusMessage('Loading conversion engine...');
    const { createFFmpeg } = ffmpegGlobal;
    const ffmpeg = createFFmpeg({
      log: false,
      progress: ({ ratio }: { ratio: number }) => {
        setProgress(Math.round(ratio * 100));
      }
    });
    await ffmpeg.load();
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const convertToMp4 = async (audioFile: File) => {
    const ffmpeg = await loadFfmpeg();
    setStatus('converting');
    setProgress(0);
    setStatusMessage('Generating video background...');

    const audioData = new Uint8Array(await audioFile.arrayBuffer());
    const thumbnailData = await createThumbnail(audioFile.name);

    setStatusMessage('Preparing files for conversion...');
    ffmpeg.FS('writeFile', 'input.audio', audioData);
    ffmpeg.FS('writeFile', 'thumbnail.png', thumbnailData);

    setStatusMessage('Converting... this may take a while.');
    const newFileName = `${audioFile.name.replace(/\.[^/.]+$/, '')}.mp4`;
    
    await ffmpeg.run(
        '-loop', '1',
        '-i', 'thumbnail.png',
        '-i', 'input.audio',
        '-c:v', 'libx264',
        '-tune', 'stillimage',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-pix_fmt', 'yuv420p',
        '-shortest',
        'output.mp4'
    );
    
    const data = ffmpeg.FS('readFile', 'output.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    setDownloadFileName(newFileName);
    setDownloadUrl(URL.createObjectURL(blob));
    setStatus('done');
  }

  const handleConvert = async () => {
    if (!file) return;

    setError(null);
    setDownloadUrl(null);

    try {
      if (outputFormat === 'mp4') {
        await convertToMp4(file);
        return;
      }

      setStatus('converting');
      setStatusMessage('Decoding file...');
      const audioContext = getAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      let blob: Blob;
      const newFileName = `${file.name.replace(/\.[^/.]+$/, '')}.${outputFormat}`;
      setStatusMessage('Encoding to new format...');

      if (outputFormat === 'wav') {
          blob = bufferToWave(audioBuffer, audioBuffer.length);
      } else { // mp3
          const Lamejs = (window as any).lamejs;
          if (!Lamejs) {
             throw new Error("lamejs library not loaded. Please check your internet connection and refresh the page.");
          }

          const mp3encoder = new Lamejs.Mp3Encoder(audioBuffer.numberOfChannels, audioBuffer.sampleRate, bitrate);
          const mp3Data = [];
          const sampleBlockSize = 1152;

          if (audioBuffer.numberOfChannels === 2) { // Stereo
            const left = audioBuffer.getChannelData(0);
            const right = audioBuffer.getChannelData(1);
            
            const pcmLeft = new Int16Array(left.length);
            const pcmRight = new Int16Array(right.length);
            for(let i=0; i < left.length; i++) {
                pcmLeft[i] = Math.max(-1, Math.min(1, left[i])) * 32767;
                pcmRight[i] = Math.max(-1, Math.min(1, right[i])) * 32767;
            }

            for (let i = 0; i < pcmLeft.length; i += sampleBlockSize) {
              const leftChunk = pcmLeft.subarray(i, i + sampleBlockSize);
              const rightChunk = pcmRight.subarray(i, i + sampleBlockSize);
              const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
              if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
              }
            }
          } else { // Mono
            const pcm = new Int16Array(audioBuffer.length);
            const channelData = audioBuffer.getChannelData(0);
            for (let i = 0; i < channelData.length; i++) {
                pcm[i] = Math.max(-1, Math.min(1, channelData[i])) * 32767;
            }

            for (let i = 0; i < pcm.length; i += sampleBlockSize) {
              const sampleChunk = pcm.subarray(i, i + sampleBlockSize);
              const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
              if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
              }
            }
          }

          const mp3buf = mp3encoder.flush();
          if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
          }
          
          blob = new Blob(mp3Data, { type: 'audio/mpeg' });
      }
      
      setDownloadFileName(newFileName);
      setDownloadUrl(URL.createObjectURL(blob));
      setStatus('done');

    } catch (err: any) {
      console.error("Error converting file:", err);
      displayError(`Error converting file: ${err.message || 'It may be corrupted or in an unsupported format.'}`);
    }
  };

  const reset = () => {
      setFile(null);
      setDownloadUrl(null);
      setError(null);
      setStatus('idle');
  }
  
  const isProcessing = status === 'loading-ffmpeg' || status === 'converting';

  return (
    <div className="flex flex-col items-center justify-center w-full">
      {!file ? (
        <div
          onClick={() => document.getElementById('converter-input')?.click()}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFileSelect(e.dataTransfer.files?.[0] || null); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="group w-full p-10 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 border-gray-600 hover:border-red-600 hover:bg-gray-800/50"
        >
          <input id="converter-input" type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => handleFileSelect(e.target.files?.[0] || null)} />
          <div className="flex flex-col items-center justify-center space-y-4">
            <UploadIcon />
            <p className="text-lg text-gray-300"><span className="font-semibold text-red-500">Click to upload</span> or drag and drop</p>
            <p className="text-sm text-gray-500">Audio (MP3, WAV) or Video (MP4)</p>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-lg mx-auto text-center">
            <p className="text-lg text-white mb-2">File Ready to Convert:</p>
            <p className="text-xl font-semibold text-red-500 mb-6 truncate">{file.name}</p>

            <div className="mb-6 space-y-4">
                <div>
                    <label htmlFor="format-select" className="block text-sm font-medium text-gray-400 mb-2">
                        Convert To:
                    </label>
                    <select 
                        id="format-select" 
                        value={outputFormat}
                        onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
                        className="w-full max-w-xs mx-auto px-4 py-3 bg-gray-900 border border-gray-600 rounded-xl text-white text-center text-lg font-semibold focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
                    >
                        {file.type.startsWith('audio/') && <option value="mp4">MP4 (Video)</option>}
                        <option value="mp3">MP3 (Compressed)</option>
                        <option value="wav">WAV (Highest Quality)</option>
                    </select>
                </div>
                {outputFormat === 'mp3' && (
                  <div>
                      <label htmlFor="quality-select" className="block text-sm font-medium text-gray-400 mb-2">
                          MP3 Quality:
                      </label>
                      <select 
                          id="quality-select" 
                          value={bitrate}
                          onChange={(e) => setBitrate(Number(e.target.value))}
                          className="w-full max-w-xs mx-auto px-4 py-3 bg-gray-900 border border-gray-600 rounded-xl text-white text-center text-lg font-semibold focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
                      >
                          <option value="128">Standard (128 kbps)</option>
                          <option value="192">High (192 kbps)</option>
                          <option value="320">Highest (320 kbps)</option>
                      </select>
                  </div>
                )}
            </div>
            
             {error && (
                <div className="my-4 w-full bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-center">
                    <p>{error}</p>
                </div>
            )}

            {isProcessing && (
                <div className="my-6 space-y-3">
                    <p className="text-sky-400">{statusMessage} {status === 'converting' && `${progress}%`}</p>
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                        <div className="bg-sky-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
            )}
            
            {downloadUrl && status === 'done' && (
                 <div className="my-6">
                    <a href={downloadUrl} download={downloadFileName}
                    className="inline-flex items-center justify-center w-full max-w-xs px-6 py-4 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors text-lg"
                    >
                       <DownloadIcon/> Download File
                    </a>
                </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button onClick={handleConvert} disabled={isProcessing} className="flex-1 px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors disabled:bg-red-800 disabled:cursor-not-allowed">
                    {isProcessing ? 'Converting...' : 'Convert File'}
                </button>
                <button onClick={reset} disabled={isProcessing} className="flex-1 px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition-colors disabled:bg-gray-700/50">
                    Use Another File
                </button>
            </div>

        </div>
      )}
    </div>
  );
};