const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// የዳታቤዝ ግንኙነት መስመር (MongoDB Atlas Connection)
const MONGODB_URI = "mongodb+srv://Alpha:406976aaa@cluster0.sgcjmyi.mongodb.net/ors_platform?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGODB_URI)
    .then(() => console.log('ORS Database Cluster Connected Successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// --- SCHEMAS ---
const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    promoCode: { type: String, unique: true }, 
    referredBy: { type: String, default: null },
    balance: { type: Number, default: 300 }, // ማንኛውም ሰው ሲገባ 300 ብር ቦነስ ይሰጣል
    isBanned: { type: Boolean, default: false },
    bankAccount: { type: String, default: '' },
    bankName: { type: String, default: '' },
    lastCheckIn: { type: String, default: '' },
    products: [{
        vipLevel: Number,
        purchasePrice: Number,
        dailyIncome: Number,
        purchasedAt: { type: Date, default: Date.now },
        lastPayoutAt: { type: Date, default: Date.now } // በየ24 ሰዓቱ ገቢ ለመስጠት መቆጣጠሪያ
    }],
    referralsCount: { type: Number, default: 0 },
    validReferrals: { type: Number, default: 0 } // ብር ዲፖዚት ያደረጉ ተጋባዦች ብዛት
});

const TransactionSchema = new mongoose.Schema({
    phone: String,
    type: { type: String, enum: ['deposit', 'withdraw'] },
    amount: Number,
    fee: { type: Number, default: 0 },
    netAmount: Number, // 15% ፊ ተቀንሶ አድሚን ላይ የሚታየው የተጣራ መጠን
    bankName: { type: String, default: '' },     // የተመዘገበው የባንክ/ቴሌብር ስም
    bankAccount: { type: String, default: '' },  // የተመዘገበው የሂሳብ ቁጥር
    status: { type: String, enum: ['pending', 'success'], default: 'pending' },
    txId: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

const AdminPromoSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    redeemedUsers: [String] 
});

const SystemConfigSchema = new mongoose.Schema({
    supportLink: { type: String, default: 'https://t.me/your_support' },
    channelLink: { type: String, default: 'https://t.me/your_channel' },
    usedTxIds: [String]
});

const User = mongoose.model('User', UserSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const AdminPromo = mongoose.model('AdminPromo', AdminPromoSchema);
const SystemConfig = mongoose.model('SystemConfig', SystemConfigSchema);

async function initConfig() {
    const config = await SystemConfig.findOne();
    if (!config) { await SystemConfig.create({}); }
}
initConfig();

// የፓስወርድ እና የስልክ ቁጥር ቅርጸትን ለማስተካከል የሚረዳ አጋዥ ፋንክሽን
function formatPhoneNumber(phone) {
    let clean = phone.replace(/[\s+]/g, ''); // ክፍት ቦታዎችን እና + ምልክትን ያጠፋል
    if (clean.startsWith('2510')) {
        clean = '0' + clean.slice(4);
    } else if (clean.startsWith('251')) {
        clean = '0' + clean.slice(3);
    }
    return clean; // ሁልጊዜም በ '09...' ወይም '07...' እንዲጀምር ያደርጋል
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    jwt.verify(token, 'ORS_SECRET_KEY_2026', async (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Forbidden' });
        if (decoded.id === 'ADMIN') {
            req.isAdmin = true;
            return next();
        }
        const user = await User.findById(decoded.id);
        if (!user || user.isBanned) return res.status(403).json({ message: 'Account suspended or not found' });
        req.user = user;
        req.isAdmin = false;
        next();
    });
};

// 💡 ማስተካከያ 1፦ ሁሉንም ስታቲክ ፋይሎች (HTML, CSS, JS) ከዋናው ዳይሬክተሪ በትክክል መጫኛ መስመር
app.use(express.static(__dirname));

// --- AUTH ROUTES ---
app.post('/api/register', async (req, res) => {
    try {
        let { phone, password, confirmPassword, promoCode } = req.body;
        if (!phone || !password || !confirmPassword) return res.status(400).json({ message: 'የሚያስፈልጉ መረጃዎችን ሙሉ ያድርጉ' });
        
        phone = formatPhoneNumber(phone.trim());
        password = password.trim();
        confirmPassword = confirmPassword.trim();

        if (password !== confirmPassword) return res.status(400).json({ message: 'የገቡት ሁለቱ የይለፍ ቃላት አይመሳሰሉም!' });

        const existingUser = await User.findOne({ phone });
        if (existingUser) return res.status(400).json({ message: 'ይህ ስልክ ቁጥር ከዚህ በፊት ተመዝግቧል!' });

        let uniquePromo = Math.floor(100000 + Math.random() * 900000).toString();
        let referredByUser = null;
        if (promoCode) { referredByUser = await User.findOne({ promoCode: promoCode.trim() }); }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            phone,
            password: hashedPassword,
            promoCode: uniquePromo,
            referredBy: referredByUser ? referredByUser.phone : null,
            balance: 300 
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
    try {
        let { phone, password } = req.body;
        if (!phone || !password) return res.status(400).json({ message: 'እባክዎ ስልክ እና ፓስወርድ ያስገቡ!' });

        phone = formatPhoneNumber(phone.trim());
        password = password.trim();
        
        if (phone === '0905295422' && password === '406976') {
            const token = jwt.sign({ id: 'ADMIN', isAdmin: true }, 'ORS_SECRET_KEY_2026');
            return res.json({ token, isAdmin: true });
        }

        const user = await User.findOne({ phone });
        if (!user) return res.status(400).json({ message: 'ያልተመዘገበ ስልክ ወይም የተሳሳተ ሚስጥር ቃል!' });
        if (user.isBanned) return res.status(400).json({ message: 'አካውንትዎ በህግ ታግዷል! እባክዎ ሰፓርት ያነጋግሩ።' });

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ message: 'የተሳሳተ ሚስጥር ቃል ገብቷል!' });

        const token = jwt.sign({ id: user._id, isAdmin: false }, 'ORS_SECRET_KEY_2026');
        res.json({ token, isAdmin: false });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- USER FEATURES ---
app.get('/api/profile', authenticateToken, async (req, res) => { res.json(req.user); });

app.post('/api/profile/update-bank', authenticateToken, async (req, res) => {
    const { bankAccount, bankName } = req.body;
    req.user.bankAccount = bankAccount;
    req.user.bankName = bankName;
    await req.user.save();
    res.json({ message: 'የባንክ አካውንት መረጃዎ ተቀምጧል!' });
});

app.post('/api/profile/change-password', authenticateToken, async (req, res) => {
    const { newPassword } = req.body;
    req.user.password = await bcrypt.hash(newPassword, 10);
    await req.user.save();
    res.json({ message: 'የይለፍ ቃልዎ በተሳካ ሁኔታ ተቀይሯል!' });
});

app.post('/api/checkin', authenticateToken, async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    if (req.user.lastCheckIn === today) {
        return res.status(400).json({ message: 'የዛሬውን ዕለታዊ ስጦታ ወስደዋል! ነገ ድጋሚ ይሞክሩ።' });
    }
    req.user.balance += 20;
    req.user.lastCheckIn = today;
    await req.user.save();
    res.json({ message: 'ዕለታዊ 20 ብር ስጦታዎን ተቀብለዋል!', newBalance: req.user.balance });
});

app.post('/api/promo-bonus', authenticateToken, async (req, res) => {
    const { code } = req.body;
    if (!code || code.trim() === "") return res.status(400).json({ message: 'እባክዎ ትክክለኛ የፕሮሞ ኮድ ያስገቡ' });

    const activePromo = await AdminPromo.findOne({ code: code.trim().toUpperCase() });
    if (!activePromo) { return res.status(400).json({ message: 'ያስገቡት የፕሮሞ ኮድ አልተገኘም!' }); }

    if (new Date() > activePromo.expiresAt) {
        return res.status(400).json({ message: 'ይህ የቦነስ ኮድ ጊዜው አልፏል!' });
    }

    if (activePromo.redeemedUsers.includes(req.user.phone)) {
        return res.status(400).json({ message: 'ይህንን የቦነስ ኮድ ከዚህ በፊት ተጠቅመውበታል!' });
    }

    const bonus = Math.floor(Math.random() * 10) + 1;
    req.user.balance += bonus;
    
    activePromo.redeemedUsers.push(req.user.phone);
    await activePromo.save();
    await req.user.save();

    res.json({ message: `እንኳን ደስ አለዎት! ${bonus} ብር የቦነስ ስጦታ አግኝተዋል።`, newBalance: req.user.balance });
});

// AUTOMATED TELEBIRR DEPOSIT VERIFICATION
app.post('/api/deposit', authenticateToken, async (req, res) => {
    const { amount, smsText, pageOpenTime } = req.body;
    
    const timeElapsed = (Date.now() - new Date(pageOpenTime).getTime()) / 1000 / 60;
    if (timeElapsed > 30) {
        return res.status(400).json({ message: 'የዲፖዚት ገጽ ክፍለ-ጊዜ (30 ደቂቃ) አልፏል! እባክዎ ገጹን ሪፍሬሽ አድርገው በድጋሚ ይሞክሩ።' });
    }

    const lowerSms = smsText.toLowerCase();
    if (!lowerSms.includes('emawayit') || !lowerSms.includes('1136') || !lowerSms.includes('dear')) {
        return res.status(400).json({ message: 'የገቡት የቴሌብር SMS ይዘት ትክክለኛ አይደለም ወይም የ"Emawayit/1136" መረጃ የለውም።' });
    }

    const matchAmt = smsText.match(/(?:received|sent|transferred)\s([0-9.,\d]+)\s?ETB/i) || smsText.match(/([0-9.,\d]+)\s?Birr/i);
    const parsedAmount = matchAmt ? parseFloat(matchAmt[1].replace(/,/g, '')) : null;

    if (!parsedAmount || parsedAmount !== parseFloat(amount)) {
        return res.status(400).json({ message: 'በSMS ላይ ያለው የገንዘብ መጠንና በመረጡት የፓኬጅ መጠን ላይ ልዩነት አለ!' });
    }

    const matchTx = smsText.match(/Transaction\s?ID\s?([A-Z0-9]+)/i) || smsText.match(/Ref\s?No\.?\s?([A-Z0-9]+)/i);
    const txId = matchTx ? matchTx[1].toUpperCase() : null;

    if (!txId) {
        return res.status(400).json({ message: 'የቴሌብር የትራንዛክሽን መለያ ቁጥር (Transaction ID) ከፅሁፉ ላይ ማግኘት አልተቻለም።' });
    }

    const config = await SystemConfig.findOne();
    if (config.usedTxIds.includes(txId)) {
        return res.status(400).json({ message: 'ይህ የትራንዛክሽን መለያ ቁጥር (Transaction ID) ቀደም ሲል ጥቅም ላይ ውሏል!' });
    }

    req.user.balance += parsedAmount;
    
    let autoVip = null;
    let dailyInc = 0;
    if (parsedAmount === 900) { autoVip = 1; dailyInc = 100; }
    else if (parsedAmount === 1800) { autoVip = 2; dailyInc = 300; }
    else if (parsedAmount === 3600) { autoVip = 3; dailyInc = 600; }
    else if (parsedAmount === 7200) { autoVip = 4; dailyInc = 1200; }
    else if (parsedAmount === 10000) { autoVip = 5; dailyInc = 1640; }

    if (autoVip) {
        req.user.products.push({ 
            vipLevel: autoVip, 
            purchasePrice: parsedAmount, 
            dailyIncome: dailyInc,
            purchasedAt: new Date(),
            lastPayoutAt: new Date()
        });
    }

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
    res.json({ message: autoVip ? `ክፍያዎ ተረጋግጧል! VIP ${autoVip} ምርት በራስ-ሰር ተገዝቷል!` : 'Deposit Approved!', balance: req.user.balance });
});

// WITHDRAW REQUESTS
app.post('/api/withdraw', authenticateToken, async (req, res) => {
    const { amount } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (req.user.products.length === 0) {
        return res.status(400).json({ message: 'የወጪ ጥያቄ ለማቅረብ ቢያንስ አንድ የቪአይፒ (VIP) ምርት መግዛት ይኖርብዎታል።' });
    }
    if (!req.user.bankAccount || !req.user.bankName) {
        return res.status(400).json({ message: 'እባክዎ መጀመሪያ በፕሮፋይልዎ ገጽ ላይ የባንክ አካውንት እና ሙሉ ስምዎን ይመዝግቡ!' });
    }
    if (withdrawAmount < 300) {
        return res.status(400).json({ message: 'አነስተኛው የወጪ መጠንገደብ 300 ብር ነው።' });
    }
    if (req.user.balance < withdrawAmount) {
        return res.status(400).json({ message: 'በቂ ቀሪ ሂሳብ (Balance) በአካውንትዎ ላይ የለም።' });
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
        bankName: req.user.bankName,
        bankAccount: req.user.bankAccount,
        status: 'pending'
    });
    res.json({ message: 'የወጪ ጥያቄዎ ለአስተዳዳሪው ተልኳል! በቅርቡ ይተላለፋል።', remainingBalance: req.user.balance });
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
    const pendingWith = await Transaction.aggregate([ { $match: { type: 'withdraw', status: 'pending' } }, { $group: { _id: null, total: { $sum: '$netAmount' } } } ]);
    
    const pendingRequests = await Transaction.find({ type: 'withdraw', status: 'pending' })
                                             .select('phone amount fee netAmount bankName bankAccount createdAt')
                                             .sort({ createdAt: -1 });

    res.json({
        totalMembers: totalUsers,
        totalDeposit: totalDep[0]?.total || 0,
        totalWithdraw: totalWith[0]?.total || 0,
        pendingWithdraw: pendingWith[0]?.total || 0, 
        pendingRequests
    });
});

app.post('/api/admin/generate-promo', verifyAdmin, async (req, res) => {
    try {
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let generatedCode = "";
        for (let i = 0; i < 6; i++) {
            generatedCode += letters.charAt(Math.floor(Math.random() * letters.length));
        }
        const expires = new Date();
        expires.setHours(expires.getHours() + 24);

        const newPromo = new AdminPromo({
            code: generatedCode,
            expiresAt: expires,
            redeemedUsers: []
        });
        await newPromo.save();
        res.json({ message: 'የቦነስ ኮድ ተፈጥሯል!', code: generatedCode });
    } catch (err) {
        res.status(500).json({ message: 'Error generating promo code' });
    }
});

app.post('/api/admin/search-user', verifyAdmin, async (req, res) => {
    let { phone } = req.body;
    phone = formatPhoneNumber(phone.trim());
    const target = await User.findOne({ phone }).select('-password');
    if (!target) return res.status(404).json({ message: 'የተጠቃሚው ስልክ ቁጥር በሲስተሙ ላይ አልተገኘም!' });
    res.json(target);
});

app.post('/api/admin/action-user', verifyAdmin, async (req, res) => {
    let { phone, action, amount } = req.body;
    phone = formatPhoneNumber(phone.trim());
    const target = await User.findOne({ phone });
    if (!target) return res.status(404).json({ message: 'User not found' });

    if (action === 'ban') target.isBanned = true;
    if (action === 'unban') target.isBanned = false;
    if (action === 'addbalance') target.balance += parseFloat(amount || 0);

    await target.save();
    res.json({ message: 'እርምጃው በተሳካ ሁኔታ ተጠናቋል!' });
});

app.post('/api/admin/approve-withdraw', verifyAdmin, async (req, res) => {
    const { id } = req.body;
    await Transaction.findByIdAndUpdate(id, { status: 'success' });
    res.json({ message: 'የወጪ ጥያቄው ፀድቋል (Approved Successfully)!' });
});

app.post('/api/admin/update-links', verifyAdmin, async (req, res) => {
    const { supportLink, channelLink } = req.body;
    await SystemConfig.updateOne({}, { supportLink, channelLink });
    res.json({ message: 'ኦፊሴላዊ የቴሌግራም መጋጠሚያ ሊንኮች ተለውጠዋል!' });
});

// 💡 ማስተካከያ 2፦ ሁሉንም ሌሎች የኤችቲኤምኤል ጥያቄዎችን (index.html, game.html ወዘተ) በትክክል ማዞሪያ (Wildcard Router)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// PASSIVE DYNAMIC VIP DAILY INCOME AUTOMATION SIMULATOR
setInterval(async () => {
    try {
        const users = await User.find({ "products.0": { $exists: true } });
        const now = new Date();
        
        for (let u of users) {
            let updated = false;
            u.products.forEach(p => {
                const totalAgeDays = (now.getTime() - new Date(p.purchasedAt).getTime()) / 1000 / 60 / 60 / 24;
                
                if (totalAgeDays <= 150) {
                    const hoursSinceLastPayout = (now.getTime() - new Date(p.lastPayoutAt).getTime()) / 1000 / 60 / 60;
                    
                    if (hoursSinceLastPayout >= 24) {
                        u.balance += p.dailyIncome;
                        p.lastPayoutAt = now;
                        updated = true;
                    }
                }
            });
            if (updated) {
                await u.save();
            }
        }
    } catch (err) {
        console.error('Error in Daily Income Scheduler:', err);
    }
}, 1000 * 60 * 30); 

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`ORS Database cluster engine online on port ${PORT}`));
