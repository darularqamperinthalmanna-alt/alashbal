const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// --- 1. CLOUD DATABASE CONFIGURATION ---
const mongoURI = process.env.MONGODB_URI;

mongoose.connect(mongoURI)
    .then(() => console.log("✅ Securely connected to MongoDB Cloud"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- 2. DATA SCHEMA ---
const FestSchema = new mongoose.Schema({
    id: { type: String, default: "master_data" },
    content: Object
});
const DataModel = mongoose.model('FestData', FestSchema);

// Updated starting data to include General category
let festData = {
    overall: [
        { name: "ASKARIYYA", points: 0 },
        { name: "KUTHAIBA", points: 0 }
    ],
    categories: { 
        subJunior: [], 
        junior: [], 
        senior: [], 
        general: [] // <--- ADDED GENERAL HERE
    }
};

// --- 3. FIX FOR "NOT FOUND" ERROR ---
app.use(express.static(path.join(__dirname, 'public')));

async function restoreFromCloud() {
    try {
        const saved = await DataModel.findOne({ id: "master_data" });
        if (saved) {
            festData = saved.content;
            // Safety check: ensure 'general' exists even if restoring old data
            if (!festData.categories.general) festData.categories.general = [];
            console.log("📂 Master data restored from MongoDB Atlas");
        }
    } catch (err) {
        console.error("⚠️ Error restoring data:", err);
    }
}
restoreFromCloud();

// --- 4. REAL-TIME LOGIC ---
io.on('connection', (socket) => {
    socket.emit('initData', festData);

    socket.on('updateData', async (newData) => {
        festData = newData;
        try {
            await DataModel.findOneAndUpdate(
                { id: "master_data" }, 
                { content: newData }, 
                { upsert: true }
            );
            io.emit('dataChanged', festData);
            console.log('☁️ Data synced to MongoDB including General category');
        } catch (err) {
            console.error('❌ Cloud Save Error:', err);
        }
    });
});

// --- 5. START SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Arqamiyya Fest running on port ${PORT}`);
});
