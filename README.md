## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/reliquamarine/Artzy-BE.git
cd Artzy-BE
```

### 2. Install Dependencies

```bash
npm install express pg dotenv cors bcryptjs jsonwebtoken
```

### 3. Setup Environment Variables

Ubah nama file `.env.example` menjadi `.env` di root folden Artzy-BE nya.

Edit file `.env` dengan konfigurasi Postgre Anda:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres  # ganti sama user DB-mu
DB_PASSWORD=yourpassword
DB_NAME=artzy_db
JWT_SECRET=supersecretkey  # ganti jadi random string panjang
PORT=5000  # port backend
```

### 4. Setup Postgre

Bikin database baru, namain `artzy_db`

Bikin tabel-tabel yang diperlukan di query:

```env
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  first_name VARCHAR(50),
  last_name VARCHAR(50),
  profile_pic TEXT,
  join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE artworks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  image TEXT NOT NULL,
  title VARCHAR(100) NOT NULL,
  artist VARCHAR(100) NOT NULL,
  year DATE,
  category VARCHAR(50),
  description TEXT
);
```


### 5. Run Development Server

```bash
npm run dev
```

Aplikasi akan berjalan di `http://localhost:5000`
