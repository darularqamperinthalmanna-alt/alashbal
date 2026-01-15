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

// --- 1. MIDDLEWARE ---
app.use(compression()); // Makes the leaderboard load significantly faster
app.use(express.static(path.join(__dirname, 'public')));

// --- 2. DATABASE CONNECTION ---
// Set your MONGODB_URI in Render/Heroku environment variables
const mongoURI = process.env.MONGODB_URI;

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, 
})
.then(() => console.log("✅ [DATABASE] Cloud Connection Established"))
.catch(err => console.error("❌ [DATABASE] Connection Error:", err.message));

// --- 3. DATA SCHEMA & INITIALIZATION ---
const FestSchema = new mongoose.Schema({
    id: { type: String, default: "master_data", unique: true },
    content: Object,
    lastUpdated: { type: Date, default: Date.now }
});
const DataModel = mongoose.model('FestData', FestSchema);

// Default data structure for Arqamiyya Arts
let festData = {
    overall: [
        { name: "ASKARIYYA", points: 0 },
        { name: "KUTHAIBA", points: 0 }
    ],
    categories: { subJunior: [], junior: [], senior: [] }
};

// Restore data from MongoDB on startup
async function restoreFromCloud() {
    try {
        const saved = await DataModel.findOne({ id: "master_data" });
        if (saved && saved.content) {
            festData = saved.content;
            console.log("📂 [SYSTEM] Local cache updated from Cloud storage");
        } else {
            console.log("🆕 [SYSTEM] No cloud data found. Initializing with defaults.");
        }
    } catch (err) {
        console.error("⚠️ [SYSTEM] Restore Error:", err.message);
    }
}
restoreFromCloud();

// --- 4. REAL-TIME SOCKET ENGINE ---
io.on('connection', (socket) => {
    const clientId = socket.id.substring(0, 5);
    console.log(`🔌 [SOCKET] New Connection: ${clientId}`);

    // Send the latest data immediately upon connection
    socket.emit('initData', festData);

    // Listen for updates from the Admin Panel
    socket.on('updateData', async (newData) => {
        if (!newData || !newData.categories) {
            console.log(`🚫 [SOCKET] Invalid update attempt by ${clientId}`);
            return;
        }

        // Update local memory for instant response
        festData = newData; 

        try {
            // Persist the changes to MongoDB Atlas
            await DataModel.findOneAndUpdate(
                { id: "master_data" }, 
                { 
                    content: newData,
                    lastUpdated: new Date() 
                }, 
                { upsert: true, new: true }
            );

            // Broadcast the updated data to ALL users (Leaderboard + Admins)
            io.emit('dataChanged', festData);
            console.log(`📡 [BROADCAST] Data synced across all clients by ${clientId}`);
            
        } catch (err) {
            console.error(`❌ [CLOUD] Save Failure:`, err.message);
            socket.emit('saveError', 'Cloud database update failed.');
        }
    });

    socket.on('disconnect', () => {
        console.log(`👋 [SOCKET] Client Disconnected: ${clientId}`);
    });
});

// --- 5. SERVER LAUNCH ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('-------------------------------------------');
    console.log(`🚀 FEST SERVER LIVE: http://localhost:${PORT}`);
    console.log('-------------------------------------------');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.log('🚨 Unhandled Rejection:', err.message);
});
