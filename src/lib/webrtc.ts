import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

type SignalPayload = {
  kind: "offer" | "answer" | "ice" | "hangup";
  senderId: string;
  value?: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

type WebRtcOptions = {
  roomId: string | null;
  userId: string | null;
  remoteId: string | null;
  onCallStarted?: () => void | Promise<void>;
  onCallEnded?: (durationSeconds: number) => void | Promise<void>;
};

export function useWebRtcRoom({ roomId, userId, remoteId, onCallStarted, onCallEnded }: WebRtcOptions) {
  const [status, setStatus] = useState("camera off");
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescriptionSet = useRef(false);
  const stopping = useRef(false);
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const [, redraw] = useState(0);
  const startedAt = useRef<number | null>(null);
  const callbacks = useRef({ onCallStarted, onCallEnded });
  callbacks.current = { onCallStarted, onCallEnded };

  const isCaller = Boolean(userId && remoteId && userId < remoteId);

  const stop = useCallback(async () => {
    if (stopping.current) return;
    stopping.current = true;
    if (channel.current && userId) {
      await channel.current.send({
        type: "broadcast",
        event: "signal",
        payload: { kind: "hangup", senderId: userId } satisfies SignalPayload,
      });
    }
    peer.current?.close();
    peer.current = null;
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    remoteStream.current = null;
    if (channel.current) {
      await supabase.removeChannel(channel.current);
      channel.current = null;
    }
    if (startedAt.current) {
      const seconds = Math.max(0, Math.round((Date.now() - startedAt.current) / 1000));
      startedAt.current = null;
      try {
        await callbacks.current.onCallEnded?.(seconds);
      } catch {
        // call history is best-effort
      }
    }
    setStarted(false);
    setStatus("camera off");
    setMicOn(true);
    setVideoOn(true);
    remoteDescriptionSet.current = false;
    pendingCandidates.current = [];
    redraw((value) => value + 1);
    stopping.current = false;
  }, [userId]);

  useEffect(() => {
    return () => {
      peer.current?.close();
      localStream.current?.getTracks().forEach((track) => track.stop());
      if (channel.current) void supabase.removeChannel(channel.current);
    };
  }, [roomId]);

  const sendSignal = useCallback(async (payload: SignalPayload) => {
    await channel.current?.send({ type: "broadcast", event: "signal", payload });
  }, []);

  const createPeer = useCallback(() => {
    if (peer.current || !userId || !remoteId) return peer.current;
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peer.current = connection;
    localStream.current?.getTracks().forEach((track) => connection.addTrack(track, localStream.current as MediaStream));
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal({ kind: "ice", senderId: userId, value: event.candidate.toJSON() });
      }
    };
    connection.ontrack = (event) => {
      remoteStream.current = event.streams[0] ?? null;
      if (remoteVideo.current && remoteStream.current) remoteVideo.current.srcObject = remoteStream.current;
      redraw((value) => value + 1);
    };
    connection.onconnectionstatechange = () => {
      const next = connection.connectionState;
      if (next === "connected") setStatus("connected");
      if (next === "connecting") setStatus("connecting...");
      if (next === "disconnected") setStatus("connection paused");
      if (next === "failed") setStatus("connection failed");
    };
    return connection;
  }, [remoteId, sendSignal, userId]);

  const handleSignal = useCallback(async (payload: SignalPayload) => {
    if (!userId || payload.senderId === userId) return;
    if (payload.kind === "hangup") {
      await stop();
      return;
    }
    const connection = createPeer();
    if (!connection || !payload.value) return;
    try {
      if (payload.kind === "offer") {
        await connection.setRemoteDescription(payload.value as RTCSessionDescriptionInit);
        remoteDescriptionSet.current = true;
        for (const candidate of pendingCandidates.current) await connection.addIceCandidate(candidate);
        pendingCandidates.current = [];
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await sendSignal({ kind: "answer", senderId: userId, value: answer });
      } else if (payload.kind === "answer") {
        await connection.setRemoteDescription(payload.value as RTCSessionDescriptionInit);
        remoteDescriptionSet.current = true;
        for (const candidate of pendingCandidates.current) await connection.addIceCandidate(candidate);
        pendingCandidates.current = [];
      } else if (payload.kind === "ice") {
        const candidate = payload.value as RTCIceCandidateInit;
        if (remoteDescriptionSet.current) await connection.addIceCandidate(candidate);
        else pendingCandidates.current.push(candidate);
      }
    } catch (signalError) {
      setError(signalError instanceof Error ? signalError.message : "Could not join this room.");
    }
  }, [createPeer, sendSignal, stop, userId]);

  const start = useCallback(async () => {
    if (!roomId || !userId || !remoteId) {
      setError("You need an accepted connection before starting a room.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setError("Video chat is not supported in this browser.");
      return;
    }
    try {
      setError("");
      setStatus("asking for camera...");
      localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideo.current) {
        localVideo.current.srcObject = localStream.current;
        await localVideo.current.play().catch(() => undefined);
      }
      const roomChannel = supabase.channel(`video-room:${roomId}`, { config: { broadcast: { ack: true } } });
      roomChannel.on("broadcast", { event: "signal" }, ({ payload }) => {
        void handleSignal(payload as SignalPayload);
      });
      channel.current = roomChannel;
      await new Promise<void>((resolve, reject) => {
        roomChannel.subscribe((state) => {
          if (state === "SUBSCRIBED") resolve();
          if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") reject(new Error("Could not connect to this room."));
        });
      });
      const connection = createPeer();
      setStarted(true);
      setStatus("waiting for your person...");
      startedAt.current = Date.now();
      try {
        await callbacks.current.onCallStarted?.();
      } catch {
        // call history is best-effort
      }
      if (connection && isCaller) {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await sendSignal({ kind: "offer", senderId: userId, value: offer });
      }
    } catch (mediaError) {
      setStatus("camera off");
      setError(mediaError instanceof Error && mediaError.name === "NotAllowedError" ? "Camera or microphone permission was denied." : "Could not open your camera. Check your browser permissions.");
    }
  }, [createPeer, handleSignal, isCaller, remoteId, roomId, sendSignal, userId]);

  const toggleMic = useCallback(() => {
    const next = !micOn;
    localStream.current?.getAudioTracks().forEach((track) => { track.enabled = next; });
    setMicOn(next);
  }, [micOn]);

  const toggleVideo = useCallback(() => {
    const next = !videoOn;
    localStream.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
    setVideoOn(next);
  }, [videoOn]);

  return { localVideo, remoteVideo, start, stop, toggleMic, toggleVideo, status, error, started, micOn, videoOn, hasRemoteVideo: Boolean(remoteStream.current) };
}