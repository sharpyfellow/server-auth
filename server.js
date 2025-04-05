require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Post = require("./models/Post");

const app = express();
app.use(cors());
app.use(express.json());

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
};

// Admin middleware
// const adminMiddleware = async (req, res, next) => {
//   const user = await User.findById(req.user.id);
//   if (user && user.isAdmin) {
//     next();
//   } else {
//     res.status(403).json({ message: "Access denied" });
//   }
// };

// ✅ Forenklet adminMiddleware med rask JWT-sjekk

const adminMiddleware = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(403).json({ message: "Access denied" });
  }
};




// Register
app.post("/register", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const user = new User({
      name: req.body.name,
      email: req.body.email,
      password: hashedPassword,
    });
    await user.save();
    res.status(201).json({ message: "User registered", userId: user._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
// Oppdatert login-rute i server.js – inkluderer isAdmin i token

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

  // ✅ Inkluderer isAdmin i token-payload:
  const token = jwt.sign(
    { id: user._id, isAdmin: user.isAdmin },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.status(200).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    profileImageUrl: user.profileImageUrl,
    token,
  });
});


// Update user profile
app.put("/users/:id", authMiddleware, async (req, res) => {
  try {
    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.email) updates.email = req.body.email;
    if (req.body.profileImageUrl) updates.profileImageUrl = req.body.profileImageUrl;
    if (req.body.password) {
      const hashed = await bcrypt.hash(req.body.password, 10);
      updates.password = hashed;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create post
app.post("/posts", authMiddleware, async (req, res) => {
  try {
    const post = new Post({ ...req.body, postedBy: req.user.id });
    await post.save();
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// Get single post
app.get("/posts/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("postedBy", "name profileImageUrl")
      .populate("comments.commentedBy", "name profileImageUrl");
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.status(200).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update post
app.put("/posts/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.status(200).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete post
app.delete("/posts/:id", authMiddleware, async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Post deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add comment
app.post("/posts/:id/comments", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    post.comments.push({ text: req.body.text, commentedBy: req.user.id });
    await post.save();
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Oppdatering i server.js for å redigere kommentar

// PUT /posts/:postId/comments/:commentId
app.put("/posts/:postId/comments/:commentId", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post ikke funnet" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Kommentar ikke funnet" });

    if (comment.commentedBy.toString() !== req.user.id)
      return res.status(403).json({ message: "Ingen tilgang" });

    comment.text = req.body.text;
    await post.save();

    await post.populate("postedBy", "name profileImageUrl");
    await post.populate("comments.commentedBy", "name profileImageUrl");
    res.status(200).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// ✅ Fikset sletting av kommentar – byttet .remove() med pull()

app.delete("/posts/:postId/comments/:commentId", authMiddleware, async (req, res) => {
  try {
    console.log("req.user:", req.user);

    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post ikke funnet" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Kommentar ikke funnet" });

    const isOwner = comment.commentedBy.toString() === req.user.id;
    const isAdmin = req.user.isAdmin;

    if (!isOwner && !isAdmin)
      return res.status(403).json({ message: "Ingen tilgang til å slette denne kommentaren" });

    // 💥 Bruk pull i stedet for remove:
    post.comments.pull(comment._id);
    await post.save();

    await post.populate("postedBy", "name profileImageUrl");
    await post.populate("comments.commentedBy", "name profileImageUrl");
    res.status(200).json(post);
  } catch (err) {
    console.error("Feil ved sletting av kommentar:", err);
    res.status(500).json({ error: err.message });
  }
});





// Like/unlike post
app.post("/posts/:id/like", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const userId = req.user.id;
    const alreadyLiked = post.likes?.includes(userId);

    if (alreadyLiked) {
      post.likes = post.likes.filter((id) => id.toString() !== userId);
    } else {
      post.likes = [...(post.likes || []), userId];
    }

    await post.save();
    await post.populate("postedBy", "name profileImageUrl");
    await post.populate("comments.commentedBy", "name profileImageUrl");
    res.status(200).json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin delete user and posts
app.delete("/admin/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    await Post.deleteMany({ postedBy: req.params.id });
    res.status(200).json({ message: "Bruker og tilhørende poster slettet" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    app.listen(PORT, () => console.log("Server is running..."));
  })
  .catch((err) => console.log(err));