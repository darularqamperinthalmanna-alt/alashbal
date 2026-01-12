const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CLOUD DATABASE CONFIGURATION ---
// Add your connection string from Step 2 into Render's Environment Variables
const mongoURI = process.env.MONGODB_URI;

mongoose.connect(mongoURI)
    .then(() => console.log("✅ Securely connected to MongoDB Cloud"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

const FestSchema = new mongoose.Schema({
    id: { type: String, default: "master_data" },
    content: Object
});
const DataModel = mongoose.model('FestData', FestSchema);

let festData = {
    overall: [
        { name: "ASKARIYYA", points: 0 },
        { name: "KUTHAIBA", points: 0 }
    ],
    categories: { subJunior: [], junior: [], senior: [] }
};

app.use(express.static(path.join(__dirname, 'public')));

async function restoreFromCloud() {
    try {
        const saved = await DataModel.findOne({ id: "master_data" });
        if (saved) festData = saved.content;
    } catch (err) { console.error("Restore Error:", err); }
}
restoreFromCloud();

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
        } catch (err) { console.error('Cloud Save Error:', err); }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});