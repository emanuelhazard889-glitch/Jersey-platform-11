🏛️ 🜃 𝐑𝐈𝐂𝐇𝐀𝐑𝐃 🜃 ﺤ═══════ι▬▬◤:
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db.sqlite");

// USERS
db.run(
CREATE TABLE IF NOT EXISTS users (
id INTEGER PRIMARY KEY AUTOINCREMENT,
phone TEXT UNIQUE,
password TEXT,
balance REAL DEFAULT 300,
referral TEXT,
level1 TEXT,
level2 TEXT,
level3 TEXT
));

// VIP
db.run(
CREATE TABLE IF NOT EXISTS vip (
id INTEGER,
name TEXT,
price REAL,
daily REAL,
days INTEGER
));

// PURCHASES
db.run(
CREATE TABLE IF NOT EXISTS purchases (
id INTEGER PRIMARY KEY AUTOINCREMENT,
phone TEXT,
vipId INTEGER,
time TEXT DEFAULT CURRENT_TIMESTAMP
));

// TRANSACTIONS
db.run(
CREATE TABLE IF NOT EXISTS transactions (
id INTEGER PRIMARY KEY AUTOINCREMENT,
phone TEXT,
type TEXT,
amount REAL,
status TEXT,
time TEXT DEFAULT CURRENT_TIMESTAMP
));

// WITHDRAW
db.run(
CREATE TABLE IF NOT EXISTS withdraw (
id INTEGER PRIMARY KEY AUTOINCREMENT,
phone TEXT,
account TEXT,
amount REAL,
fee REAL,
status TEXT DEFAULT 'pending'
));

module.exports = db;

const db = require("./db");

const vip = [
["VIP1", 900, 120, 150],
["VIP2", 1800, 300, 150],
["VIP3", 3600, 650, 150],
["VIP4", 7200, 1380, 150],
["VIP5", 10000, 1940, 150]
];

vip.forEach((v,i)=>{
db.run("INSERT OR IGNORE INTO vip VALUES (?,?,?, ?,?)",
[i+1,...v]);
});

const express = require("express");
const db = require("./db");

const app = express();
app.use(express.urlencoded({extended:true}));

// REGISTER
app.post("/register",(req,res)=>{
const {phone,password,ref} = req.body;

db.run("INSERT INTO users(phone,password,referral) VALUES (?,?,?)",
[phone,password,ref]);

res.send("Registered");
});

// LOGIN
app.post("/login",(req,res)=>{
const {phone,password}=req.body;

db.get("SELECT * FROM users WHERE phone=? AND password=?",
[phone,password],
(err,user)=>{
if(!user) return res.send("Wrong login");
res.send(user);
});
});

app.post("/buy",(req,res)=>{
const {phone,vipId}=req.body;

db.get("SELECT * FROM vip WHERE id=?", [vipId], (e,vip)=>{

db.get("SELECT * FROM users WHERE phone=?", [phone], (e,user)=>{

if(user.balance < vip.price)
return res.send("No balance");

db.run("UPDATE users SET balance=balance-? WHERE phone=?",
[vip.price,phone]);

db.run("INSERT INTO purchases(phone,vipId) VALUES (?,?)",
[phone,vipId]);

res.send("VIP Purchased");

});
});
});

setInterval(()=>{

db.all("SELECT * FROM purchases",(e,rows)=>{

rows.forEach(p=>{

db.get("SELECT * FROM vip WHERE id=?",[p.vipId],(e,v)=>{

db.run("UPDATE users SET balance=balance+? WHERE phone=?",
[v.daily,p.phone]);

});

});

});

}, 86400000);

function referralBonus(amount){
return {
l1: amount*0.20,
l2: amount*0.02,
l3: amount*0.01
};
}

app.post("/deposit",(req,res)=>{
const {phone,amount}=req.body;

db.run("INSERT INTO transactions(phone,type,amount,status) VALUES (?,?,?,?)",
[phone,"deposit",amount,"pending"]);

res.send("Deposit sent to admin");
});

app.post("/withdraw",(req,res)=>{
const {phone,amount,account}=req.body;

const fee = amount * 0.15;

db.run("INSERT INTO withdraw(phone,account,amount,fee) VALUES (?,?,?,?)",
[phone,account,amount,fee]);

res.send("Withdraw request sent");
});

app.get("/checkin/:phone",(req,res)=>{

db.get("SELECT * FROM users WHERE phone=?",[req.params.phone],(e,u)=>{

db.run("UPDATE users SET balance=balance+20 WHERE phone=?",
[req.params.phone]);

res.send("20 ETB added");
});
});

app.get("/admin/stats",(req,res)=>{

db.all("SELECT type,SUM(amount) as total FROM transactions GROUP BY type",
(e,data)=>{
res.json(data);
});

});

app.get("/admin",(req,res)=>{

db.all("SELECT * FROM withdraw WHERE status='pending'",(e,w)=>{
res.json({
withdrawRequests:w
});
});

});

const config = {
telegram:"https://t.me/Jersey_official",
support:"@Jersey_Hfc1"
};

<!DOCTYPE html>
<html lang="am">
<head>
<meta charset="UTF-8">
<title>Withdraw Page</title>

<style>
body{
  font-family: Arial;
  background:#f4f4f4;
  display:flex;
  justify-content:center;
  align-items:center;
  height:100vh;
}

.box{
  background:white;
  padding:20px;
  width:350px;
  border-radius:10px;
  box-shadow:0 0 10px rgba(0,0,0,0.1);
}

input{
  width:100%;
  padding:10px;
  margin:8px 0;
  border:1px solid #ccc;
  border-radius:6px;
}

button{
  width:100%;
  padding:10px;
  background:#007bff;
  color:white;
  border:none;
  border-radius:6px;
  cursor:pointer;
}

.card{
  background:#e9f5ff;
  padding:10px;
  margin-top:10px;
  border-radius:6px;
}
</style>
</head>

<body>

<div class="box">

<h3>Withdraw Money</h3>

<input id="amount" type="number" placeholder="Amount">

<h4>Add Bank Card</h4>

<input id="name" type="text" placeholder="Card Holder Name">
<input id="number" type="text" placeholder="Card Number">

<button onclick="saveCard()">Save Card</button>

<div id="savedCard"></div>

<button style="margin-top:10px;" onclick="withdraw()">Withdraw</button>

</div>

<script>
function saveCard(){
  let name = document.getElementById("name").value;
  let number = document.getElementById("number").value;

  let card = {name, number};

  localStorage.setItem("bankCard", JSON.stringify(card));

  showCard();
}

function showCard(){
  let data = JSON.parse(localStorage.getItem("bankCard"));

  if(data){
    document.getElementById("savedCard").innerHTML =
      <div class="card">
        <b>Saved Card</b><br>
        Name: ${data.name}<br>
        Number: ${data.number}
      </div>;
  }
}

function withdraw(){
  let amount = document.getElementById("amount").value;
  let card = JSON.parse(localStorage.getItem("bankCard"));

  if(!amount || !card){
    alert("Fill amount and add card first");
    return;
  }

  // ⚠️ SAFE DEMO ONLY (no real transfer)
  alert("Withdraw request sent (demo only)");

  console.log({
    amount: amount,
    card: card
  });
}

showCard();
</script>

</body>
</html>

<!-- Deposit Section -->
<div class="deposit-box">
  <h2>Deposit</h2>

  <!-- Deposit Amount -->
  <label>Select Deposit Amount</label>
  <select id="depositAmount">
    <option value="900">900 ETB</option>
    <option value="1800">1800 ETB</option>
    <option value="3600">3600 ETB</option>
    <option value="7200">7200 ETB</option>
    <option value="10000">10000 ETB</option>
  </select>

  <!-- Payment Account -->
  <div class="payment-info">
    <h3>Deposit Account</h3>
    <p><strong>TELEBIRR</strong></p>
    <p>Name: <strong>AMANUEAL</strong></p>
    <p>ACC: <strong>0905295422</strong></p>
  </div>

  <!-- SMS Input -->
  <label>Paste Telebirr SMS Here</label>
  <textarea id="smsInput" rows="8">
Dear Amanuael ,You have transferred ETB 200.00 to abebe anmut (2519****8936) on 11/05/2026 10:02:22. Your transaction number is DEB6S7G3MU. The service fee is ETB 1.74 and 15% VAT on the service fee is ETB 0.26. Your current E-Money Account balance is ETB 2,344.00. To download your payment information please click this link: https://transactioninfo.ethiotelecom.et/receipt/DEB6S7G3MU.
Thank you for using telebirr
Ethio telecom
  </textarea>

  <!-- Submit Button -->
  <button onclick="submitDeposit()">Submit Deposit</button>

  <!-- Result -->
  <p id="result"></p>
</div>

<style>
.deposit-box{
    width:90%;
    max-width:500px;
    margin:auto;
    padding:20px;
    background:#111;
    color:white;
    border-radius:10px;
    font-family:Arial;
}

.deposit-box h2{
    text-align:center;
    margin-bottom:20px;
}

.deposit-box select,
.deposit-box textarea{
    width:100%;
    padding:12px;
    margin-top:10px;
    margin-bottom:20px;
    border:none;
    border-radius:5px;
    background:#222;
    color:white;
}

.payment-info{
    background:#1d1d1d;
    padding:15px;
    border-radius:8px;
    margin-bottom:20px;
}

.deposit-box button{
    width:100%;
    padding:14px;
    background:#00b894;
    border:none;
    border-radius:5px;
    color:white;
    font-size:16px;
    cursor:pointer;
}

.deposit-box button:hover{
    background:#00a383;
}

#result{
    margin-top:15px;
    text-align:center;
    font-weight:bold;
}
</style>

<script>
function submitDeposit(){

    let sms = document.getElementById("smsInput").value;
    let amount = document.getElementById("depositAmount").value;

    // Transaction Number Extract
    let transactionMatch = sms.match(/transaction number is ([A-Z0-9]+)/i);

    if(!transactionMatch){
        document.getElementById("result").innerHTML =
        "Invalid Telebirr SMS!";
        return;
    }

    let transactionId = transactionMatch[1];

    // Save Used Transactions
    let usedIds = JSON.parse(localStorage.getItem("usedTransactions")) || [];

    // Check Duplicate
    if(usedIds.includes(transactionId)){
        document.getElementById("result").innerHTML =
        "This Transaction ID has already been used!";
        return;
    }

    // Save New Transaction
    usedIds.push(transactionId);
    localStorage.setItem("usedTransactions", JSON.stringify(usedIds));

    // Success
    document.getElementById("result").innerHTML =
    "Deposit Submitted Successfully!<br>Transaction ID: " + transactionId +
    "<br>Amount: " + amount + " ETB";
}
</script>

<script>
// ===== USER BALANCE =====
let userBalance = localStorage.getItem("userBalance") || 0;
document.getElementById("balance").innerText = userBalance;

// ===== SUBMIT DEPOSIT =====
function submitDeposit(){

    let sms = document.getElementById("smsInput").value;

    // ===== EXTRACT AMOUNT =====
    let amountMatch = sms.match(/ETB\s([\d,]+\.\d{2})/i);

    // ===== EXTRACT NAME =====
    let nameMatch = sms.match(/to\s(.+?)\s\(/i);

    // ===== EXTRACT NUMBER =====
    let numberMatch = sms.match(/\((2519\*+\d+)\)/i);

    // ===== EXTRACT TRANSACTION ID =====
    let transactionMatch = sms.match(/transaction number is\s([A-Z0-9]+)/i);

    // ===== CHECK SMS =====
    if(!amountMatch  !nameMatch  !numberMatch || !transactionMatch){
        alert("Invalid Telebirr SMS!");
        return;
    }

    // ===== VALUES =====
    let amount = parseFloat(
        amountMatch[1].replace(/,/g,'')
    );

    let receiverName = nameMatch[1];
    let receiverNumber = numberMatch[1];
    let transactionId = transactionMatch[1];

    // ===== CHECK DUPLICATE TRANSACTION =====
    let usedTransactions =
        JSON.parse(localStorage.getItem("usedTransactions")) || [];

    if(usedTransactions.includes(transactionId)){
        alert("This transaction ID has already been used!");
        return;
    }

    // ===== SAVE TRANSACTION =====
    usedTransactions.push(transactionId);

    localStorage.setItem(
        "usedTransactions",
        JSON.stringify(usedTransactions)
    );

    // ===== ADD BALANCE =====
    userBalance = parseFloat(userBalance) + amount;

    localStorage.setItem("userBalance", userBalance);

    // ===== UPDATE BALANCE DISPLAY =====
    document.getElementById("balance").innerText =
        userBalance.toFixed(2);

    // ===== SUCCESS MESSAGE =====
    document.getElementById("result").innerHTML = 
        <div style="color:lime">
            Deposit Successful!<br><br>

            Name: ${receiverName}<br>
            Number: ${receiverNumber}<br>
            Amount: ${amount} ETB<br>
            Transaction ID: ${transactionId}<br><br>

            New Balance: ${userBalance.toFixed(2)} ETB
        </div>
    ;

}
</script>

<!-- BALANCE -->
<h2>
Balance:
<span id="balance">0</span> ETB
</h2>

<!-- SMS INPUT -->
<textarea id="smsInput" rows="10" placeholder="Paste Telebirr SMS Here"></textarea>

<!-- SUBMIT BUTTON -->
<button onclick="submitDeposit()">
Submit Deposit
</button>

<!-- RESULT -->
<div id="result"></div>

<!-- ADMIN PANEL -->
<div class="admin-panel">

<h2>Admin Panel</h2>

<!-- USER ID -->
<input type="text" id="userId" placeholder="Enter User ID">

<!-- BALANCE -->
<input type="number" id="addBalanceAmount" placeholder="Add Balance Amount">

<!-- BUTTONS -->
<button onclick="addBalance()">Add Balance</button>

<button onclick="banUser()" class="ban-btn">
Ban User
</button>

<button onclick="unbanUser()" class="unban-btn">
Unban User
</button>

<!-- RESULT -->
<div id="adminResult"></div>

</div>

<style>
.admin-panel{
    max-width:400px;
    margin:auto;
    background:#111;
    padding:20px;
    border-radius:10px;
    color:white;
    font-family:Arial;
}

.admin-panel input{
    width:100%;
    padding:12px;
    margin-top:10px;
    border:none;
    border-radius:5px;
    background:#222;
    color:white;
}

.admin-panel button{
    width:100%;
    padding:12px;
    margin-top:12px;
    border:none;
    border-radius:5px;
    color:white;
    cursor:pointer;
    font-size:16px;
}

.ban-btn{
    background:red;
}

.unban-btn{
    background:#00b894;
}

.admin-panel button:first-of-type{
    background:#0984e3;
}

#adminResult{
    margin-top:15px;
    text-align:center;
    font-weight:bold;
}
</style>

<script>

// ===== ADD BALANCE =====
function addBalance(){

    let userId =
        document.getElementById("userId").value;

    let amount =
        parseFloat(
            document.getElementById("addBalanceAmount").value
        );

    if(!userId || !amount){
        alert("Enter User ID and Amount");
        return;
    }

    // USER BALANCE KEY
    let balanceKey = "balance_" + userId;

    // CURRENT BALANCE
    let currentBalance =
        parseFloat(localStorage.getItem(balanceKey)) || 0;

    // NEW BALANCE
    currentBalance += amount;

    // SAVE
    localStorage.setItem(balanceKey, currentBalance);

    // RESULT
    document.getElementById("adminResult").innerHTML =
        
        <span style="color:lime">
        ${amount} ETB Added Successfully<br>
        User: ${userId}<br>
        New Balance: ${currentBalance} ETB
        </span>
        ;
}

// ===== BAN USER =====
function banUser(){

    let userId =
        document.getElementById("userId").value;

    if(!userId){
        alert("Enter User ID");
        return;
    }

    localStorage.setItem(
        "banned_" + userId,
        "true"
    );

    document.getElementById("adminResult").innerHTML =
        
        <span style="color:red">
        User ${userId} Banned Successfully
        </span>
        ;
}

// ===== UNBAN USER =====
function unbanUser(){

    let userId =
        document.getElementById("userId").value;

    if(!userId){
        alert("Enter User ID");
        return;
    }

    localStorage.removeItem(
        "banned_" + userId
    );

    document.getElementById("adminResult").innerHTML =
        
        <span style="color:lime">
        User ${userId} Unbanned Successfully
        </span>
        ;
}

// ===== CHECK USER BAN =====
function checkBan(userId){

    let banned =
        localStorage.getItem(
            "banned_" + userId
        );

    if(banned === "true"){
        alert("Your Account Has Been Banned!");
        window.location.href = "banned.html";
    }

}

</script>

<!DOCTYPE html>
<html>
<head>
<title>Jersey Login</title>

<style>
body{
    font-family:Arial;
    background:#111;
    color:white;
    text-align:center;
    margin-top:100px;
}

/* LOGIN BOX */
input{
    padding:10px;
    margin:5px;
    width:200px;
}

button{
    padding:10px 20px;
    background:green;
    color:white;
    border:none;
    cursor:pointer;
}

/* POPUP */
.popup{
    display:none;
    position:fixed;
    top:0;
    left:0;
    width:100%;
    height:100%;
    background:rgba(0,0,0,0.8);
}

.popup-content{
    background:white;
    color:black;
    width:300px;
    margin:150px auto;
    padding:20px;
    border-radius:10px;
    text-align:center;
}

.popup-content a{
    display:inline-block;
    margin-top:10px;
    padding:10px;
    background:blue;
    color:white;
    text-decoration:none;
    border-radius:5px;
}
</style>
</head>

<body>

<h1>Jersey Login</h1>

<input id="user" placeholder="Username"><br>
<input id="pass" type="password" placeholder="Password"><br>

<button onclick="login()">Login</button>

<!-- POPUP -->
<div class="popup" id="popup">
    <div class="popup-content">
        <h2>🎉 Welcome!</h2>
        <p>Please join our channel</p>

        <a href="https://t.me/YOUR_CHANNEL" target="_blank">
            Join Channel
        </a>

        <br><br>
        <button onclick="closePopup()">Close</button>
    </div>
</div>

<script>

function login(){

    let user = document.getElementById("user").value;

    if(user === ""){
        alert("Enter username");
        return;
    }

    // fake login success
    document.getElementById("popup").style.display = "block";
}

function closePopup(){
    document.getElementById("popup").style.display = "none";

    // redirect after close
    window.location.href = "home.html";
}

</script>

</body>
</html

const express = require("express");
const app = express();

app.use(express.json());

// ================== FAKE DATABASE ==================
let users = [
  { id: 1, name: "user1", balance: 1000, vip: false, accountNumber: "123456" }
];

let withdrawals = [];
let deposits = [];

// ================== VIP + MIN WITHDRAW CHECK ==================
function canWithdraw(req, res, next) {
  const user = users.find(u => u.id === req.body.userId);

  if (!user) return res.json({ msg: "User not found" });

  if (!user.vip) {
    return res.json({ msg: "Withdraw blocked: VIP package required" });
  }

  if (req.body.amount < 300) {
    return res.json({ msg: "Minimum withdraw is 300 Birr" });
  }

  if (user.balance < req.body.amount) {
    return res.json({ msg: "Insufficient balance" });
  }

  req.user = user;
  next();
}

// ================== WITHDRAW REQUEST ==================
app.post("/withdraw", canWithdraw, (req, res) => {
  const { userId, amount } = req.body;

  const request = {
    id: withdrawals.length + 1,
    userId,
    amount,
    accountNumber: req.user.accountNumber,
    status: "pending"
  };

  withdrawals.push(request);

  res.json({ msg: "Withdraw request sent", request });
});

// ================== DEPOSIT REQUEST ==================
app.post("/deposit", (req, res) => {
  const { userId, amount } = req.body;

  const deposit = {
    id: deposits.length + 1,
    userId,
    amount,
    status: "pending"
  };

  deposits.push(deposit);

  res.json({ msg: "Deposit sent for approval" });
});

// ================== ADMIN WITHDRAW ACTION ==================
app.post("/admin/withdraw/action", (req, res) => {
  const { id, action } = req.body;

  const w = withdrawals.find(x => x.id === id);
  if (!w) return res.json({ msg: "Not found" });

  if (action === "approve") {
    const user = users.find(u => u.id === w.userId);
    if (user) {
      user.balance -= w.amount;
    }
  }

  // delete after action
  withdrawals = withdrawals.filter(x => x.id !== id);

  res.json({ msg: Withdraw ${action}d and removed });
});

// ================== ADMIN DEPOSIT ACTION ==================
app.post("/admin/deposit/action", (req, res) => {
  const { id, action } = req.body;

  const d = deposits.find(x => x.id === id);
  if (!d) return res.json({ msg: "Not found" });

  if (action === "approve") {
    const user = users.find(u => u.id === d.userId);
    if (user) {
      user.balance += d.amount;
    }
  }

  // delete after action
  deposits = deposits.filter(x => x.id !== id);

  res.json({ msg: Deposit ${action}d and removed });
});

// ================== ADMIN LIST ==================
app.get("/admin/withdraws", (req, res) => {
  res.json(withdrawals);
});

app.get("/admin/deposits", (req, res) => {
  res.json(deposits);
});

// ================== SERVER START ==================
app.listen(3000, () => {
  console.log("Server running on port 3000");
});
