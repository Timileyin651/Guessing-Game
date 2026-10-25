const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const DB = require('./config/db');
const registerGameSocket = require('./sockets/game.sockets');

const PORT = 3000;
const HOST = '0.0.0.0';


const server = http.createServer(app);
const io = new Server(server);

registerGameSocket(io);
DB.connectToMongoDB();


server.listen(PORT, () => {
    console.log(`GuessMaster running on http://${HOST}:${PORT}`)
});