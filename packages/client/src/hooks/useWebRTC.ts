import { useRef, useState, useCallback } from "react";
import type { WSClientEvent, WSServerEvent } from "@xekuchat/core";

// ============================================================
// WebRTC Configuration
// ============================================================

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// ============================================================
// Types
// ============================================================

export type CallState =
  | { phase: "idle" }
  | { phase: "calling"; callId: string; channelId: string; targetUserId: string; callType: "audio" | "video" }
  | { phase: "incoming"; callId: string; channelId: string; callerId: string; callerName: string; callerAvatar: string | null; callType: "audio" | "video" }
  | { phase: "active"; callId: string; channelId: string; remoteUserId: string; callType: "audio" | "video" };

// ============================================================
// Hook
// ============================================================

export function useWebRTC(
  myUserId: string,
  send: (event: WSClientEvent) => void
) {
  const [callState, setCallState] = useState<CallState>({ phase: "idle" });
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // ---- Helpers ----

  function cleanup() {
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsCameraOff(false);
    setCallState({ phase: "idle" });
  }

  async function getMedia(callType: "audio" | "video"): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === "video",
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }

  function createPeer(callId: string, remoteUserId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerRef.current = pc;

    // Remote stream
    const remote = new MediaStream();
    setRemoteStream(remote);

    pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        send({
          type: "call:ice",
          callId,
          targetUserId: remoteUserId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        cleanup();
      }
    };

    return pc;
  }

  // ---- Public API ----

  const initiateCall = useCallback(async (
    channelId: string,
    targetUserId: string,
    callType: "audio" | "video"
  ) => {
    if (callState.phase !== "idle") return;

    const callId = crypto.randomUUID();
    setCallState({ phase: "calling", callId, channelId, targetUserId, callType });

    try {
      const stream = await getMedia(callType);
      const pc = createPeer(callId, targetUserId);

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      send({ type: "call:initiate", callId, channelId, targetUserId, callType });
    } catch (err) {
      console.error("Failed to initiate call:", err);
      cleanup();
    }
  }, [callState.phase, send]);

  const acceptCall = useCallback(async () => {
    if (callState.phase !== "incoming") return;
    const { callId, callerId, callType, channelId } = callState;

    try {
      const stream = await getMedia(callType);
      const pc = createPeer(callId, callerId);

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      send({ type: "call:accept", callId });
      setCallState({ phase: "active", callId, channelId, remoteUserId: callerId, callType });
    } catch (err) {
      console.error("Failed to accept call:", err);
      cleanup();
    }
  }, [callState, send]);

  const rejectCall = useCallback(() => {
    if (callState.phase !== "incoming") return;
    send({ type: "call:reject", callId: callState.callId });
    setCallState({ phase: "idle" });
  }, [callState, send]);

  const endCall = useCallback(() => {
    if (callState.phase === "idle") return;
    send({ type: "call:end", callId: callState.callId });
    cleanup();
  }, [callState, send]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsMuted((v) => !v);
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsCameraOff((v) => !v);
  }, []);

  // ---- WS Event Handler (call from useChat) ----

  const handleCallEvent = useCallback(async (event: WSServerEvent) => {
    if (event.type === "call:incoming") {
      if (callState.phase !== "idle") {
        // Busy — auto-reject
        return;
      }
      setCallState({
        phase: "incoming",
        callId: event.callId,
        channelId: event.channelId,
        callerId: event.callerId,
        callerName: event.callerName,
        callerAvatar: event.callerAvatar,
        callType: event.callType,
      });
      return;
    }

    if (event.type === "call:accepted") {
      if (callState.phase !== "calling") return;
      const { callId, targetUserId, callType, channelId } = callState;

      const pc = peerRef.current;
      if (!pc) return;

      // Send the offer now that remote accepted
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      send({ type: "call:offer", callId, targetUserId, sdp: offer.sdp! });
      setCallState({ phase: "active", callId, channelId, remoteUserId: targetUserId, callType });
      return;
    }

    if (event.type === "call:rejected") {
      cleanup();
      return;
    }

    if (event.type === "call:ended") {
      cleanup();
      return;
    }

    if (event.type === "call:offer") {
      // We are the answerer
      const pc = peerRef.current;
      if (!pc) return;

      await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: event.sdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const cs = callState;
      if (cs.phase !== "active" && cs.phase !== "incoming") return;

      const targetUserId = event.fromUserId;
      send({ type: "call:answer", callId: event.callId, targetUserId, sdp: answer.sdp! });
      return;
    }

    if (event.type === "call:answer") {
      // We are the caller receiving the answer
      const pc = peerRef.current;
      if (!pc) return;

      await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: event.sdp }));
      return;
    }

    if (event.type === "call:ice") {
      const pc = peerRef.current;
      if (!pc) return;

      try {
        await pc.addIceCandidate(new RTCIceCandidate(event.candidate));
      } catch (err) {
        console.warn("ICE candidate error:", err);
      }
      return;
    }
  }, [callState, send]);

  return {
    callState,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    handleCallEvent,
  };
}
