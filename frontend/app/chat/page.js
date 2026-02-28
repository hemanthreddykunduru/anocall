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

    // WhatsApp Style Features
    const [isSwapped, setIsSwapped] = useState(false);
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
        if (!permGranted || !localVideoRef.current || !remoteVideoRef.current) return;

        const localVideo = localVideoRef.current;
        const remoteVideo = remoteVideoRef.current;
        const localStream = localStreamRef.current;
        const remoteStream = remoteStreamRef.current;

        if (isSwapped) {
            // My face in big screen, Stranger in small
            remoteVideo.srcObject = localStream;
            localVideo.srcObject = remoteStream;
            remoteVideo.muted = true; // Don't hear myself
            localVideo.muted = false; // Hear stranger
        } else {
            // Stranger in big screen, My face in small
            remoteVideo.srcObject = remoteStream;
            localVideo.srcObject = localStream;
            remoteVideo.muted = false; // Hear stranger
            localVideo.muted = true; // Don't hear myself
        }
    }, [permGranted, isSwapped, status]);

    async function requestPermissions() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });
            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            setPermGranted(true);
        } catch (err) {
            if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
                setPermError(
                    "Permission denied. Click the lock icon in your address bar, set Camera & Microphone to Allow, then refresh."
                );
            } else if (err.name === "NotFoundError") {
                setPermError("No camera or microphone found. Please connect a device and refresh.");
            } else if (err.name === "NotReadableError") {
                setPermError("Your camera is already in use by another app (Teams, Zoom, Discord, etc.). Close those apps and refresh.");
            } else {
                setPermError(`Could not access camera/mic: ${err.message}. Make sure you are on http://localhost:3000`);
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
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
        roomIdRef.current = null;
        setRoomId(null);
    }

    const createPeerConnection = useCallback(
        (rid, initiator) => {
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            pcRef.current = pc;

            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach((track) => {
                    pc.addTrack(track, localStreamRef.current);
                });
            }

            pc.onicecandidate = (e) => {
                if (e.candidate && socketRef.current) {
                    socketRef.current.emit("ice-candidate", {
                        roomId: rid,
                        candidate: e.candidate,
                    });
                }
            };

            pc.ontrack = (e) => {
                if (e.streams[0]) {
                    remoteStreamRef.current = e.streams[0];
                    const localVideo = localVideoRef.current;
                    const remoteVideo = remoteVideoRef.current;

                    if (isSwapped) {
                        if (localVideo) localVideo.srcObject = e.streams[0];
                    } else {
                        if (remoteVideo) remoteVideo.srcObject = e.streams[0];
                    }
                }
            };

            pc.onconnectionstatechange = () => {
                if (
                    pc.connectionState === "disconnected" ||
                    pc.connectionState === "failed"
                ) {
                    addSystemMsg("Connection lost. Click Next to find someone new.");
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
        },
        [addSystemMsg, isSwapped]
    );

    useEffect(() => {
        if (!permGranted || !user) return;

        const socket = io(BACKEND, {
            transports: ["websocket", "polling"],
            reconnectionAttempts: 5,
        });
        socketRef.current = socket;

        socket.on("waiting", () => {
            setStatus("waiting");
            addSystemMsg("Searching for someone to chat with...");
        });

        socket.on("matched", ({ roomId: rid, initiator }) => {
            roomIdRef.current = rid;
            setRoomId(rid);
            setStatus("connected");
            setMessages([]);
            addSystemMsg("Stranger connected! Say hello.");
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
            try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            } catch { }
        });

        socket.on("partner-left", () => {
            addSystemMsg("Stranger has disconnected.");
            closePeerConnection();
            setStatus("idle");
        });

        socket.on("left-room", () => {
            closePeerConnection();
            setStatus("idle");
        });

        socket.on("chat-message", ({ message, username: sender }) => {
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now() + Math.random(),
                    type: "theirs",
                    text: message,
                    sender: sender || "Stranger",
                },
            ]);
        });

        socket.emit("find-match");

        return () => {
            closePeerConnection();
            socket.disconnect();
        };
    }, [permGranted, user, addSystemMsg, createPeerConnection]);

    function handleNext() {
        closePeerConnection();
        if (socketRef.current) {
            socketRef.current.emit("next");
            setTimeout(() => {
                if (socketRef.current) {
                    socketRef.current.emit("find-match");
                }
            }, 300);
        }
        setStatus("waiting");
        addSystemMsg("Looking for a new stranger...");
    }

    function handleLeave() {
        closePeerConnection();
        socketRef.current?.emit("leave");
        setStatus("idle");
        addSystemMsg("You left the session.");
    }

    function toggleMute() {
        if (!localStreamRef.current) return;
        localStreamRef.current.getAudioTracks().forEach((t) => {
            t.enabled = !t.enabled;
        });
        setMuted((m) => !m);
    }

    function toggleCamera() {
        if (!localStreamRef.current) return;
        localStreamRef.current.getVideoTracks().forEach((t) => {
            t.enabled = !t.enabled;
        });
        setCameraOff((c) => !c);
    }

    function sendMessage(e) {
        e?.preventDefault();
        const text = chatInput.trim();
        if (!text || !roomIdRef.current || !socketRef.current) return;
        socketRef.current.emit("chat-message", {
            roomId: roomIdRef.current,
            message: text,
            username: user?.username,
        });
        setMessages((prev) => [
            ...prev,
            { id: Date.now() + Math.random(), type: "mine", text },
        ]);
        setChatInput("");
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

    // Drag Handlers
    const onStart = (e) => {
        const clientX = e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
        dragStart.current = {
            x: clientX,
            y: clientY,
            initialX: pos.x,
            initialY: pos.y
        };
        setIsDragging(true);
    };

    const onMove = useCallback((e) => {
        if (!isDragging) return;
        const clientX = e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
        const deltaX = clientX - dragStart.current.x;
        const deltaY = clientY - dragStart.current.y;

        setPos({
            x: dragStart.current.initialX - deltaX, // Subtract because we use 'right' in CSS
            y: dragStart.current.initialY + deltaY  // Add because we use 'top' in CSS
        });
    }, [isDragging]);

    const onEnd = () => {
        setIsDragging(false);
    };

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
                    <div className="permission-icon">
                        <i className="fa-solid fa-video" />
                    </div>
                    <h1 className="permission-title">Camera & Mic Required</h1>
                    <p className="permission-desc">
                        PvtCall needs access to your camera and microphone to connect you
                        with strangers. Your video goes directly peer-to-peer — never
                        through our servers.
                    </p>
                    {permError && (
                        <div className="alert alert-error" style={{ marginBottom: 16, textAlign: "left" }}>
                            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 7 }} />
                            {permError}
                        </div>
                    )}
                    <button className="permission-btn" onClick={requestPermissions}>
                        <i className="fa-solid fa-camera" style={{ marginRight: 8 }} />
                        Allow Camera & Microphone
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="chat-page">
            <header className="chat-header">
                <div className="header-left">
                    <span className="header-logo">
                        <i className="fa-solid fa-video" style={{ marginRight: 8, fontSize: 16 }} />
                        PvtCall
                    </span>
                    <div
                        className={`status-badge ${status === "connected"
                            ? "connected"
                            : status === "waiting"
                                ? "waiting"
                                : "idle"
                            }`}
                    >
                        <span className={`status-dot ${status === "waiting" ? "pulse" : ""}`} />
                        {status === "connected"
                            ? "Connected"
                            : status === "waiting"
                                ? "Finding..."
                                : "Idle"}
                    </div>
                </div>
                <div className="header-right">
                    <div className="user-chip">
                        <i className="fa-solid fa-user" style={{ marginRight: 6, fontSize: 12 }} />
                        {user.username}
                    </div>
                    <button className="icon-btn danger" title="Logout" onClick={handleLogout}>
                        <i className="fa-solid fa-right-from-bracket" />
                    </button>
                </div>
            </header>

            <div className="chat-body">
                <div className="video-area">
                    {status !== "connected" && (
                        <div className="video-placeholder">
                            <div className="video-placeholder-icon">
                                <i className="fa-solid fa-satellite-dish" />
                            </div>
                            <div className="video-placeholder-text">
                                {status === "waiting"
                                    ? "Searching for a stranger..."
                                    : "Ready to chat"}
                            </div>
                            <div className="video-placeholder-sub">
                                {status === "idle"
                                    ? "Click Start to begin matching"
                                    : "Hang tight, pairing you up..."}
                            </div>
                        </div>
                    )}

                    <video
                        ref={remoteVideoRef}
                        className="video-remote"
                        autoPlay
                        playsInline
                        style={{ display: status === "connected" ? "block" : "none" }}
                    />

                    {status === "waiting" && (
                        <div className="finding-overlay">
                            <div className="big-spinner" />
                            <div className="finding-title">Finding a Stranger</div>
                            <div className="finding-sub">Connecting you anonymously...</div>
                        </div>
                    )}

                    <div
                        className="video-local-wrap"
                        style={{
                            top: `${pos.y}px`,
                            right: `${pos.x}px`,
                            cursor: isDragging ? 'grabbing' : 'grab'
                        }}
                        onMouseDown={onStart}
                        onTouchStart={onStart}
                        onClick={() => !isDragging && setIsSwapped(!isSwapped)}
                    >
                        <video
                            ref={localVideoRef}
                            className="video-local"
                            autoPlay
                            playsInline
                            muted
                        />
                        <div className="swap-tip">Tap to swap</div>
                    </div>

                    <div className="video-controls">
                        <button
                            className={`ctrl-btn ${muted ? "off" : "active"}`}
                            onClick={toggleMute}
                        >
                            <span className="ctrl-icon">
                                <i className={`fa-solid ${muted ? "fa-microphone-slash" : "fa-microphone"}`} />
                            </span>
                            <span className="ctrl-label">{muted ? "Unmute" : "Mute"}</span>
                        </button>

                        <button
                            className={`ctrl-btn ${cameraOff ? "off" : "active"}`}
                            onClick={toggleCamera}
                        >
                            <span className="ctrl-icon">
                                <i className={`fa-solid ${cameraOff ? "fa-video-slash" : "fa-video"}`} />
                            </span>
                            <span className="ctrl-label">{cameraOff ? "Cam On" : "Cam Off"}</span>
                        </button>

                        {status === "idle" ? (
                            <button className="ctrl-btn next" onClick={handleNext}>
                                <span className="ctrl-icon">
                                    <i className="fa-solid fa-play" />
                                </span>
                                <span className="ctrl-label">Start</span>
                            </button>
                        ) : (
                            <button className="ctrl-btn next" onClick={handleNext}>
                                <span className="ctrl-icon">
                                    <i className="fa-solid fa-forward-step" />
                                </span>
                                <span className="ctrl-label">Next</span>
                            </button>
                        )}

                        <button className="ctrl-btn end" onClick={handleLeave}>
                            <span className="ctrl-icon">
                                <i className="fa-solid fa-stop" />
                            </span>
                            <span className="ctrl-label">End</span>
                        </button>
                    </div>
                </div>

                <aside className="sidebar">
                    <div className="sidebar-header">
                        <i className="fa-solid fa-comment" style={{ fontSize: 15, color: "var(--text-secondary)" }} />
                        <span className="sidebar-title">Chat</span>
                    </div>

                    <div className="chat-msgs">
                        {messages.length === 0 && (
                            <div className="chat-msg system">
                                <div className="msg-bubble">Messages appear here once connected.</div>
                            </div>
                        )}
                        {messages.map((msg) => (
                            <div key={msg.id} className={`chat-msg ${msg.type}`}>
                                {msg.type === "theirs" && (
                                    <span className="msg-sender">{msg.sender}</span>
                                )}
                                {msg.type === "mine" && (
                                    <span className="msg-sender">You</span>
                                )}
                                <div className="msg-bubble">{msg.text}</div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="chat-input-area">
                        <textarea
                            className="chat-input"
                            placeholder={
                                status === "connected" ? "Type a message..." : "Connect to chat..."
                            }
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={handleChatKey}
                            disabled={status !== "connected"}
                            rows={1}
                        />
                        <button
                            className="send-btn"
                            onClick={sendMessage}
                            disabled={status !== "connected" || !chatInput.trim()}
                        >
                            <i className="fa-solid fa-paper-plane" style={{ fontSize: 15 }} />
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
}
