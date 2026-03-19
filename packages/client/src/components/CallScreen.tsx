import { useEffect, useRef } from "react";
import type { CallState } from "../hooks/useWebRTC";

interface CallScreenProps {
  callState: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
}

export function CallScreen({
  callState,
  localStream,
  remoteStream,
  isMuted,
  isCameraOff,
  onEnd,
  onToggleMute,
  onToggleCamera,
}: CallScreenProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (callState.phase !== "active") return null;

  const isVideo = callState.callType === "video";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-900">
      {/* Remote video / audio-only placeholder */}
      <div className="relative flex flex-1 items-center justify-center bg-slate-950">
        {isVideo ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-slate-400">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-700 text-4xl text-white">
              🎙️
            </div>
            <p className="text-lg font-medium text-white">語音通話中</p>
            {/* Hidden audio element for remote audio */}
            <audio ref={remoteVideoRef as React.RefObject<HTMLAudioElement>} autoPlay />
          </div>
        )}

        {/* Local video PiP */}
        {isVideo && (
          <div className="absolute bottom-4 right-4 h-32 w-24 overflow-hidden rounded-xl border-2 border-slate-600 bg-slate-800 shadow-xl">
            {isCameraOff ? (
              <div className="flex h-full w-full items-center justify-center text-slate-500">
                <VideoOffIcon className="h-8 w-8" />
              </div>
            ) : (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            )}
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-center gap-6 bg-slate-900 py-6">
        {/* Mute */}
        <ControlButton
          onClick={onToggleMute}
          active={isMuted}
          title={isMuted ? "取消靜音" : "靜音"}
        >
          {isMuted ? <MicOffIcon /> : <MicIcon />}
        </ControlButton>

        {/* Camera toggle (video calls only) */}
        {isVideo && (
          <ControlButton
            onClick={onToggleCamera}
            active={isCameraOff}
            title={isCameraOff ? "開啟鏡頭" : "關閉鏡頭"}
          >
            {isCameraOff ? <VideoOffIcon /> : <VideoIcon />}
          </ControlButton>
        )}

        {/* End call */}
        <button
          onClick={onEnd}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:bg-red-600 active:scale-95"
          title="掛斷"
        >
          <PhoneDownIcon />
        </button>
      </div>
    </div>
  );
}

// ---- Control Button ----

interface ControlButtonProps {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}

function ControlButton({ onClick, active, title, children }: ControlButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-14 w-14 items-center justify-center rounded-full transition active:scale-95 ${
        active
          ? "bg-slate-500 text-white"
          : "bg-slate-700 text-slate-200 hover:bg-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

// ---- Icons ----

function MicIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
      <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
    </svg>
  );
}

function MicOffIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8.25 4.5a3.75 3.75 0 117.5 0v.458l-7.5-7.5V4.5z" />
      <path d="M15.75 9.75l-7.5-7.5M15.75 12.75V12l-7.5-7.5v8.25a3.75 3.75 0 007.5 0zM3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18z" />
    </svg>
  );
}

function VideoIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
    </svg>
  );
}

function VideoOffIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06L3.53 2.47z" />
      <path d="M22.5 6.31l-5.715 5.715A1.5 1.5 0 0016.5 12v4.5a3 3 0 01-3 3H5.557L22.5 2.557V6.31z" />
      <path d="M4.5 4.5H4.5A3 3 0 001.5 7.5v9a3 3 0 003 3h8.25c.41 0 .8-.083 1.155-.232L4.5 4.5z" />
    </svg>
  );
}

function PhoneDownIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd" />
    </svg>
  );
}
