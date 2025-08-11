import React from 'react';

const LoadingScreen: React.FC = () => (
  <div className="flex items-center justify-center h-screen bg-gradient-to-br from-black via-golfgreen to-yellow-400">
    <div className="text-white text-2xl font-bold animate-pulse">
      Loading RYP Academy...
    </div>
  </div>
);

export default LoadingScreen; 