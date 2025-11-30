// backend/index.js (Kode Revisi Penuh)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// DB Connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Test koneksi
pool.connect((err) => {
  if (err) console.error("Failed connect to DB:", err);
  else console.log("PostgreSQL connected!");
});

// === MIDDLEWARE AUTH ===
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) return res.status(401).json({ error: "Need token!" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token invalid/expired" });
    req.user = user; // { id: xx }
    next();
  });
};

// ================== ROUTES ==================

// 1. REGISTER
app.post("/api/auth/register", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    // Cek email udah ada belum
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
    res.status(201).json({ message: "Register Succes!", user: result.rows[0] });
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

// 3. GET PROFILE (buat Beranda & Profile page)
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

// 4. UPDATE PROFILE (EditProfilePage)
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

// 5. ADD ARTWORK
app.post("/api/artworks", authenticateToken, async (req, res) => {
  const { image, title, artist, year, category, description } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO artworks 
        (user_id, image, title, artist, year, category, description) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) 
        RETURNING *`,
      [
        req.user.id,
        image,
        title,
        artist,
        year || null,
        category,
        description || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to save artwork!" }); 
  }
});

// 6. GET ALL ARTWORKS USER (Gallery Walls)
app.get("/api/artworks", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM artworks WHERE user_id = $1 ORDER BY id DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: "Failed to get gallery!" }); 
  }
});

// 7. GET SINGLE ARTWORK (View Detail)
app.get("/api/artworks/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM artworks WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Artwork not found!" });
    res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "Server error" }); 
  }
});

// 8. DELETE ARTWORK
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

// 9. UPDATE ARTWORK 
app.put("/api/artworks/:id", authenticateToken, async (req, res) => {
  const { image, title, artist, year, category, description } = req.body;
  const { id } = req.params; 

  try {
    const result = await pool.query(
      `UPDATE artworks 
            SET image = $1, title = $2, artist = $3, year = $4, category = $5, description = $6 
            WHERE id = $7 AND user_id = $8
            RETURNING *`,
      [
        image,
        title,
        artist,
        year || null,
        category,
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

// 10. FORGOT PASSWORD
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
    const resetLink = `http://localhost:5173/reset-password/${resetToken}`;

    console.log("Reset link (manual copy to browser):", resetLink);
    // Nanti bisa pake nodemailer buat kirim email beneran

    res.json({
      message: "Reset link has been sent to console (see backend terminal)",
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/", (req, res) => {
  res.send("<center><h1>PostgreSQL Connected!</h1></center>");
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT} yah.`);
});
