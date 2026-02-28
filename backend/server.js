require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const authRoutes = require("./routes/auth");

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",") : []),
];

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("PvtCall Signaling Server is running...");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const waitingQueue = [];
const rooms = new Map();
const userSocketMap = new Map();

function removeFromQueue(socketId) {
  const idx = waitingQueue.findIndex((s) => s.id === socketId);
  if (idx !== -1) waitingQueue.splice(idx, 1);
}

function getRoomBySocket(socketId) {
  for (const [roomId, participants] of rooms.entries()) {
    if (participants.includes(socketId)) return roomId;
  }
  return null;
}

function leaveRoom(socket, io) {
  const roomId = getRoomBySocket(socket.id);
  if (roomId) {
    const participants = rooms.get(roomId) || [];
    const partner = participants.find((id) => id !== socket.id);
    if (partner) {
      io.to(partner).emit("partner-left");
    }
    rooms.delete(roomId);
    socket.leave(roomId);
    if (partner) {
      const partnerSocket = io.sockets.sockets.get(partner);
      if (partnerSocket) partnerSocket.leave(roomId);
    }
  }
}

io.on("connection", (socket) => {
  userSocketMap.set(socket.id, { connected: true, inRoom: false });

  socket.on("find-match", () => {
    leaveRoom(socket, io);
    removeFromQueue(socket.id);

    if (waitingQueue.length > 0) {
      const partnerSocket = waitingQueue.shift();
      if (!io.sockets.sockets.get(partnerSocket.id)) {
        waitingQueue.push(socket);
        return;
      }
      const roomId = `room-${socket.id}-${partnerSocket.id}`;
      rooms.set(roomId, [socket.id, partnerSocket.id]);
      socket.join(roomId);
      partnerSocket.join(roomId);
      socket.emit("matched", { roomId, initiator: true });
      partnerSocket.emit("matched", { roomId, initiator: false });
    } else {
      waitingQueue.push(socket);
      socket.emit("waiting");
    }
  });

  socket.on("offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("offer", { offer });
  });

  socket.on("answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("answer", { answer });
  });

  socket.on("ice-candidate", ({ roomId, candidate }) => {
    socket.to(roomId).emit("ice-candidate", { candidate });
  });

  socket.on("chat-message", ({ roomId, message, username }) => {
    socket.to(roomId).emit("chat-message", { message, username });
  });

  socket.on("typing", ({ roomId, isTyping }) => {
    socket.to(roomId).emit("typing", { isTyping });
  });

  socket.on("next", () => {
    leaveRoom(socket, io);
    removeFromQueue(socket.id);
    socket.emit("left-room");
  });

  socket.on("leave", () => {
    leaveRoom(socket, io);
    removeFromQueue(socket.id);
  });

  socket.on("disconnect", () => {
    leaveRoom(socket, io);
    removeFromQueue(socket.id);
    userSocketMap.delete(socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
