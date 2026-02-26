import React from 'react';
import { motion } from 'motion/react';

interface MyraAvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
}

export const MyraAvatar: React.FC<MyraAvatarProps> = ({ isSpeaking, isListening }) => {
  return (
    <div className="relative w-72 h-72 flex items-center justify-center">
      {/* Dynamic Background Glows */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          rotate: [0, 90, 180, 270, 360],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
        className="absolute inset-0 bg-gradient-to-tr from-blue-400 via-zinc-400 to-cyan-400 rounded-full blur-3xl"
      />
      
      <motion.div
        animate={{
          scale: isListening ? [1, 1.15, 1] : 1,
          opacity: isListening ? [0.4, 0.7, 0.4] : 0.3,
        }}
        transition={{ repeat: Infinity, duration: 1.5 }}
        className="absolute inset-4 bg-gradient-to-bl from-blue-300 via-zinc-500 to-indigo-500 rounded-full blur-2xl"
      />

      {/* Character Container */}
      <motion.div 
        animate={{ y: [0, -10, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        className="relative z-10 w-56 h-56 bg-white rounded-full border-4 border-white shadow-2xl overflow-hidden flex flex-col items-center justify-center"
      >
        {/* Hair */}
        <div className="absolute top-0 w-full h-24 bg-gradient-to-b from-blue-500 to-zinc-900 rounded-b-[40px]" />
        
        {/* Face */}
        <div className="relative mt-10 flex flex-col items-center">
          {/* Eyes */}
          <div className="flex gap-10 mb-5">
            <motion.div 
              animate={{ 
                scaleY: isListening ? [1, 1.3, 1] : 1,
                height: [12, 12, 2, 12]
              }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="w-4 h-3 bg-zinc-800 rounded-full" 
            />
            <motion.div 
              animate={{ 
                scaleY: isListening ? [1, 1.3, 1] : 1,
                height: [12, 12, 2, 12]
              }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="w-4 h-3 bg-zinc-800 rounded-full" 
            />
          </div>

          {/* Blush */}
          <div className="absolute top-5 flex gap-14 opacity-40">
            <div className="w-5 h-3 bg-blue-400 rounded-full blur-sm" />
            <div className="w-5 h-3 bg-blue-400 rounded-full blur-sm" />
          </div>

          {/* Mouth */}
          <div className="h-8 flex items-center">
            {isSpeaking ? (
              <motion.div
                className="w-8 bg-gradient-to-r from-blue-600 to-zinc-900 rounded-full animate-lip-sync"
                style={{ height: '100%' }}
              />
            ) : (
              <motion.div 
                animate={{ width: isListening ? 12 : 24 }}
                className="h-1.5 bg-blue-600 rounded-full" 
              />
            )}
          </div>
        </div>
      </motion.div>

      {/* Status Indicator */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="absolute -bottom-6 px-6 py-2 bg-white/90 backdrop-blur-md rounded-full border border-blue-200 shadow-lg"
      >
        <span className="text-sm font-bold bg-gradient-to-r from-blue-600 to-zinc-900 bg-clip-text text-transparent uppercase tracking-widest">
          {isSpeaking ? 'Myra is speaking...' : isListening ? 'Listening...' : 'Myra is here'}
        </span>
      </motion.div>
    </div>
  );
};
