
import React from 'react';

export const Loader: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-red-600"></div>
      <h2 className="mt-6 text-2xl font-semibold text-white">Slicing your audio...</h2>
      <p className="mt-2 text-gray-400">This may take a moment for larger files.</p>
    </div>
  );
};
