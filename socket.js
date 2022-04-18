'use strict';

const deploy = () => {
  return new Promise((resolve, reject) => {
    try {
      const http = require('http');
      const io = require('socket.io');
      const cookie = require('cookie');
      const jwt = require('jsonwebtoken');
      const mongoose = require('mongoose');
      const Messages = require('./models/Message');

      const socketPort = process.env.PORT ?? 4200;
      const mongoPort = process.env.MONGO_PORT ?? 27017;
      const mongoHost = process.env.MONGO_HOST ?? 'localhost';
      const mongoDBName = process.env.MONGO_DBNAME ?? 'chat-db';
      const mongoURL = `mongodb://${mongoHost}:${mongoPort}/${mongoDBName}`;

      mongoose.connect(mongoURL).then(() => {
        const server = http.createServer().listen(socketPort);
        const socketServer = io(server);

        socketServer.on('connection', (socket) => {
          const authToken = socket.handshake.headers.cookie ? cookie.parse(socket.handshake.headers.cookie)?.authToken : null;
          if (!authToken) {
            socket.emit('error', 'User not logged in');
            socket.disconnect();
          }

          try {
            const decoded = jwt.verify(authToken, process.env.JWT_SECRET || 'stackingupsecretlocal');
            sendPreviousUserChats(socket, decoded.userId)
            
            socket.on('join', (otherUserId) => {
              const room = [decoded.userId, otherUserId].sort().join('-');
              console.log(`User ${decoded.userId} joined room ${room}`);
              socket.join(room);
              sendRoomMessages(socket, room);

              socket.on('message', (msg) => {
                const newMessage = new Messages({
                  text: msg,
                  datetime: new Date(),
                  room: room,
                  user: decoded.userId
                });

                newMessage.save()
                  .then((msg) => {
                    socketServer.to(room).emit('message', msg);
                  }).catch((err) => {
                    console.error(err);
                  });
              });

              socket.once('leave', () => {
                console.log('User disconnected');
                socket.removeAllListeners('message');
                socket.leave(room);
              });
            });
          } catch (err) {
            if (err instanceof jwt.JsonWebTokenError) {
              socket.emit('error', 'Invalid credentials');
            } else {
              socket.emit('error', 'Unexpected error on chat service');
              console.log(err);
            }
            socket.disconnect();
          }
        });

        function sendRoomMessages (socket, room) {
          Messages.find({ room })
            .sort({ datetime: -1 })
            .limit(200)
            .exec()
            .then((messages) => {
              socketServer.in(socket.id).emit('join', messages);
            }).catch((err) => {
              console.error(err);
            });
        }
        function sendPreviousUserChats(socket, userId) {
          Messages.find({ user: userId })
            .distinct('room')
            .then(rooms => {
              socketServer.in(socket.id).emit('chats', rooms.map(r => parseInt(r.replace('-', '').replace(userId, '').trim())));
            }).catch((err) => {
              console.error(err);
            });
        }
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
};

const undeploy = () => {
  process.exit();
};

module.exports = {
  deploy: deploy,
  undeploy: undeploy
};
