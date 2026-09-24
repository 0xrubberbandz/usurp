'use client';
import { useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { setSoundEnabled, soundEnabled, soundReady, subscribeSound, unlockAudio } from '@/lib/sound';

export function SoundToggle({ label = false }: { label?: boolean }) {
  const enabled = useSyncExternalStore(subscribeSound, soundEnabled, () => false);
  const ready = useSyncExternalStore(subscribeSound, soundReady, () => false);
  const text = enabled ? (ready ? 'sound on' : 'enable sound') : 'sound off';
  return <button type="button" data-sound-toggle className={label ? 'sound-toggle sound-toggle-label' : 'sound-toggle'} aria-label="sound effects" aria-pressed={enabled} title={text}
    onClick={() => { if (enabled && !ready) unlockAudio(); else setSoundEnabled(!enabled); }}>
    {enabled ? <Volume2 size={17}/> : <VolumeX size={17}/>} {label && <span>{text}</span>}
  </button>;
}
