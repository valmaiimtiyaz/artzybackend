require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 5000;

// MIDDLEWARE
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// DATABASE CONNECTION
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.connect((err) => {
  if (err) {
    console.error("Failed to connect to Database:", err);
  } else {
    console.log("✅ PostgreSQL Connected (Ready for Cloud)!");
  }
});

// AUTH MIDDLEWARE
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Token required!" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token invalid or expired" });
    req.user = user;
    next();
  });
};

// ROUTES
app.get("/", (req, res) => {
  res.send("Backend Artzy is Running on Vercel! 🚀");
});

// AUTHENTICATION 
// 1. REGISTER
app.post("/api/auth/register", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const check = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (check.rows.length > 0)
      return res.status(400).json({ error: "Email already in use!" });

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email",
      [username, email, hashed]
    );
    res
      .status(201)
      .json({ message: "Register Success!", user: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// 2. LOGIN
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (result.rows.length === 0)
      return res.status(400).json({ error: "Email not found!" });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Wrong password!" });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({
      message: "Login success!",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        profile_pic: user.profile_pic,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// 3. GET MY PROFILE
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, first_name, last_name, profile_pic, join_date FROM users WHERE id = $1",
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "Failed to get profile!" });
  }
});

// 4. UPDATE PROFILE
app.put("/api/users/profile", authenticateToken, async (req, res) => {
  const { first_name, last_name, username, email, profile_pic } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users 
       SET first_name = $1, last_name = $2, username = $3, email = $4, profile_pic = $5 
       WHERE id = $6 
       RETURNING id, username, email, first_name, last_name, profile_pic`,
      [first_name, last_name, username, email, profile_pic, req.user.id]
    );
    res.json({ message: "Profile updated!", user: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update profile!" });
  }
});

// 5. FORGOT PASSWORD
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Email not registered!" });

    const user = result.rows[0];
    const resetToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    // Ganti URL ini nanti dengan URL frontend Vercel kamu saat production
    const resetLink = `http://localhost:5173/reset-password/${resetToken}`;

    console.log("Reset link:", resetLink);
    res.json({
      message: "Reset link has been sent to console (see backend terminal)",
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// 6. ADD ARTWORK
app.post("/api/artworks", authenticateToken, async (req, res) => {
  const { image, title, artist, year, category, description } = req.body;
  try {
    const categoryResult = await pool.query(
      "SELECT id FROM categories WHERE name = $1",
      [category]
    );

    if (categoryResult.rows.length === 0) {
      return res.status(400).json({ error: "Category invalid!" });
    }
    const categoryId = categoryResult.rows[0].id;
    const result = await pool.query(
      `INSERT INTO artworks 
       (user_id, image, title, artist, year, category_id, description, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
       RETURNING *`,
      [
        req.user.id,
        image,
        title,
        artist,
        year || null,
        categoryId,
        description || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to save artwork!" });
  }
});

// 7. GET MY ARTWORKS 
app.get("/api/artworks", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         artworks.*, 
         categories.name as category,
         -- Tambahan: Hitung jumlah like
         (SELECT COUNT(*) FROM likes WHERE artwork_id = artworks.id) as like_count,
         -- Tambahan: Cek apakah user sendiri pernah nge-like karyanya (opsional)
         (SELECT COUNT(*) FROM likes WHERE artwork_id = artworks.id AND user_id = $1) > 0 as is_liked
       FROM artworks
       LEFT JOIN categories ON artworks.category_id = categories.id
       WHERE artworks.user_id = $1 
       ORDER BY artworks.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to get gallery!" });
  }
});

// 8. GET SINGLE ARTWORK 
app.get("/api/artworks/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         artworks.*, 
         categories.name as category 
       FROM artworks
       LEFT JOIN categories ON artworks.category_id = categories.id
       WHERE artworks.id = $1 AND artworks.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Artwork not found!" });
    res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// 9. UPDATE ARTWORK
app.put("/api/artworks/:id", authenticateToken, async (req, res) => {
  const { image, title, artist, year, category, description } = req.body;
  const { id } = req.params;

  try {
    const categoryResult = await pool.query(
      "SELECT id FROM categories WHERE name = $1",
      [category]
    );
    const categoryId =
      categoryResult.rows.length > 0 ? categoryResult.rows[0].id : null;

    const result = await pool.query(
      `UPDATE artworks 
       SET image = $1, title = $2, artist = $3, year = $4, category_id = $5, description = $6 
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [
        image,
        title,
        artist,
        year || null,
        categoryId,
        description || null,
        id,
        req.user.id,
      ]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Artwork not found or unauthorized" });
    }

    res.json({
      message: "Artwork updated successfully!",
      artwork: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update artwork!" });
  }
});

// 10. DELETE ARTWORK
app.delete("/api/artworks/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM artworks WHERE id = $1 AND user_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    res.json({ message: "Artwork deleted!" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete!" });
  }
});

// 11. GET USER PUBLIC GALLERY + LIKE
app.get("/api/artworks/user/:username", async (req, res) => {
  const { username } = req.params;
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  let currentUserId = null;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      currentUserId = decoded.id;
    } catch (e) {
    }
  }

  try {
    const userResult = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const targetUserId = userResult.rows[0].id;
    const artworksResult = await pool.query(
      `SELECT 
         artworks.*, 
         categories.name as category,
         (SELECT COUNT(*) FROM likes WHERE artwork_id = artworks.id) as like_count,
         (SELECT COUNT(*) FROM likes WHERE artwork_id = artworks.id AND user_id = $2) > 0 as is_liked
       FROM artworks 
       LEFT JOIN categories ON artworks.category_id = categories.id
       WHERE artworks.user_id = $1 
       ORDER BY artworks.created_at DESC`,
      [targetUserId, currentUserId]
    );

    res.json(artworksResult.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// 12. TOGGLE LIKE (LIKE / UNLIKE)
app.post("/api/artworks/:id/like", authenticateToken, async (req, res) => {
  const artworkId = req.params.id;
  const userId = req.user.id;

  try {
    const check = await pool.query(
      "SELECT * FROM likes WHERE user_id = $1 AND artwork_id = $2",
      [userId, artworkId]
    );

    if (check.rows.length > 0) {
      await pool.query(
        "DELETE FROM likes WHERE user_id = $1 AND artwork_id = $2",
        [userId, artworkId]
      );
      res.json({ message: "Unliked", liked: false });
    } else {
      await pool.query(
        "INSERT INTO likes (user_id, artwork_id) VALUES ($1, $2)",
        [userId, artworkId]
      );
      res.json({ message: "Liked", liked: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to toggle like" });
  }
});

// 13. GET SINGLE PUBLIC ARTWORK
app.get("/api/public/artworks/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
         artworks.*, 
         categories.name as category,
         users.username as artist_username,  -- Ambil username pemilik
         users.profile_pic as artist_profile_pic, -- Ambil foto profil pemilik
         (SELECT COUNT(*) FROM likes WHERE artwork_id = artworks.id) as like_count
       FROM artworks
       LEFT JOIN categories ON artworks.category_id = categories.id
       LEFT JOIN users ON artworks.user_id = users.id -- Join ke tabel users
       WHERE artworks.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Artwork not found!" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

module.exports = app;
