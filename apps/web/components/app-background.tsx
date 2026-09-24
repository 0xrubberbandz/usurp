'use client';
import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

/** Mounted once in the root layout; the intro and main app share the same continuous loop. */
export function AppBackground() {
  const reduced = !!useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const sync = () => {
      if (reduced || document.hidden) element.pause();
      else void element.play().catch(() => { /* The poster remains if autoplay is unavailable. */ });
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { document.removeEventListener('visibilitychange', sync); element.pause(); };
  }, [reduced]);
  return <div className="app-background" aria-hidden="true">
    <video ref={video} autoPlay={!reduced} loop muted playsInline preload={reduced ? 'none' : 'auto'}
      poster="/media/intro-background.webp" disablePictureInPicture disableRemotePlayback tabIndex={-1}>
      <source src="/media/intro-background.mp4" type="video/mp4"/>
    </video>
  </div>;
}
