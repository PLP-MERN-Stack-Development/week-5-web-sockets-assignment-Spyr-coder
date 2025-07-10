const express = require("express");
const http = require("http");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const JWT_SECRET = "supersecretkey"; // 🔒 Use environment variable in production

app.use(cors());
app.use(express.json()); // Parse JSON body

// 🧠 Dummy user database
const users = {
  alice: "1234",
  bob: "abcd",
  charlie: "pass"
};

// 🛡️ Login route: returns JWT on success
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username] === password) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "1h" });
    return res.json({ token });
  }
  return res.status(401).json({ error: "Invalid credentials" });
});

// ⚡ Socket.io setup
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Frontend origin
    methods: ["GET", "POST"]
  }
});

// 🌐 Maps to track users
const socketToUsername = new Map();
const usernameToSocket = new Map();

// ✅ JWT-based authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("No token"));

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.username = payload.username;
    next();
  } catch (err) {
    console.error("JWT Error:", err.message);
    return next(new Error("Invalid token"));
  }
});

// 🌟 Main socket logic
io.on("connection", (socket) => {
  const username = socket.username;

  socketToUsername.set(socket.id, username);
  usernameToSocket.set(username, socket.id);

  console.log("✅ User joined:", username);
  console.log("🧑‍🤝‍🧑 Current users:", Array.from(usernameToSocket.keys()));

  // Broadcast join notification
  socket.broadcast.emit("receive_message", {
    sender: "System",
    text: `${username} has joined the chat.`,
    timestamp: new Date().toLocaleTimeString()
  });

  // Update all users with the online list
  io.emit("online_users", Array.from(usernameToSocket.keys()));

  socket.on("send_message", (data) => {
    io.emit("receive_message", data);
  });

  socket.on("private_message", ({ recipient, text, file, filetype, filename, timestamp }) => {
    const recipientSocket = usernameToSocket.get(recipient);
    if (recipientSocket) {
      io.to(recipientSocket).emit("receive_private_message", {
        sender: username,
        text,
        file,
        filetype,
        filename,
        timestamp: timestamp || new Date().toLocaleTimeString()
      });
    }
  });

  socket.on("typing", (isTyping) => {
    socket.broadcast.emit("typing", {
      user: username,
      isTyping
    });
  });

  socket.on("add_reaction", ({ messageIndex, emoji }) => {
    io.emit("reaction_added", {
      messageIndex,
      emoji,
      user: username
    });
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);

    const user = socketToUsername.get(socket.id);
    socketToUsername.delete(socket.id);
    usernameToSocket.delete(user);

    socket.broadcast.emit("receive_message", {
      sender: "System",
      text: `${user} has left the chat.`,
      timestamp: new Date().toLocaleTimeString()
    });

    io.emit("online_users", Array.from(usernameToSocket.keys()));
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});






