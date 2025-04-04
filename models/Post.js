const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    text: String,
    commentedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const postSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    imageUrl: String,
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    comments: [commentSchema],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", postSchema);
