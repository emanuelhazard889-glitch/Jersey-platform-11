const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================== ዳታቤዝ አደረጃጀት (DATABASE) ==================
const db = new sqlite3.Database("./db.sqlite");

db.serialize(() => {
  // ተጠቃሚዎች
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE,
    password TEXT,
    balance REAL DEFAULT 300,
    referral TEXT,
    parent TEXT,
    is_banned INTEGER DEFAULT 0,
    telebirr_acc TEXT,
    telebirr_name TEXT,
    last_checkin TEXT
  )`);

  // የቪአይፒ ምርቶች
  db.run(`CREATE TABLE IF NOT EXISTS vip (
    id INTEGER PRIMARY KEY,
    name TEXT,
    price REAL,
    daily REAL,
    days INTEGER,
    image_type TEXT
  )`);

  // ግዢዎች
  db.run(`CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT,
    vipId INTEGER,
    daily_income REAL,
    time TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // ትራንዛክሽኖች (Deposit/Income)
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT,
    type TEXT,
    amount REAL,
    status TEXT,
    txId TEXT UNIQUE,
    time TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // ብር ማውጫ (Withdraw)
  db.run(`CREATE TABLE IF NOT EXISTS withdraw (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT,
    account TEXT,
    name TEXT,
    amount REAL,
    fee REAL,
    net_amount REAL,
    status TEXT DEFAULT 'pending',
    time TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // ፕሮሞ ኮዶች
  db.run(`CREATE TABLE IF NOT EXISTS promocodes (
    code TEXT PRIMARY KEY,
    expires_at INTEGER
  )`);

  // ሲስተም ኮንፊግ (የአድሚን መቀያየሪያ)
  db.run(`CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // VIP መረጃዎችን ማስገባት
  const vipData = [
    [1, "VIP 1", 900, 100, 150, "🥉 Bronze Medal"],
    [2, "VIP 2", 1800,300 , 150, "🥈 Silver Medal"],
    [3, "VIP 3", 3600, 650, 150, "🥇 Gold Medal"],
    [4, "VIP 4", 7200, 1380, 150, "💎 Diamond Image"],
    [5, "VIP 5", 10000, 1940, 150, "👑 Crown/VIP 5"]
  ];
  vipData.forEach(v => {
    db.run("INSERT OR IGNORE INTO vip VALUES (?,?,?,?,?,?)", v);
  });

  // Default config ማስገባት
  db.run("INSERT OR IGNORE INTO system_config VALUES ('tg_channel', 'https://t.me/Jersey_official')");
  db.run("INSERT OR IGNORE INTO system_config VALUES ('support_link', '@Jersey_Hfc1')");
  db.run("INSERT OR IGNORE INTO system_config VALUES ('admin_phone', '0905295422')");
  db.run("INSERT OR IGNORE INTO system_config VALUES ('admin_name', 'AMANUEAL')");
});

// Helper configuration reader
async function getConfig() {
  return new Promise((resolve) => {
    db.all("SELECT * FROM system_config", (err, rows) => {
      let cfg = {};
      if (rows) {
        rows.forEach(r => cfg[r.key] = r.value);
      }
      resolve(cfg);
    });
  });
}

// ================== ሰርቨር ሎጂክ (BACKEND APIS) ==================

// REGISTER
app.post("/api/register", (req, res) => {
  const { phone, password, ref } = req.body;
  const myRefCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  db.run("INSERT INTO users(phone, password, balance, referral, parent) VALUES (?, ?, 300, ?, ?)", 
    [phone, password, myRefCode, ref || null], (err) => {
      if (err) return res.status(400).json({ error: "ይህ ስልክ ቁጥር አስቀድሞ ተመዝግቧል!" });
      res.json({ success: true });
  });
});

// LOGIN
app.post("/api/login", (req, res) => {
  const { phone, password } = req.body;
  db.get("SELECT * FROM users WHERE phone=? AND password=?", [phone, password], (err, user) => {
    if (!user) return res.status(400).json({ error: "የተሳሳተ ስልክ ወይም ፓስዎርድ!" });
    if (user.is_banned === 1) return res.status(403).json({ error: "አካውንትዎ ታግዷል (Banned)!" });
    res.json(user);
  });
});

// SAVE BANK CARD
app.post("/api/save-card", (req, res) => {
  const { phone, account, name } = req.body;
  db.run("UPDATE users SET telebirr_acc=?, telebirr_name=? WHERE phone=?", [account, name, phone], () => {
    res.json({ success: true });
  });
});

// CHANGE PASSWORD
app.post("/api/change-password", (req, res) => {
  const { phone, oldPassword, newPassword } = req.body;
  db.get("SELECT password FROM users WHERE phone=?", [phone], (err, user) => {
    if(user && user.password === oldPassword) {
      db.run("UPDATE users SET password=? WHERE phone=?", [newPassword, phone], () => {
        res.json({ success: true });
      });
    } else {
      res.status(400).json({ error: "የድሮው ፓስዎርድ አልተዛመደም!" });
    }
  });
});

// CHECKIN (በቀን 20 ብር)
app.post("/api/checkin", (req, res) => {
  const { phone } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  db.get("SELECT last_checkin FROM users WHERE phone=?", [phone], (err, user) => {
    if (user && user.last_checkin === today) {
      return res.status(400).json({ error: "ዛሬ Check-in አድርገዋል። ነገ ድጋሚ ይሞክሩ!" });
    }
    db.run("UPDATE users SET balance=balance+20, last_checkin=? WHERE phone=?", [today, phone], () => {
      res.json({ success: true, bonus: 20 });
    });
  });
});

// BUY VIP PRODUCT & REFERRAL COMMISSION
app.post("/api/buy-vip", (req, res) => {
  const { phone, vipId } = req.body;
  db.get("SELECT * FROM vip WHERE id=?", [vipId], (err, vip) => {
    db.get("SELECT * FROM users WHERE phone=?", [phone], (err, user) => {
      if (user.balance < vip.price) return res.status(400).json({ error: "በቂ ባላንስ የለዎትም! እባክዎ መጀመሪያ ዲፖዚት ያድርጉ።" });
      
      db.run("UPDATE users SET balance=balance-? WHERE phone=?", [vip.price, phone], () => {
        db.run("INSERT INTO purchases(phone, vipId, daily_income) VALUES (?, ?, ?)", [phone, vipId, vip.daily]);
        
        // Referral ኮሚሽን ስሌት (Level 1=20%, Level 2=2%, Level 3=1%)
        if (user.parent) {
          db.get("SELECT * FROM users WHERE referral=?", [user.parent], (e, p1) => {
            if (p1) {
              db.run("UPDATE users SET balance=balance+? WHERE phone=?", [vip.price * 0.20, p1.phone]);
              db.run("INSERT INTO transactions(phone, type, amount, status, txId) VALUES (?, 'Commission L1', ?, 'success', ?)", [p1.phone, vip.price * 0.20, "COMM1_"+Date.now()]);
              
              if (p1.parent) {
                db.get("SELECT * FROM users WHERE referral=?", [p1.parent], (e, p2) => {
                  if (p2) {
                    db.run("UPDATE users SET balance=balance+? WHERE phone=?", [vip.price * 0.02, p2.phone]);
                    db.run("INSERT INTO transactions(phone, type, amount, status, txId) VALUES (?, 'Commission L2', ?, 'success', ?)", [p2.phone, vip.price * 0.02, "COMM2_"+Date.now()]);
                    
                    if (p2.parent) {
                      db.get("SELECT * FROM users WHERE referral=?", [p2.parent], (e, p3) => {
                        if (p3) {
                          db.run("UPDATE users SET balance=balance+? WHERE phone=?", [vip.price * 0.01, p3.phone]);
                          db.run("INSERT INTO transactions(phone, type, amount, status, txId) VALUES (?, 'Commission L3', ?, 'success', ?)", [p3.phone, vip.price * 0.01, "COMM3_"+Date.now()]);
                        }
                      });
                    }
                  }
                });
              }
            }
          });
        }
        res.json({ success: true });
      });
    });
  });
});

// DEPOSIT SUBMIT (TELEBIRR SMS PARSER)
app.post("/api/deposit", (req, res) => {
  const { phone, amount, sms } = req.body;
  const txMatch = sms.match(/transaction number is\s([A-Z0-9]+)/i);
  if (!txMatch) return res.status(400).json({ error: "የተሳሳተ የቴሌብር SMS ነው!" });
  
  const txId = txMatch[1];
  db.run("INSERT INTO transactions(phone, type, amount, status, txId) VALUES (?, 'deposit', ?, 'pending', ?)", 
    [phone, amount, txId], (err) => {
      if (err) return res.status(400).json({ error: "ይህ የትራንዛክሽን ቁጥር (TXID) ጥቅም ላይ ውሏል!" });
      res.json({ success: true });
  });
});

// WITHDRAW REQUEST
app.post("/api/withdraw", (req, res) => {
  const { phone, amount } = req.body;
  if (amount < 300) return res.status(400).json({ error: "ዝቅተኛው የማውጫ መጠን 300 ብር ነው!" });
  
  db.get("SELECT * FROM users WHERE phone=?", [phone], (err, user) => {
    if (!user.telebirr_acc) return res.status(400).json({ error: "እባክዎ መጀመሪያ በ 'My' ገጽ ላይ የባንክ ካርድ (Telebirr) ያገናኙ!" });
    if (user.balance < amount) return res.status(400).json({ error: "በቂ ባላንስ የለዎትም!" });
    
    const fee = amount * 0.15;
    const net = amount - fee;
    
    db.run("UPDATE users SET balance=balance-? WHERE phone=?", [amount, phone], () => {
      db.run("INSERT INTO withdraw(phone, account, name, amount, fee, net_amount, status) VALUES (?,?,?,?,?,?,'pending')",
        [phone, user.telebirr_acc, user.telebirr_name, amount, fee, net], () => {
          res.json({ success: true });
      });
    });
  });
});

// PROMO CODE VERIFY
app.post("/api/use-promocode", (req, res) => {
  const { phone, code } = req.body;
  const now = Date.now();
  db.get("SELECT * FROM promocodes WHERE code=? AND expires_at > ?", [code, now], (err, row) => {
    if (!row) return res.status(400).json({ error: "ኮዱ ተሳስቷል ወይም ጊዜው አልፏል!" });
    
    // Random ዕድል ስሌት (70% -> 1-10, 15% -> 11-12, 10% -> 13-14, 5% -> 15)
    let rand = Math.random() * 100;
    let prize = 5;
    if (rand <= 70) prize = Math.floor(Math.random() * 10) + 1;
    else if (rand <= 85) prize = Math.floor(Math.random() * 2) + 11;
    else if (rand <= 95) prize = Math.floor(Math.random() * 2) + 13;
    else prize = 15;

    db.run("UPDATE users SET balance=balance+? WHERE phone=?", [prize, phone], () => {
      db.run("DELETE FROM promocodes WHERE code=?", [code]); // የአንድ ጊዜ አገልግሎት
      res.json({ success: true, prize });
    });
  });
});

// USER HISTORY DATA
app.get("/api/history/:phone", (req, res) => {
  const phone = req.params.phone;
  db.all("SELECT * FROM transactions WHERE phone=?", [phone], (e, deposits) => {
    db.all("SELECT * FROM withdraw WHERE phone=?", [phone], (e, withdraws) => {
      res.json({ deposits, withdraws });
    });
  });
});

// GET USER INFO & PRODUCTS
app.get("/api/user-data/:phone", (req, res) => {
  const phone = req.params.phone;
  db.get("SELECT * FROM users WHERE phone=?", [phone], (err, user) => {
    db.all("SELECT purchases.*, vip.name, vip.image_type FROM purchases JOIN vip ON purchases.vipId = vip.id WHERE purchases.phone=?", [phone], (e, prods) => {
      res.json({ user, products: prods });
    });
  });
});

// INVITE STATS (MEMBER, RECHARGE, COMMISSION)
app.get("/api/invite-stats/:refCode", (req, res) => {
  const ref = req.params.refCode;
  db.all("SELECT phone, balance FROM users WHERE parent=?", [ref], (err, members) => {
    let count = members ? members.length : 0;
    res.json({ count });
  });
});

// 24 ሰዓት የቪአይፒ ገቢ መጨመሪያ ሰዓት (DAILY INCOME TIMER)
setInterval(() => {
  db.all("SELECT * FROM purchases", (err, rows) => {
    if (rows) {
      rows.forEach(p => {
        db.run("UPDATE users SET balance = balance + ? WHERE phone = ?", [p.daily_income, p.phone]);
        db.run("INSERT INTO transactions(phone, type, amount, status, txId) VALUES (?, 'Daily Income', ?, 'success', ?)", [p.phone, p.daily_income, "INC_"+Date.now()+"_"+p.id]);
      });
    }
  });
}, 86400000);


// ================== የአድሚን ፓነል ሎጂክ (ADMIN APIS) ==================

// GET ADMIN CONFIG & STATS
app.get("/api/admin/dashboard", async (req, res) => {
  const cfg = await getConfig();
  db.get("SELECT COUNT(*) as total_users FROM users", (e, r1) => {
    db.get("SELECT SUM(amount) as total_w FROM withdraw WHERE status='success'", (e, r2) => {
      db.get("SELECT SUM(amount) as pending_w FROM withdraw WHERE status='pending'", (e, r3) => {
        res.json({
          config: cfg,
          stats: {
            total_users: r1.total_users || 0,
            total_withdraw: r2.total_w || 0,
            pending_withdraw: r3.pending_w || 0
          }
        });
      });
    });
  });
});

// LIST WITHDRAW REQUESTS
app.get("/api/admin/withdraws", (req, res) => {
  db.all("SELECT * FROM withdraw WHERE status='pending'", (err, rows) => {
    res.json(rows);
  });
});

// APPROVE WITHDRAW
app.post("/api/admin/withdraw/approve", (req, res) => {
  const { id } = req.body;
  db.run("UPDATE withdraw SET status='success' WHERE id=?", [id], () => {
    res.json({ success: true });
  });
});

// UPDATE CONFIGS
app.post("/api/admin/update-config", (req, res) => {
  const { key, value } = req.body;
  db.run("INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)", [key, value], () => {
    res.json({ success: true });
  });
});

// CHECK USER ACCOUNT (OPEN ACCOUNT)
app.post("/api/admin/check-account", (req, res) => {
  const { phone } = req.body;
  db.get("SELECT * FROM users WHERE phone=?", [phone], (err, user) => {
    if(!user) return res.status(400).json({ error: "ተጠቃሚው አልተገኘም!" });
    res.json(user);
  });
});

// MANIPULATE ACCOUNT (ADD/SUB BALANCE, BAN)
app.post("/api/admin/action-account", (req, res) => {
  const { phone, action, amount } = req.body;
  if(action === "add") {
    db.run("UPDATE users SET balance=balance+? WHERE phone=?", [amount, phone]);
  } else if(action === "sub") {
    db.run("UPDATE users SET balance=balance-? WHERE phone=?", [amount, phone]);
  } else if(action === "ban") {
    db.run("UPDATE users SET is_banned=1 WHERE phone=?", [phone]);
  } else if(action === "unban") {
    db.run("UPDATE users SET is_banned=0 WHERE phone=?", [phone]);
  }
  res.json({ success: true });
});

// CREATE PROMO CODE (VALID FOR 9 HOURS)
app.post("/api/admin/create-promo", (req, res) => {
  let code = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  
  const expires = Date.now() + (9 * 60 * 60 * 1000); // 9 ሰዓት
  db.run("INSERT INTO promocodes VALUES (?, ?)", [code, expires], () => {
    res.json({ success: true, code });
  });
});


// ================== ሙሉ የፊት ገጽታ (FRONTEND HTML/CSS/JS) ==================
app.get("/", async (req, res) => {
  const cfg = await getConfig();
  res.send(`
<!DOCTYPE html>
<html lang="am">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Jersey Platform</title>
<style>
  :root { --primary: #00b894; --bg: #111; --card: #1d1d1d; --text: #fff; }
  body { font-family: Arial, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; }
  .screen { display: none; width: 100%; max-width: 440px; min-height: 100vh; box-sizing: border-box; padding: 20px 20px 80px 20px; position: relative; }
  .active-screen { display: block; }
  .card { background: var(--card); padding: 15px; border-radius: 12px; margin-bottom: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
  input, select, textarea { width: 100%; padding: 12px; margin: 8px 0; border: none; border-radius: 8px; background: #222; color: #fff; box-sizing: border-box; }
  button { width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 5px; }
  button:hover { background: #00a383; }
  .nav-bar { position: fixed; bottom: 0; width: 100%; max-width: 440px; background: #1a1a1a; display: flex; justify-content: space-around; padding: 10px 0; border-top: 1px solid #333; }
  .nav-item { color: #888; cursor: pointer; font-size: 14px; text-align: center; flex: 1; }
  .nav-item.active { color: var(--primary); font-weight: bold; }
  .popup { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; }
  .popup-content { background: var(--card); padding: 25px; border-radius: 15px; width: 85%; max-width: 350px; text-align: center; position: relative; }
  .close-btn { position: absolute; top: 10px; right: 15px; font-size: 20px; cursor: pointer; color: #aaa; }
  .vip-badge { font-size: 40px; margin-bottom: 10px; }
  .grid-menu { display: grid; grid-template-columns: repeat(3, 110px); gap: 10px; justify-content: center; margin-top: 15px; }
  .menu-btn { background: #252525; padding: 15px 5px; text-align: center; border-radius: 10px; cursor: pointer; font-size: 13px; border: 1px solid #333; }
</style>
</head>
<body>

<div id="scr-auth" class="screen active-screen" style="padding-top: 60px;">
  <center><h1 style="color: var(--primary);">Jersey Platform</h1></center>
  
  <div class="card" id="box-login">
    <h3>Log In (መግቢያ)</h3>
    <input type="text" id="login-phone" placeholder="Phone Number">
    <input type="password" id="login-pass" placeholder="Password">
    <button onclick="login()">Login</button>
    <p style="text-align:center; font-size:14px; color:#aaa; margin-top:15px;" onclick="toggleAuth(false)">አዲስ አካውንት ለመክፈት Register ያድርጉ</p>
  </div>

  <div class="card" id="box-register" style="display:none;">
    <h3>Register (መመዝገቢያ)</h3>
    <input type="text" id="reg-phone" placeholder="Phone Number">
    <input type="password" id="reg-pass" placeholder="Password">
    <input type="password" id="reg-confpass" placeholder="Confirm Password">
    <input type="text" id="reg-ref" placeholder="Referral Code (ከተጋበዙ)">
    <button onclick="register()">Register</button>
    <p style="text-align:center; font-size:14px; color:#aaa; margin-top:15px;" onclick="toggleAuth(true)">አካውንት ካለዎት Log In ይበሉ</p>
  </div>
</div>

<div id="pop-tg" class="popup" style="display:none;">
  <div class="popup-content">
    <span class="close-btn" onclick="closeTgPopup()">X</span>
    <h2>📢 🎉 Welcome!</h2>
    <p>ወቅታዊ መረጃዎችን እና የክፍያ ማረጋገጫዎችን ለማግኘት ይፋዊ የቴሌግራም ቻናላችንን ይቀላቀሉ!</p>
    <a href="${cfg.tg_channel}" target="_blank"><button style="background:#0088cc;">Join Telegram Channel</button></a>
  </div>
</div>

<div id="scr-home" class="screen">
  <div class="card" style="background: linear-gradient(135deg, #00b894, #00634a);">
    <p style="margin:0; font-size:14px;">ጠቅላላ ባላንስ</p>
    <h1 style="margin:5px 0;"><span class="lbl-balance">0.00</span> ETB</h1>
  </div>
  
  <div class="grid-menu">
    <div class="menu-btn" onclick="openSubPage('deposit')">💰<br>Deposit</div>
    <div class="menu-btn" onclick="openSubPage('withdraw')">💸<br>Withdraw</div>
    <div class="menu-btn" onclick="doCheckin()">📆<br>Check In</div>
    <div class="menu-btn" onclick="openSubPage('support')">🎧<br>Support</div>
    <div class="menu-btn" onclick="openSubPage('history')">📜<br>History</div>
  </div>

  <div id="home-subpages" style="margin-top: 20px;">
    <div id="sub-deposit" class="card" style="display:none;">
      <h4>Deposit Amount</h4>
      <select id="dep-amount">
        <option value="900">900 ETB</option>
        <option value="1800">1800 ETB</option>
        <option value="3600">3600 ETB</option>
        <option value="7200">7200 ETB</option>
        <option value="10000">10000 ETB</option>
      </select>
      <button onclick="confirmDepositOrder()">Confirm Deposit</button>
      
      <div id="dep-details" style="display:none; margin-top:15px; background:#222; padding:10px; border-radius:8px;">
        <p><strong>የቴሌብር ቁጥር:</strong> <span id="admin-p">${cfg.admin_phone}</span></p>
        <p><strong>ስም:</strong> <span id="admin-n">${cfg.admin_name}</span></p>
        <p><strong>መጠን:</strong> <span id="dep-amt-lbl">0</span> ETB</p>
        <textarea id="dep-sms" rows="5" placeholder="የቴሌብር SMS መልእክቱን ሙሉውን እዚህ ይለጥፉ..."></textarea>
        <button onclick="submitDepositSMS()">Submit Deposit</button>
      </div>
    </div>

    <div id="sub-withdraw" class="card" style="display:none;">
      <h4>Withdraw Money</h4>
      <p style="color:#aaa; font-size:12px;">ህጎች (Rules): ዝቅተኛ ማውጫ 300 ብር | የአገልግሎት ፊ (Fee) 15%</p>
      <input type="number" id="wit-amount" placeholder="የብር መጠን">
      <button onclick="submitWithdrawRequest()">Withdraw</button>
    </div>

    <div id="sub-support" class="card" style="display:none;">
      <h4>የደንበኞች አገልግሎት</h4>
      <a href="https://t.me/${cfg.support_link}" target="_blank"><button style="margin-bottom:10px;">🎧 Telegram Support</button></a>
      <a href="${cfg.tg_channel}" target="_blank"><button style="background:#222;">📢 Official Channel</button></a>
    </div>

    <div id="sub-history" class="card" style="display:none;">
      <h4>ትራንዛክሽን ታሪክ</h4>
      <h5>የዲፖዚት ታሪክ</h5>
      <div id="hist-deposits" style="font-size:13px; color:#aaa;"></div>
      <h5>የማውጫ ታሪክ</h5>
      <div id="hist-withdraws" style="font-size:13px; color:#aaa;"></div>
    </div>
  </div>
</div>

<div id="scr-product" class="screen">
  <h3>የእኔ ምርቶች (My Purchased Products)</h3>
  <div id="my-products-list" class="card" style="background:#252525; font-size:14px; color:#aaa;">No Product</div>

  <h3>የቪአይፒ ጥቅሎች (VIP Packages)</h3>
  <div id="vip-catalog"></div>
</div>

<div id="scr-invite" class="screen">
  <div class="card">
    <h4>የመጋበዣ ሊንክ (Referral Link)</h4>
    <input type="text" id="inv-link" readonly style="background:#333;">
  </div>
  
  <div class="card">
    <h4>የግብዣ ጥቅማጥቅሞች (Rewards)</h4>
    <p style="color:var(--primary)">Level 1 ➔ 20% commission</p>
    <p style="color:#e17055">Level 2 ➔ 2% commission</p>
    <p style="color:#0984e3">Level 3 ➔ 1% commission</p>
  </div>

  <div class="card" style="display:flex; justify-content:space-around; text-align:center;">
    <div><h3 id="inv-count">0</h3><p style="font-size:12px; color:#aaa;">Members</p></div>
    <div><h3>-</h3><p style="font-size:12px; color:#aaa;">Recharge</p></div>
    <div><h3>-</h3><p style="font-size:12px; color:#aaa;">Commission</p></div>
  </div>
</div>

<div id="scr-my" class="screen">
  <div class="card" style="text-align:center;">
    <h2 style="margin:0;"><span class="lbl-balance">0.00</span> ETB</h2>
    <p id="lbl-my-phone" style="color:#aaa; margin:5px 0;">09...</p>
  </div>

  <div class="card" onclick="toggleMyMenu('my-bank')">💳 Bank Card (Telebirr)</div>
  <div id="my-bank" class="card" style="display:none; background:#222;">
    <input type="text" id="bank-acc" placeholder="የቴሌብር ስልክ ቁጥር">
    <input type="text" id="bank-name" placeholder="የአካውንት ባለቤት ስም">
    <button onclick="saveBankCard()">Save Card</button>
  </div>

  <div class="card" onclick="toggleMyMenu('my-pass')">🔐 Change Password</div>
  <div id="my-pass" class="card" style="display:none; background:#222;">
    <input type="password" id="pass-old" placeholder="የድሮ ፓስዎርድ">
    <input type="password" id="pass-new" placeholder="አዲስ ፓስዎርድ">
    <input type="password" id="pass-conf" placeholder="አዲስ ፓስዎርድ ድጋሚ">
    <button onclick="changePassword()">Save New Password</button>
  </div>

  <div class="card" onclick="toggleMyMenu('my-promo')">🎁 Promo Code</div>
  <div id="my-promo" class="card" style="display:none; background:#222;">
    <input type="text" id="promo-input" placeholder="የማስተዋወቂያ ኮድ ያስገቡ">
    <button onclick="verifyPromo()">Verify Code</button>
    <a href="${cfg.tg_channel}" target="_blank"><button style="margin-top:10px; background:#0088cc;">Join Channel to get Code</button></a>
  </div>
  
  <button style="background:#d63031;" onclick="logout()">Log Out (ውጣ)</button>
</div>

<div class="nav-bar" id="main-nav-bar" style="display:none;">
  <div class="nav-item active" onclick="switchTab('home')">🏠<br>Home</div>
  <div class="nav-item" onclick="switchTab('product')">📦<br>Product</div>
  <div class="nav-item" onclick="switchTab('invite')">👥<br>Invite</div>
  <div class="nav-item" onclick="switchTab('my')">👤<br>My</div>
</div>


<div style="background:#000; color:#fff; padding:15px; font-size:12px; border-top:5px solid red; width:100%; max-width:440px; box-sizing:border-box;">
  <h3 style="color:red; margin:0 0 10px 0;">🛠️ Admin Control Dashboard</h3>
  
  <div style="background:#222; padding:10px; border-radius:8px; margin-bottom:10px;">
    <strong>Statics:</strong> Total Users: <span id="adm-st-users">0</span> | Paid: <span id="adm-st-paid">0</span> ETB | Pending: <span id="adm-st-pending">0</span> ETB
  </div>

  <div style="background:#222; padding:10px; border-radius:8px; margin-bottom:10px;">
    <strong>Links Control & Telebirr Change:</strong>
    <input type="text" id="adm-input-tg" placeholder="Telegram Channel Link">
    <input type="text" id="adm-input-support" placeholder="Support @Username">
    <input type="text" id="adm-input-phone" placeholder="Admin Telebirr Phone">
    <input type="text" id="adm-input-name" placeholder="Admin First Name">
    <button style="background:orange; padding:5px; font-size:12px;" onclick="updateAdminConfigs()">Update Details</button>
  </div>

  <div style="background:#222; padding:10px; border-radius:8px; margin-bottom:10px;">
    <strong>Create Promo Code (9 Hours):</strong>
    <button style="background:purple; padding:5px; font-size:12px;" onclick="generatePromoCode()">Generate Code</button>
    <p id="adm-promo-result" style="color:yellow; font-weight:bold; margin:5px 0;"></p>
  </div>

  <div style="background:#222; padding:10px; border-radius:8px; margin-bottom:10px;">
    <strong>Check & Manage Account:</strong>
    <input type="text" id="adm-chk-phone" placeholder="User Phone Number">
    <button style="background:blue; padding:5px; font-size:12px;" onclick="checkUserAccount()">Open Account</button>
    <div id="adm-user-card" style="display:none; margin-top:5px; color:lime;">
      <p id="adm-uc-info"></p>
      <input type="number" id="adm-uc-amt" placeholder="Amount">
      <button style="background:green; display:inline; width:45%; font-size:11px;" onclick="manageUserBalance('add')">+ Balance</button>
      <button style="background:red; display:inline; width:45%; font-size:11px;" onclick="manageUserBalance('sub')">- Balance</button>
      <button style="background:darkred; width:100%; font-size:11px; margin-top:5px;" onclick="manageUserBalance('ban')">🚫 Ban Account</button>
      <button style="background:cadetblue; width:100%; font-size:11px; margin-top:5px;" onclick="manageUserBalance('unban')">✔️ Unban Account</button>
    </div>
  </div>

  <div style="background:#222; padding:10px; border-radius:8px;">
    <strong>Withdraw Requests:</strong>
    <div id="adm-withdraw-list" style="margin-top:5px; color:cyan;">No pending requests</div>
  </div>
</div>


<script>
let currentUser = null;
const vipList = [
  { id:1, name:"VIP 1", price:900, daily:100, days:150, total:15000, badge:"🥉" },
  { id:2, name:"VIP 2", price:1800, daily:300, days:150, total:30000, badge:"🥈" },
  { id:3, name:"VIP 3", price:3600, daily:650, days:150, total:60000, badge:"🥇" },
  { id:4, name:"VIP 4", price:7200, daily:1380, days:150, total:90000, badge:"💎" },
  { id:5, name:"VIP 5", price:10000, daily:1940, days:150, total:150000, badge:"👑" }
];

function toggleAuth(showLogin) {
  document.getElementById("box-login").style.display = showLogin ? "block" : "none";
  document.getElementById("box-register").style.display = showLogin ? "none" : "block";
}

async function register() {
  const phone = document.getElementById("reg-phone").value;
  const password = document.getElementById("reg-pass").value;
  const conf = document.getElementById("reg-confpass").value;
  const ref = document.getElementById("reg-ref").value;

  if(!phone || !password || !conf) return alert("እባክዎ ሁሉንም ሳጥኖች ይሙሉ!");
  if(password !== conf) return alert("ፓስዎርድ እና ማረጋገጫው አልተዛመዱም!");

  const res = await fetch("/api/register", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ phone, password, ref })
