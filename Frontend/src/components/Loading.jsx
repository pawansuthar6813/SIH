
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

const Spinner = ({ size = 'md', className = '' }) => {
  const spinnerRef = useRef(null);

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-20 h-20'
  };

  useEffect(() => {
    if (spinnerRef.current) {
      // Create smooth infinite rotation
      gsap.to(spinnerRef.current, {
        rotation: 360,
        duration: 1,
        ease: "none",
        repeat: -1
      });
    }
  }, []);

  return (
    <div 
      ref={spinnerRef}
      className={`${sizeClasses[size]} border-2 border-slate-300/30 border-t-violet-600 rounded-full ${className}`}
    />
  );
};

// Full screen loading overlay with built-in spinner
const Loading = ({ message = "Loading..." }) => {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const spinnerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current && contentRef.current) {
      // Set initial state
      gsap.set(contentRef.current, {
        scale: 0.8,
        opacity: 0
      });

      // Animate entrance
      gsap.to(contentRef.current, {
        scale: 1,
        opacity: 1,
        duration: 0.6,
        ease: "back.out(1.7)"
      });
    }

    // Animate spinner
    if (spinnerRef.current) {
      gsap.to(spinnerRef.current, {
        rotation: 360,
        duration: 1,
        ease: "none",
        repeat: -1
      });
    }
  }, []);

  return (
    <div 
      ref={containerRef}
      className='fixed inset-0 w-screen h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-zinc-900 flex justify-center items-center z-50'
    >
      <div ref={contentRef} className='text-center'>
        <div className='mb-4 flex justify-center'>
          <div 
            ref={spinnerRef}
            className='w-20 h-20 border-2 border-slate-300/30 border-t-violet-600 rounded-full'
          />
        </div>
        <p className='text-slate-300 text-base font-medium'>
          {message}
        </p>
      </div>
    </div>
  );
};

export default Loading