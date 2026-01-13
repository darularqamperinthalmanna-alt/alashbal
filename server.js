const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } 
});

// --- 1. CONFIG & MIDDLEWARE ---
app.use(compression()); 
app.use(express.static(path.join(__dirname, 'public')));

const mongoURI = process.env.MONGODB_URI;

// Optimized MongoDB Connection
mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 5000, 
})
.then(() => console.log("✅ [DATABASE] Cloud Connection Established"))
.catch(err => console.error("❌ [DATABASE] Connection Error:", err.message));

// --- 2. DATA SCHEMA ---
const FestSchema = new mongoose.Schema({
    id: { type: String, default: "master_data", unique: true },
    content: Object,
    lastUpdated: { type: Date, default: Date.now }
});
const DataModel = mongoose.model('FestData', FestSchema);

// Updated to match your new index.html team names
let festData = {
    overall: [
        { name: "Team Emerald", points: 0 },
        { name: "Team Ruby", points: 0 },
        { name: "Team Sapphire", points: 0 }
    ],
    categories: { subJunior: [], junior: [], senior: [] }
};

// --- 3. DATA PERSISTENCE LOGIC ---
async function restoreFromCloud() {
    try {
        const saved = await DataModel.findOne({ id: "master_data" });
        if (saved && saved.content) {
            festData = saved.content;
            console.log("📂 [SYSTEM] Cache primed from MongoDB Atlas");
        } else {
            console.log("🆕 [SYSTEM] No existing data found. Starting fresh.");
        }
    } catch (err) {
        console.error("⚠️ [SYSTEM] Critical Error during restoration:", err.message);
    }
}
restoreFromCloud();

// --- 4. REAL-TIME ENGINE ---
io.on('connection', (socket) => {
    const clientId = socket.id.substring(0, 5);
    console.log(`🔌 [SOCKET] New Client Connected: ${clientId}`);

    socket.emit('initData', festData);

    socket.on('updateData', async (newData) => {
        if (!newData || !newData.categories) {
            console.log(`🚫 [SOCKET] Blocked invalid data update from ${clientId}`);
            return;
        }

        festData = newData; 

        try {
            await DataModel.findOneAndUpdate(
                { id: "master_data" }, 
                { 
                    content: newData,
                    lastUpdated: new Date() 
                }, 
                { upsert: true, new: true }
            );

            io.emit('dataChanged', festData);
            console.log(`📡 [BROADCAST] Results updated by Admin (${clientId})`);
            
        } catch (err) {
            console.error(`❌ [CLOUD] Save Failure from client ${clientId}:`, err.message);
            socket.emit('saveError', 'Database update failed. Please try again.');
        }
    });

    socket.on('disconnect', () => {
        console.log(`👋 [SOCKET] Client Disconnected: ${clientId}`);
    });
});

// --- 5. LIFELINE & EXCEPTION HANDLING ---
app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('-------------------------------------------');
    console.log(`🚀 FEST SERVER LIVE: http://localhost:${PORT}`);
    console.log(`📅 START TIME: ${new Date().toLocaleString()}`);
    console.log('-------------------------------------------');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});
