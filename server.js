const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression'); // New: Makes data transfer faster

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Ensures no cross-origin issues during live testing
});

// --- 1. CONFIG & MIDDLEWARE ---
app.use(compression()); // Compress all responses
app.use(express.static(path.join(__dirname, 'public')));

const mongoURI = process.env.MONGODB_URI;

// Optimized MongoDB Connection
mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
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

let festData = {
    overall: [
        { name: "ASKARIYYA", points: 0 },
        { name: "KUTHAIBA", points: 0 }
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

    // Immediately send the latest data to the new user
    socket.emit('initData', festData);

    socket.on('updateData', async (newData) => {
        // Validation: Don't save if data is null or undefined
        if (!newData || !newData.categories) {
            console.log(`🚫 [SOCKET] Blocked invalid data update from ${clientId}`);
            return;
        }

        festData = newData; // Update local memory

        try {
            // 1. Update Cloud (Asynchronous)
            await DataModel.findOneAndUpdate(
                { id: "master_data" }, 
                { 
                    content: newData,
                    lastUpdated: new Date() 
                }, 
                { upsert: true, new: true }
            );

            // 2. Broadcast to ALL connected clients
            io.emit('dataChanged', festData);
            console.log(`📡 [BROADCAST] Results updated by Admin (${clientId})`);
            
        } catch (err) {
            console.error(`❌ [CLOUD] Save Failure from client ${clientId}:`, err.message);
            // Optional: Notify the admin client that the save failed
            socket.emit('saveError', 'Database update failed. Please try again.');
        }
    });

    socket.on('disconnect', () => {
        console.log(`👋 [SOCKET] Client Disconnected: ${clientId}`);
    });
});

// --- 5. LIFELINE & EXCEPTION HANDLING ---

// Keep-alive route for monitoring services like UptimeRobot
app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('-------------------------------------------');
    console.log(`🚀 FEST SERVER LIVE: http://localhost:${PORT}`);
    console.log(`📅 START TIME: ${new Date().toLocaleString()}`);
    console.log('-------------------------------------------');
});

// Catch unhandled rejections to prevent server from dying
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});
