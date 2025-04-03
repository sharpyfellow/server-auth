const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;
const User = require("./models/User");
const Post = require("./models/Post");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Ingen token oppgitt" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Ugyldig token" });
  }
};

const adminMiddleware = async (req, res, next) => {
  const currentUser = await User.findById(req.user.id);
  if (!currentUser?.isAdmin) {
    return res.status(403).json({ message: "Kun administratorer har tilgang" });
  }
  next();
};


// Kommentarer til poster
app.post("/posts/:id/comments", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post ikke funnet" });

    const comment = {
      text: req.body.text,
      commentedBy: req.user.id,
    };

    post.comments.push(comment);
    await post.save();
    res.status(200).json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// Register
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const newUser = new User({ name, email, password: hashed });
  await newUser.save();
  res.status(201).json({ message: "User registered", userId: newUser._id });
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.status(200).json({ _id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin, profileImageUrl: user.profileImageUrl, token });
});

// GET bruker (auth)
app.get("/users/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Oppdater bruker (profilbilde)
app.put("/users/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { profileImageUrl: req.body.profileImageUrl }, { new: true });
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Hent alle brukere
app.get("/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Slett bruker + poster
app.delete("/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    await Post.deleteMany({ postedBy: userId });
    await User.findByIdAndDelete(userId);
    res.status(200).json({ message: "Bruker og poster slettet" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all posts
app.get("/posts", authMiddleware, async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("postedBy", "name profileImageUrl")
      .populate("comments.commentedBy", "name profileImageUrl");
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/posts", authMiddleware, async (req, res) => {
  const { title, description, imageUrl } = req.body;
  try {
    const newPost = new Post({ title, description, imageUrl, postedBy: req.user.id });
    await newPost.save();
    res.status(201).json(newPost);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.put("/posts/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.status(200).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/posts/:id", authMiddleware, async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Post deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hent enkelt post med kommentarer og brukerdata
app.get("/posts/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("postedBy", "name profileImageUrl")
      .populate("comments.commentedBy", "name profileImageUrl");

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.status(200).json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Connect DB and start server
mongoose.connect(process.env.MONGO_URL)
  .then(() => {
    app.listen(process.env.PORT || 3000, () => {
      console.log("Server is running...");
    });
  })
  .catch((err) => console.error("DB connection error:", err));
