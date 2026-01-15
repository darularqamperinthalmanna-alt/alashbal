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
// Enables Gzip compression for faster page loads
app.use(compression()); 
app.use(express.static(path.join(__dirname, 'public')));

// Retrieve MongoDB URI from Environment Variables (set this in Render/Heroku)
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

// DEFAULT DATA: Initialized with your two specific teams
let festData = {
    overall: [
        { name: "ASKARIYYA", points: 0 },
        { name: "KUTHAIBA", points: 0 }
    ],
    categories: { subJunior: [], junior: [], senior: [] }
};

// --- 3. DATA PERSISTENCE LOGIC ---
// Restores data from the cloud on server startup
async function restoreFromCloud() {
    try {
        const saved = await DataModel.findOne({ id: "master_data" });
        if (saved && saved.content) {
            festData = saved.content;
            console.log("📂 [SYSTEM] Cache primed from MongoDB Atlas");
        } else {
            console.log("🆕 [SYSTEM] No existing data found. Using code defaults.");
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

    // Send current data to the newly connected client
    socket.emit('initData', festData);

    // Handle updates from the Admin Panel
    socket.on('updateData', async (newData) => {
        if (!newData || !newData.categories) {
            console.log(`🚫 [SOCKET] Blocked invalid data update from ${clientId}`);
            return;
        }

        // Update local memory
        festData = newData; 

        try {
            // Overwrite the single document in MongoDB
            await DataModel.findOneAndUpdate(
                { id: "master_data" }, 
                { 
                    content: newData,
                    lastUpdated: new Date() 
                }, 
                { upsert: true, new: true }
            );

            // Broadcast the new data to ALL connected users (Leaderboard + Admins)
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

// --- 5. HEALTH CHECK & PORT ---
app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('-------------------------------------------');
    console.log(`🚀 FEST SERVER LIVE: http://localhost:${PORT}`);
    console.log(`📅 START TIME: ${new Date().toLocaleString()}`);
    console.log('-------------------------------------------');
});

// Global error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});
