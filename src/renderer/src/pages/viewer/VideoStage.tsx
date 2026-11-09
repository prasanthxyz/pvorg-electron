import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import { api } from '../../api/client'
import type { ViewerCombination } from '../../api/types'
import { timecode } from '../../app/format'
import { Button } from '../../components/controls'
import { EmptyState } from '../../components/feedback'
import { Icon } from '../../components/Icon'
import { showError } from '../../state/feedback'
import { createStore, useStore } from '../../state/store'
import { FrameGrabber } from './frames'

export interface PlayerHandle {
  togglePlay(): void
  pause(): void
  play(): void
  seekBy(seconds: number): void
  seekToFraction(fraction: number): void
  changeVolume(delta: number): void
  toggleMute(): void
  toggleFullScreen(): void
  isPlaying(): boolean
  isReady(): boolean
}

/** Chromium can't play these containers (SPEC §16 Playback). */
const UNPLAYABLE = new Set(['avi', 'wmv', 'flv'])

/** Volume outlives the combination, like a hardware knob. */
const VOLUME_KEY = 'pvorg.volume'
function storedVolume(): { volume: number; muted: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? 'null')
    if (saved && typeof saved.volume === 'number') {
      return { volume: Math.min(1, Math.max(0, saved.volume)), muted: !!saved.muted }
    }
  } catch {
    /* ignore */
  }
  return { volume: 1, muted: false }
}
const volumeStore = createStore(storedVolume())
volumeStore.subscribe(() => localStorage.setItem(VOLUME_KEY, JSON.stringify(volumeStore.get())))

interface Props {
  combination: ViewerCombination
  active: boolean
  onShowContactSheet: () => void
}

/** The video and its transport bar (SPEC §5, §6.8, §9). */
export const VideoStage = forwardRef<PlayerHandle, Props>(function VideoStage(
  { combination, active, onShowContactSheet },
  ref
) {
  const video = useRef<HTMLVideoElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fullScreen, setFullScreen] = useState(false)
  const sound = useStore(volumeStore)
  const { video: info } = combination

  useImperativeHandle(ref, () => ({
    togglePlay: () => (video.current?.paused ? play() : video.current?.pause()),
    pause: () => video.current?.pause(),
    play,
    seekBy: (s) => seek((video.current?.currentTime ?? 0) + s),
    seekToFraction: (f) => seek(f * (video.current?.duration ?? 0)),
    changeVolume,
    toggleMute,
    toggleFullScreen,
    isPlaying: () => !!video.current && !video.current.paused,
    isReady: () => !failed && !!video.current && Number.isFinite(video.current.duration)
  }))

  function play() {
    const el = video.current
    if (!el || failed) return
    if (el.ended) el.currentTime = 0
    el.play().catch(() => undefined)
  }

  function seek(seconds: number) {
    const el = video.current
    if (!el || !Number.isFinite(el.duration)) return
    el.currentTime = Math.max(0, Math.min(el.duration, seconds))
    setTime(el.currentTime)
  }

  function changeVolume(delta: number) {
    volumeStore.set((v) => ({
      volume: Math.round(Math.min(1, Math.max(0, v.volume + delta)) * 10) / 10,
      muted: false
    }))
  }

  function toggleMute() {
    volumeStore.set((v) => ({ ...v, muted: !v.muted }))
  }

  function toggleFullScreen() {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void container.current?.requestFullscreen().catch(() => undefined)
  }

  useEffect(() => {
    const el = video.current
    if (!el) return
    el.volume = sound.volume
    el.muted = sound.muted
  }, [sound, failed])

  useEffect(() => {
    const element = container.current
    const onChange = () => setFullScreen(document.fullscreenElement === element)
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      if (element && document.fullscreenElement === element) void document.exitFullscreen()
    }
  }, [])

  useEffect(() => {
    if (active) play()
    else {
      video.current?.pause()
      if (document.fullscreenElement) void document.exitFullscreen()
    }
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) {
    const ext = info.extension
    return (
      <div className="stage__state">
        <EmptyState
          icon="warning"
          tone="warning"
          title="Can’t Play This Video"
          actions={
            <>
              <Button
                variant="primary"
                icon="external"
                onClick={() =>
                  void api
                    .openInDefaultApp(info.filename)
                    .catch((error) => showError('Couldn’t Open the Video', error))
                }
              >
                Open in Default App
              </Button>
              <Button onClick={onShowContactSheet}>Show Contact Sheet</Button>
            </>
          }
        >
          {UNPLAYABLE.has(ext)
            ? `pvorg can’t play .${ext} files. Open the video in your default app, or re-encode it to MP4.`
            : 'The video couldn’t be opened. The file may be damaged or use a codec pvorg can’t play.'}
        </EmptyState>
      </div>
    )
  }

  const volumeLevel = sound.muted ? 0 : sound.volume

  return (
    <div className={`player${fullScreen ? ' is-full-screen' : ''}`} ref={container}>
      <div className="player__video">
        <video
          ref={video}
          src={info.videoUrl}
          preload="metadata"
          playsInline
          aria-label={`Video: ${info.title}`}
          onClick={() => (video.current?.paused ? play() : video.current?.pause())}
          onDoubleClick={toggleFullScreen}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onDurationChange={(e) =>
            setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)
          }
          onLoadedMetadata={() => setLoading(false)}
          onWaiting={() => setLoading(true)}
          onCanPlay={() => setLoading(false)}
          onError={() => setFailed(true)}
        />
        {loading && <span className="player__spinner" aria-hidden="true" />}
      </div>
      <div className="transport">
        <div className="transport__buttons">
          <button
            type="button"
            className="transport__btn"
            aria-label="Skip back 10 seconds"
            title="Skip back 10 seconds (←)"
            onClick={() => seek(time - 10)}
          >
            <Icon name="back10" size={20} />
          </button>
          <button
            type="button"
            className="transport__btn transport__btn--primary"
            aria-label={playing ? 'Pause' : 'Play'}
            title={`${playing ? 'Pause' : 'Play'} (Space)`}
            onClick={() => (playing ? video.current?.pause() : play())}
          >
            <Icon name={playing ? 'pause' : 'play'} size={20} />
          </button>
          <button
            type="button"
            className="transport__btn"
            aria-label="Skip forward 10 seconds"
            title="Skip forward 10 seconds (→)"
            onClick={() => seek(time + 10)}
          >
            <Icon name="forward10" size={20} />
          </button>
        </div>
        <span className="transport__time tabular">{timecode(time)}</span>
        <Scrubber time={time} duration={duration} videoUrl={info.videoUrl} onSeek={seek} />
        <span className="transport__time tabular">{timecode(duration)}</span>
        <div className="transport__volume">
          <button
            type="button"
            className="transport__btn"
            aria-label={sound.muted ? 'Unmute' : 'Mute'}
            title={`${sound.muted ? 'Unmute' : 'Mute'} (M)`}
            onClick={toggleMute}
          >
            <Icon name={volumeLevel === 0 ? 'volumeMute' : 'volume'} size={20} />
          </button>
          <input
            type="range"
            className="volume-slider"
            min={0}
            max={1}
            step={0.05}
            value={volumeLevel}
            aria-label="Volume"
            aria-valuetext={`${Math.round(volumeLevel * 100)}%`}
            title="Volume (↑ ↓)"
            style={{ '--level': `${volumeLevel * 100}%` } as React.CSSProperties}
            onChange={(e) => volumeStore.set({ volume: Number(e.target.value), muted: false })}
          />
        </div>
        <button
          type="button"
          className="transport__btn"
          aria-label={fullScreen ? 'Exit full screen' : 'Full screen'}
          title={`${fullScreen ? 'Exit full screen' : 'Full screen'} (F)`}
          onClick={toggleFullScreen}
        >
          <Icon name={fullScreen ? 'exitFullScreen' : 'fullScreen'} size={20} />
        </button>
      </div>
    </div>
  )
})

function Scrubber({
  time,
  duration,
  videoUrl,
  onSeek
}: {
  time: number
  duration: number
  videoUrl: string
  onSeek: (seconds: number) => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ x: number; width: number; time: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [grabber, setGrabber] = useState<FrameGrabber | null>(null)

  // The hidden preview video is created on first hover, and discarded with the combination.
  useEffect(() => () => grabber?.dispose(), [grabber])
  const subscribe = useCallback(
    (listener: () => void) => grabber?.subscribe(listener) ?? (() => undefined),
    [grabber]
  )
  const second = hover ? Math.floor(hover.time) : 0
  const frame = useSyncExternalStore(subscribe, () =>
    grabber && hover ? grabber.frame(second) : null
  )

  const at = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return { x: fraction * rect.width, width: rect.width, time: fraction * duration }
  }

  const progress = duration > 0 ? Math.min(1, time / duration) : 0
  const previewWidth = 224

  return (
    <div
      ref={track}
      className={`scrubber${hover || dragging ? ' is-active' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label="Playback position"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={`${timecode(time)} of ${timecode(duration)}`}
      onPointerMove={(e) => {
        if (duration <= 0) return
        if (!grabber) setGrabber(new FrameGrabber(videoUrl))
        const point = at(e.clientX)
        setHover(point)
        if (dragging) onSeek(point.time)
      }}
      onPointerLeave={() => !dragging && setHover(null)}
      onPointerDown={(e) => {
        if (duration <= 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
        onSeek(at(e.clientX).time)
      }}
      onPointerUp={(e) => {
        setDragging(false)
        onSeek(at(e.clientX).time)
        if (e.pointerType !== 'mouse') setHover(null)
      }}
      onPointerCancel={() => {
        setDragging(false)
        setHover(null)
      }}
      onKeyDown={(e) => {
        const step = { ArrowLeft: -10, ArrowRight: 10, ArrowDown: -10, ArrowUp: 10 }[e.key]
        if (step !== undefined) {
          e.preventDefault()
          onSeek(time + step)
        } else if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault()
          onSeek(e.key === 'Home' ? 0 : duration)
        }
      }}
    >
      <div className="scrubber__track">
        <div className="scrubber__fill" style={{ width: `${progress * 100}%` }} />
        <div className="scrubber__knob" style={{ left: `${progress * 100}%` }} />
      </div>
      {hover && duration > 0 && (
        <div
          className="scrubber__preview"
          style={{
            left: Math.max(0, Math.min(hover.width - previewWidth, hover.x - previewWidth / 2))
          }}
          aria-hidden="true"
        >
          <div className="scrubber__frame" style={{ width: previewWidth, height: 126 }}>
            {frame && <img className="scrubber__image" src={frame} alt="" />}
          </div>
          <span className="scrubber__time tabular">{timecode(hover.time)}</span>
        </div>
      )}
    </div>
  )
}
