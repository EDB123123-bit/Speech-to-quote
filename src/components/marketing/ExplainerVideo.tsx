'use client';

import { useEffect, useRef, useState } from 'react';

type Source = { src: string; poster: string; width: number; height: number };

/**
 * The explainer has no sound: captions carry the story. It plays muted while
 * it is on screen and pauses when it leaves. Nothing downloads before that,
 * and visitors who ask for less motion or less data get a play button.
 * The wide cut shows from tablet up, the portrait cut on phones.
 */
export default function ExplainerVideo({ wide, tall, label, lengthLabel }: { wide: Source; tall: Source; label: string; lengthLabel: string }) {
  return (
    <>
      <Player source={wide} label={label} lengthLabel={lengthLabel} className="lp-video lp-video-wide" />
      <Player source={tall} label={label} lengthLabel={lengthLabel} className="lp-video lp-video-tall" />
    </>
  );
}

function autoplayAllowed(): boolean {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  return !saveData && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function Player({ source, label, lengthLabel, className }: { source: Source; label: string; lengthLabel: string; className: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !autoplayAllowed()) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void video.play().catch(() => {
            // The browser refused autoplay; the play button stays available.
          });
        } else if (!video.paused) {
          video.pause();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  function play() {
    void videoRef.current?.play().catch(() => {});
  }

  return (
    <div className={className} style={{ aspectRatio: `${source.width} / ${source.height}` }}>
      <video
        ref={videoRef}
        src={source.src}
        poster={source.poster}
        width={source.width}
        height={source.height}
        preload="none"
        muted
        loop
        playsInline
        controls={started}
        aria-label={label}
        onPlaying={() => setStarted(true)}
      >
        Je browser kan deze video niet afspelen.
      </video>
      {!started && (
        <button type="button" className="lp-video-play" onClick={play}>
          <span className="lp-video-play-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>
          </span>
          <span className="lp-video-play-label">Bekijk de uitleg <span>{lengthLabel}</span></span>
        </button>
      )}
    </div>
  );
}
