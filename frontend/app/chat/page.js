"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export default function ChatPage() {
    const router = useRouter();
    const socketRef = useRef(null);
    const pcRef = useRef(null);
    const localStreamRef = useRef(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const chatEndRef = useRef(null);
    const roomIdRef = useRef(null);
    const remoteStreamRef = useRef(null);

    const [user, setUser] = useState(null);
    const [status, setStatus] = useState("idle");
    const [roomId, setRoomId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [muted, setMuted] = useState(false);
    const [cameraOff, setCameraOff] = useState(false);
    const [permGranted, setPermGranted] = useState(false);
    const [permError, setPermError] = useState("");
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const typingTimeoutRef = useRef(null);

    // WhatsApp Style Features
    const [isSwapped, setIsSwapped] = useState(false);
    const isSwappedRef = useRef(false);
    const [pos, setPos] = useState({ x: 16, y: 16 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });

    useEffect(() => {
        const stored = sessionStorage.getItem("user");
        if (!stored) {
            router.replace("/");
            return;
        }
        setUser(JSON.parse(stored));
    }, [router]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const addSystemMsg = useCallback((text) => {
        setMessages((prev) => [
            ...prev,
            { id: Date.now() + Math.random(), type: "system", text },
        ]);
    }, []);

    useEffect(() => {
        isSwappedRef.current = isSwapped;
        if (!permGranted || !localVideoRef.current || !remoteVideoRef.current) return;

        const localVideo = localVideoRef.current;
        const remoteVideo = remoteVideoRef.current;
        const localStream = localStreamRef.current;
        const remoteStream = remoteStreamRef.current;

        if (isSwapped) {
            remoteVideo.srcObject = localStream;
            localVideo.srcObject = remoteStream;
            remoteVideo.muted = true;
            localVideo.muted = false;
        } else {
            remoteVideo.srcObject = remoteStream;
            localVideo.srcObject = localStream;
            remoteVideo.muted = false;
            localVideo.muted = true;
        }
    }, [permGranted, isSwapped, status]);

    async function requestPermissions() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = stream;
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            setPermGranted(true);
        } catch (err) {
            if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
                setPermError("Permission denied. Click the lock icon in your address bar and Allow Camera/Mic.");
            } else {
                setPermError(`Error: ${err.message}`);
            }
        }
    }

    function closePeerConnection() {
        if (pcRef.current) {
            pcRef.current.onicecandidate = null;
            pcRef.current.ontrack = null;
            pcRef.current.close();
            pcRef.current = null;
        }
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        remoteStreamRef.current = null;
        roomIdRef.current = null;
        setRoomId(null);
    }

    const createPeerConnection = useCallback((rid, initiator) => {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => {
                pc.addTrack(track, localStreamRef.current);
            });
        }

        pc.onicecandidate = (e) => {
            if (e.candidate && socketRef.current) {
                socketRef.current.emit("ice-candidate", { roomId: rid, candidate: e.candidate });
            }
        };

        pc.ontrack = (e) => {
            if (e.streams[0]) {
                remoteStreamRef.current = e.streams[0];
                const localVideo = localVideoRef.current;
                const remoteVideo = remoteVideoRef.current;
                if (localVideo && remoteVideo) {
                    if (isSwappedRef.current) {
                        localVideo.srcObject = e.streams[0];
                    } else {
                        remoteVideo.srcObject = e.streams[0];
                    }
                }
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
                addSystemMsg("Stranger disconnected.");
                setStatus("idle");
            }
        };

        if (initiator) {
            pc.createOffer().then((offer) => {
                pc.setLocalDescription(offer);
                socketRef.current?.emit("offer", { roomId: rid, offer });
            });
        }
        return pc;
    }, [addSystemMsg]);

    useEffect(() => {
        if (!permGranted || !user) return;

        const socket = io(BACKEND, {
            transports: ["websocket", "polling"],
            reconnectionAttempts: 5,
        });
        socketRef.current = socket;

        socket.on("waiting", () => {
            setStatus("waiting");
            addSystemMsg("Searching for someone...");
        });

        socket.on("matched", ({ roomId: rid, initiator }) => {
            roomIdRef.current = rid;
            setRoomId(rid);
            setStatus("connected");
            setMessages([]);
            addSystemMsg("Matched! Say hello.");
            createPeerConnection(rid, initiator);
        });

        socket.on("offer", async ({ offer }) => {
            if (!pcRef.current) return;
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pcRef.current.createAnswer();
            await pcRef.current.setLocalDescription(answer);
            socket.emit("answer", { roomId: roomIdRef.current || "", answer });
        });

        socket.on("answer", async ({ answer }) => {
            if (!pcRef.current) return;
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on("ice-candidate", async ({ candidate }) => {
            if (!pcRef.current) return;
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch { }
        });

        socket.on("chat-message", ({ message, username: sender }) => {
            setIsPartnerTyping(false);
            setMessages((prev) => [
                ...prev,
                { id: Date.now() + Math.random(), type: "theirs", text: message, sender: sender || "Stranger" },
            ]);
        });

        socket.on("typing", ({ isTyping }) => {
            setIsPartnerTyping(isTyping);
        });

        socket.on("partner-left", () => {
            addSystemMsg("Stranger left.");
            setIsPartnerTyping(false);
            closePeerConnection();
            setStatus("idle");
        });

        socket.on("left-room", () => {
            closePeerConnection();
            setStatus("idle");
        });

        socket.emit("find-match");

        return () => {
            closePeerConnection();
            socket.disconnect();
        };
    }, [permGranted, user, addSystemMsg, createPeerConnection]);

    function handleNext() {
        closePeerConnection();
        setIsPartnerTyping(false);
        socketRef.current?.emit("next");
        setTimeout(() => socketRef.current?.emit("find-match"), 300);
        setStatus("waiting");
        addSystemMsg("Looking for next...");
    }

    function handleLeave() {
        closePeerConnection();
        setIsPartnerTyping(false);
        socketRef.current?.emit("leave");
        setStatus("idle");
        addSystemMsg("You left.");
    }

    function toggleMute() {
        if (!localStreamRef.current) return;
        localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !t.enabled);
        setMuted(m => !m);
    }

    function toggleCamera() {
        if (!localStreamRef.current) return;
        localStreamRef.current.getVideoTracks().forEach(t => t.enabled = !t.enabled);
        setCameraOff(c => !c);
    }

    function sendMessage(e) {
        e?.preventDefault();
        const text = chatInput.trim();
        if (!text || !roomIdRef.current || !socketRef.current) return;
        socketRef.current.emit("chat-message", { roomId: roomIdRef.current, message: text, username: user?.username });
        setMessages(prev => [...prev, { id: Date.now() + Math.random(), type: "mine", text }]);
        setChatInput("");
        socketRef.current.emit("typing", { roomId: roomIdRef.current, isTyping: false });
    }

    function handleChatKey(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    function handleLogout() {
        sessionStorage.removeItem("user");
        router.replace("/");
    }

    const onStart = (e) => {
        const clientX = e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
        dragStart.current = { x: clientX, y: clientY, initialX: pos.x, initialY: pos.y };
        setIsDragging(true);
    };

    const onMove = useCallback((e) => {
        if (!isDragging) return;
        const clientX = e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
        const deltaX = clientX - dragStart.current.x;
        const deltaY = clientY - dragStart.current.y;
        setPos({ x: dragStart.current.initialX - deltaX, y: dragStart.current.initialY + deltaY });
    }, [isDragging]);

    const onEnd = () => setIsDragging(false);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onEnd);
            window.addEventListener("touchmove", onMove, { passive: false });
            window.addEventListener("touchend", onEnd);
        } else {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onEnd);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("touchend", onEnd);
        }
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onEnd);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("touchend", onEnd);
        };
    }, [isDragging, onMove]);

    if (!user) return null;

    if (!permGranted) {
        return (
            <div className="permission-page">
                <div className="permission-card">
                    <div className="permission-icon"><i className="fa-solid fa-video" /></div>
                    <h1 className="permission-title">Camera & Mic Required</h1>
                    <p className="permission-desc">Access required for private video chat.</p>
                    {permError && <div className="alert alert-error">{permError}</div>}
                    <button className="permission-btn" onClick={requestPermissions}>Allow Access</button>
                </div>
            </div>
        );
    }

    return (
        <div className="chat-page">
            <header className="chat-header">
                <div className="header-left">
                    <span className="header-logo">PvtCall</span>
                    <div className={`status-badge ${status}`}>
                        <span className={`status-dot ${status === "waiting" ? "pulse" : ""}`} />
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                    </div>
                </div>
                <div className="header-right">
                    <div className="user-chip">{user.username}</div>
                    <button className="icon-btn danger" onClick={handleLogout}><i className="fa-solid fa-right-from-bracket" /></button>
                </div>
            </header>

            <div className="chat-body">
                <div className="video-area">
                    {status !== "connected" && (
                        <div className="video-placeholder">
                            <div className="video-placeholder-icon"><i className="fa-solid fa-satellite-dish" /></div>
                            <div className="video-placeholder-text">{status === "waiting" ? "Searching..." : "Ready"}</div>
                        </div>
                    )}

                    <video ref={remoteVideoRef} className="video-remote" autoPlay playsInline style={{ display: status === "connected" ? "block" : "none" }} />

                    <div
                        className="video-local-wrap"
                        style={{ top: `${pos.y}px`, right: `${pos.x}px`, cursor: isDragging ? 'grabbing' : 'grab' }}
                        onMouseDown={onStart} onTouchStart={onStart} onClick={() => !isDragging && setIsSwapped(!isSwapped)}
                    >
                        <video ref={localVideoRef} className="video-local" autoPlay playsInline muted />
                        <div className="swap-tip">Tap to swap</div>
                    </div>

                    <div className="video-controls">
                        <button className={`ctrl-btn ${muted ? "off" : "active"}`} onClick={toggleMute}><i className={`fa-solid ${muted ? "fa-microphone-slash" : "fa-microphone"}`} /></button>
                        <button className={`ctrl-btn ${cameraOff ? "off" : "active"}`} onClick={toggleCamera}><i className={`fa-solid ${cameraOff ? "fa-video-slash" : "fa-video"}`} /></button>
                        <button className="ctrl-btn next" onClick={handleNext}>Next</button>
                        <button className="ctrl-btn end" onClick={handleLeave}>End</button>
                    </div>
                </div>

                <aside className="sidebar">
                    <div className="sidebar-header">
                        <i className="fa-solid fa-comment" />
                        <span className="sidebar-title">Chat</span>
                    </div>

                    <div className="chat-msgs">
                        {messages.length === 0 && <div className="chat-msg system"><div className="msg-bubble">Say hi!</div></div>}
                        {messages.map((msg) => (
                            <div key={msg.id} className={`chat-msg ${msg.type}`}>
                                {msg.type !== "system" && <span className="msg-sender">{msg.type === "mine" ? "You" : msg.sender}</span>}
                                <div className="msg-bubble">{msg.text}</div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="chat-input-area">
                        {isPartnerTyping && <div className="typing-indicator"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />Stranger is typing...</div>}
                        <div className="chat-input-row">
                            <textarea
                                className="chat-input"
                                placeholder="Type..."
                                value={chatInput}
                                onChange={(e) => {
                                    setChatInput(e.target.value);
                                    if (roomIdRef.current && socketRef.current) {
                                        socketRef.current.emit("typing", { roomId: roomIdRef.current, isTyping: true });
                                        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                        typingTimeoutRef.current = setTimeout(() => {
                                            socketRef.current?.emit("typing", { roomId: roomIdRef.current, isTyping: false });
                                        }, 1500);
                                    }
                                }}
                                onKeyDown={handleChatKey}
                                disabled={status !== "connected"}
                                rows={1}
                            />
                            <button className="send-btn" onClick={sendMessage} disabled={status !== "connected" || !chatInput.trim()}><i className="fa-solid fa-paper-plane" /></button>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
