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
      const pool = require('./utils/dbCon');

      mongoose.connect(mongoURL).then(() => {
        const domain = process.env.DNS_SUFFIX;
        const subDomain = process.env.SERVICES_PREFIX ? `${process.env.SERVICES_PREFIX}.` : '';

        const server = http.createServer().listen(socketPort);
        const socketServer = io(server, {
          cors: {
            origin: [`https://${subDomain}${domain}`, 'http://localhost:3000'],
            methods: ['GET', 'POST'],
            credentials: true
          }
        });

        socketServer.on('connection', (socket) => {
          const authToken = socket.handshake.headers.cookie ? cookie.parse(socket.handshake.headers.cookie)?.authToken : null;
          if (!authToken) {
            socket.emit('error', 'User not logged in');
            socket.disconnect();
          }

          try {
            const decoded = jwt.verify(authToken, process.env.JWT_SECRET || 'stackingupsecretlocal');
            sendPreviousUserChats(socket, decoded.userId);

            socket.on('join', (otherUserId) => {
              pool.query('SELECT * FROM "User" WHERE id = $1', [otherUserId]).then((result) => {
                if (result.rows.length > 0) {
                  const room = [decoded.userId, otherUserId].sort().join('-');
                  console.log(`User ${decoded.userId} joined room ${room}`);
                  socket.join(room);
                  Messages.find({ room: room })
                    .then(messages => {
                      if (messages.length > 0) {
                        sendRoomMessages(socket, room);
                      } else {
                        const newMessage = new Messages({
                          text: 'New Chat',
                          datetime: new Date(),
                          room: room,
                          user: 0
                        });

                        newMessage.save()
                          .then((msg) => {
                            sendRoomMessages(socket, room);
                            sendPreviousUserChats(socket, decoded.userId);
                          }).catch((err) => {
                            console.error(err);
                          });
                      }
                    }).catch((err) => {
                      console.error(err);
                    });

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
                } else {
                  console.log(`User ${otherUserId} doesn't exist`);
                  socket.disconnect();
                }
              }).catch((err) => {
                console.error(err);
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
        function sendPreviousUserChats (socket, userId) {
          Messages.find({ room: { $regex: new RegExp(`^[\\d]+-${userId}$|^${userId}-[\\d]+$`) } })
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
