import { useEffect, useRef } from "react";
import type { CallState } from "../hooks/useWebRTC";

interface CallModalProps {
  callState: CallState;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
}

// Renders:
// - "calling" phase: waiting for remote to answer
// - "incoming" phase: incoming call alert
// Returns null for idle/active phases (CallScreen handles active)

export function CallModal({ callState, onAccept, onReject, onEnd }: CallModalProps) {
  const ringRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (callState.phase === "incoming") {
      // Use system beep pattern via Web Audio API
      ringRef.current = new Audio();
      ringRef.current.loop = true;
    }
    return () => {
      ringRef.current?.pause();
      ringRef.current = null;
    };
  }, [callState.phase]);

  if (callState.phase === "idle" || callState.phase === "active") return null;

  if (callState.phase === "calling") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="flex w-72 flex-col items-center gap-6 rounded-2xl bg-slate-800 p-8 shadow-2xl">
          {/* Pulsing avatar */}
          <div className="relative flex items-center justify-center">
            <span className="absolute h-20 w-20 animate-ping rounded-full bg-slate-600 opacity-40" />
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-600 text-2xl font-bold text-white">
              ?
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-400">
              {callState.callType === "video" ? "視訊通話" : "語音通話"}
            </p>
            <p className="mt-1 text-lg font-semibold text-white">撥號中…</p>
          </div>
          {/* End button */}
          <button
            onClick={onEnd}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:bg-red-600 active:scale-95"
            title="取消"
          >
            <PhoneDownIcon />
          </button>
        </div>
      </div>
    );
  }

  // incoming
  const { callerName, callerAvatar, callType } = callState;
  const initial = callerName.charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex w-72 flex-col items-center gap-6 rounded-2xl bg-slate-800 p-8 shadow-2xl">
        {/* Caller avatar */}
        <div className="relative flex items-center justify-center">
          <span className="absolute h-20 w-20 animate-ping rounded-full bg-emerald-600 opacity-40" />
          {callerAvatar ? (
            <img src={callerAvatar} alt={callerName} className="relative h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-slate-600 text-2xl font-bold text-white">
              {initial}
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-sm text-slate-400">
            {callType === "video" ? "來電視訊通話" : "來電語音通話"}
          </p>
          <p className="mt-1 text-lg font-semibold text-white">{callerName}</p>
        </div>

        {/* Accept / Reject */}
        <div className="flex gap-8">
          <button
            onClick={onReject}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:bg-red-600 active:scale-95"
            title="拒絕"
          >
            <PhoneDownIcon />
          </button>
          <button
            onClick={onAccept}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-600 active:scale-95"
            title="接聽"
          >
            <PhoneIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd" />
    </svg>
  );
}

function PhoneDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd" />
    </svg>
  );
}
