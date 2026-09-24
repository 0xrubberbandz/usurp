'use client';
import { useEffect, useRef } from 'react';

/** A single video outside the keyed slides, so navigation never restarts the loop. */
export function IntroBackground({ reduced }: { reduced: boolean }) {
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
  return <div className="ob-background" aria-hidden="true">
    <video ref={video} autoPlay={!reduced} loop muted playsInline preload={reduced ? 'none' : 'auto'}
      poster="/media/intro-background.webp" disablePictureInPicture disableRemotePlayback tabIndex={-1}>
      <source src="/media/intro-background.mp4" type="video/mp4"/>
    </video>
  </div>;
}
