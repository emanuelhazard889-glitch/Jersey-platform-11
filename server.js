const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ors_platform')
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// --- SCHEMAS ---
const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    promoCode: { type: String, unique: true },
    referredBy: { type: String, default: null },
    balance: { type: Number, default: 300 }, // New users get 300 Birr
    isBanned: { type: Boolean, default: false },
    bankAccount: { type: String, default: '' },
    bankName: { type: String, default: '' },
    lastCheckIn: { type: String, default: '' },
    products: [{
        vipLevel: Number,
        purchasePrice: Number,
        dailyIncome: Number,
        purchasedAt: { type: Date, default: Date.now }
    }],
    referralsCount: { type: Number, default: 0 },
    validReferrals: { type: Number, default: 0 }
});

const TransactionSchema = new mongoose.Schema({
    phone: String,
    type: { type: String, enum: ['deposit', 'withdraw'] },
    amount: Number,
    fee: { type: Number, default: 0 },
    netAmount: Number,
    status: { type: String, enum: ['pending', 'success'], default: 'pending' },
    txId: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

const SystemConfigSchema = new mongoose.Schema({
    supportLink: { type: String, default: 'https://t.me/your_support' },
    channelLink: { type: String, default: 'https://t.me/your_channel' },
    usedTxIds: [String]
});

const User = mongoose.model('User', UserSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const SystemConfig = mongoose.model('SystemConfig', SystemConfigSchema);

// Initial App Config Setup
async function initConfig() {
    const config = await SystemConfig.findOne();
    if (!config) {
        await SystemConfig.create({});
    }
}
initConfig();

// --- MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    jwt.verify(token, 'ORS_SECRET_KEY_2026', async (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Forbidden' });
        const user = await User.findById(decoded.id);
        if (!user || user.isBanned) return res.status(403).json({ message: 'Account suspended or not found' });
        req.user = user;
        next();
    });
};

// --- AUTH ROUTES ---
app.post('/api/register', async (req, res) => {
    try {
        const { phone, password, confirmPassword, promoCode } = req.body;
        if (!phone || !password || !confirmPassword) return res.status(400).json({ message: 'Required fields missing' });
        if (password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match' });

        const existingUser = await User.findOne({ phone });
        if (existingUser) return res.status(400).json({ message: 'Phone number already registered' });

        // Generate 6-digit unique promo code
        let uniquePromo = Math.floor(100000 + Math.random() * 900000).toString();
        
        let referredByUser = null;
        if (promoCode) {
            referredByUser = await User.findOne({ promoCode });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            phone,
            password: hashedPassword,
            promoCode: uniquePromo,
            referredBy: referredByUser ? referredByUser.phone : null
        });

        await newUser.save();
        if (referredByUser) {
            await User.updateOne({ phone: referredByUser.phone }, { $inc: { referralsCount: 1 } });
        }

        res.status(201).json({ message: 'Registration Successful' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    // Admin Login Bypass
    if (phone === '0905295422' && password === '406976') {
        const token = jwt.sign({ id: 'ADMIN', isAdmin: true }, 'ORS_SECRET_KEY_2026');
        return res.json({ token, isAdmin: true });
    }

    const user = await User.findOne({ phone });
    if (!user || user.isBanned) return res.status(400).json({ message: 'Invalid credentials or banned account' });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, isAdmin: false }, 'ORS_SECRET_KEY_2026');
    res.json({ token, isAdmin: false });
});

// --- USER FEATURES ---
app.get('/api/profile', authenticateToken, async (req, res) => {
    res.json(req.user);
});

app.post('/api/profile/update-bank', authenticateToken, async (req, res) => {
    const { bankAccount, bankName } = req.body;
    req.user.bankAccount = bankAccount;
    req.user.bankName = bankName;
    await req.user.save();
    res.json({ message: 'Bank Info Updated' });
});

app.post('/api/profile/change-password', authenticateToken, async (req, res) => {
    const { newPassword } = req.body;
    req.user.password = await bcrypt.hash(newPassword, 10);
    await req.user.save();
    res.json({ message: 'Password Updated Successfully' });
});

// Daily Check-in (20 Birr)
app.post('/api/checkin', authenticateToken, async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    if (req.user.lastCheckIn === today) {
        return res.status(400).json({ message: 'Already checked in today. Try again tomorrow.' });
    }
    req.user.balance += 20;
    req.user.lastCheckIn = today;
    await req.user.save();
    res.json({ message: 'Checked in successfully! +20 Birr', newBalance: req.user.balance });
});

// Promo Bonus Code
app.post('/api/promo-bonus', authenticateToken, async (req, res) => {
    const { code } = req.body;
    if (!code || code.trim() === "") return res.status(400).json({ message: 'Invalid code' });
    
    // Give a random bonus between 1 and 10 Birr
    const bonus = Math.floor(Math.random() * 10) + 1;
    req.user.balance += bonus;
    await req.user.save();
    res.json({ message: `Success! You received ${bonus} Birr bonus.` });
});

// AUTOMATED TELEBIRR DEPOSIT VERIFICATION
app.post('/api/deposit', authenticateToken, async (req, res) => {
    const { amount, smsText, pageOpenTime } = req.body;
    
    // Rule 1: 30 minutes validation limit
    const timeElapsed = (Date.now() - new Date(pageOpenTime).getTime()) / 1000 / 60;
    if (timeElapsed > 30) {
        return res.status(400).json({ message: 'Transaction session expired. Please refresh the deposit page.' });
    }

    // Rule 2 & 3: Check Telebirr SMS structural criteria
    if (!smsText.includes('Emawayit') || !smsText.includes('1136') || !smsText.includes('Dear')) {
        return res.status(400).json({ message: 'Invalid or incomplete Telebirr SMS format.' });
    }

    // Extract exact amount and TxID from Telebirr standard structure
    const matchAmt = smsText.match(/(?:received|sent|transferred)\s([0-aligned.\d]+)\s?ETB/i) || smsText.match(/([0-9.]+)\s?Birr/i);
    const parsedAmount = matchAmt ? parseFloat(matchAmt[1]) : null;

    if (!parsedAmount || parsedAmount !== parseFloat(amount)) {
        return res.status(400).json({ message: 'SMS amount does not match your selected amount.' });
    }

    // Regex capture for Transaction ID (standard telebirr reference codes alphanumeric)
    const matchTx = smsText.match(/Transaction\s?ID\s?([A-Z0-9]+)/i) || smsText.match(/Ref\s?No\.?\s?([A-Z0-9]+)/i);
    const txId = matchTx ? matchTx[1] : 'TX' + Math.floor(Math.random() * 1000000);

    const config = await SystemConfig.findOne();
    if (config.usedTxIds.includes(txId)) {
        return res.status(400).json({ message: 'This Transaction ID has already been verified.' });
    }

    // Process Validated Deposit
    req.user.balance += parsedAmount;
    
    // Handle Auto-Product Purchase Based on Exact Deposited Amount Match
    let autoVip = null;
    let dailyInc = 0;
    if (parsedAmount === 900) { autoVip = 1; dailyInc = 100; }
    else if (parsedAmount === 1800) { autoVip = 2; dailyInc = 300; }
    else if (parsedAmount === 3600) { autoVip = 3; dailyInc = 600; }
    else if (parsedAmount === 7200) { autoVip = 4; dailyInc = 1200; }
    else if (parsedAmount === 10000) { autoVip = 5; dailyInc = 1640; }

    if (autoVip) {
        req.user.products.push({ vipLevel: autoVip, purchasePrice: parsedAmount, dailyIncome: dailyInc });
    }

    // Multi-Level Referral Commissions System (Level 1: 20%, Level 2: 2%, Level 3: 1%)
    if (req.user.referredBy) {
        const lvl1 = await User.findOne({ phone: req.user.referredBy });
        if (lvl1) {
            lvl1.balance += (parsedAmount * 0.20);
            lvl1.validReferrals += 1;
            await lvl1.save();

            if (lvl1.referredBy) {
                const lvl2 = await User.findOne({ phone: lvl1.referredBy });
                if (lvl2) {
                    lvl2.balance += (parsedAmount * 0.02);
                    await lvl2.save();

                    if (lvl2.referredBy) {
                        const lvl3 = await User.findOne({ phone: lvl2.referredBy });
                        if (lvl3) {
                            lvl3.balance += (parsedAmount * 0.01);
                            await lvl3.save();
                        }
                    }
                }
            }
        }
    }

    config.usedTxIds.push(txId);
    await config.save();
    await req.user.save();

    await Transaction.create({ phone: req.user.phone, type: 'deposit', amount: parsedAmount, netAmount: parsedAmount, status: 'success', txId });

    res.json({ message: autoVip ? `Deposit auto-verified! VIP ${autoVip} Purchased!` : 'Deposit Approved!', balance: req.user.balance });
});

// WITHDRAW REQUESTS WITH 15% DEDUCTION
app.post('/api/withdraw', authenticateToken, async (req, res) => {
    const { amount } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (req.user.products.length === 0) {
        return res.status(400).json({ message: 'You must purchase a VIP Product before making withdrawals.' });
    }
    if (withdrawAmount < 300) {
        return res.status(400).json({ message: 'Minimum withdrawal limit is 300 Birr.' });
    }
    if (req.user.balance < withdrawAmount) {
        return res.status(400).json({ message: 'Inadequate account balance.' });
    }

    const fee = withdrawAmount * 0.15;
    const netAmount = withdrawAmount - fee;

    req.user.balance -= withdrawAmount;
    await req.user.save();

    await Transaction.create({
        phone: req.user.phone,
        type: 'withdraw',
        amount: withdrawAmount,
        fee: fee,
        netAmount: netAmount,
        status: 'pending'
    });

    res.json({ message: 'Withdraw request forwarded to Administrator panel.', remainingBalance: req.user.balance });
});

app.get('/api/history', authenticateToken, async (req, res) => {
    const history = await Transaction.find({ phone: req.user.phone }).sort({ createdAt: -1 });
    res.json(history);
});

app.get('/api/system-links', async (req, res) => {
    const config = await SystemConfig.findOne();
    res.json(config);
});

// --- ADMIN SYSTEM ENDPOINTS ---
const verifyAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Denied' });

    jwt.verify(token, 'ORS_SECRET_KEY_2026', (err, decoded) => {
        if (err || !decoded.isAdmin) return res.status(403).json({ message: 'Access Denied' });
        next();
    });
};

app.get('/api/admin/dashboard', verifyAdmin, async (req, res) => {
    const totalUsers = await User.countDocuments();
    const totalDep = await Transaction.aggregate([ { $match: { type: 'deposit', status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' } } } ]);
    const totalWith = await Transaction.aggregate([ { $match: { type: 'withdraw', status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' } } } ]);
    const pendingWith = await Transaction.aggregate([ { $match: { type: 'withdraw', status: 'pending' } }, { $group: { _id: null, total: { $sum: '$amount' } } } ]);
    const pendingRequests = await Transaction.find({ type: 'withdraw', status: 'pending' });

    res.json({
        totalMembers: totalUsers,
        totalDeposit: totalDep[0]?.total || 0,
        totalWithdraw: totalWith[0]?.total || 0,
        pendingWithdraw: pendingWith[0]?.total || 0,
        pendingRequests
    });
});

app.post('/api/admin/search-user', verifyAdmin, async (req, res) => {
    const { phone } = req.body;
    const target = await User.findOne({ phone }).select('-password');
    if (!target) return res.status(404).json({ message: 'User profile not found' });
    res.json(target);
});

app.post('/api/admin/action-user', verifyAdmin, async (req, res) => {
    const { phone, action, amount } = req.body;
    const target = await User.findOne({ phone });
    if (!target) return res.status(404).json({ message: 'User not found' });

    if (action === 'ban') target.isBanned = true;
    if (action === 'unban') target.isBanned = false;
    if (action === 'addbalance') target.balance += parseFloat(amount || 0);

    await target.save();
    res.json({ message: 'Operation executed successfully' });
});

app.post('/api/admin/approve-withdraw', verifyAdmin, async (req, res) => {
    const { txId } = req.body;
    await Transaction.findByIdAndUpdate(txId, { status: 'success' });
    res.json({ message: 'Withdrawal instance approved successfully.' });
});

app.post('/api/admin/update-links', verifyAdmin, async (req, res) => {
    const { supportLink, channelLink } = req.body;
    await SystemConfig.updateOne({}, { supportLink, channelLink });
    res.json({ message: 'Official structural Links reconfigured.' });
});

// Background Cron-job Simulator (Every 24 Hours adds passive VIP Interest income)
setInterval(async () => {
    const users = await User.find({ "products.0": { $exists: true } });
    for (let u of users) {
        let gain = 0;
        u.products.forEach(p => {
            const ageDays = (Date.now() - new Date(p.purchasedAt).getTime()) / 1000 / 60 / 60 / 24;
            if (ageDays <= 150) gain += p.dailyIncome;
        });
        if (gain > 0) {
            u.balance += gain;
            await u.save();
        }
    }
}, 1000 * 60 * 60 * 24);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`ORS System cluster active on port ${PORT}`));
