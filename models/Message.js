const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MessageSchema = new Schema(
  {
    text: {
      type: String,
      required: true
    },
    datetime: {
      type: Date,
      required: true
    },
    room: {
      type: String,
      required: true
    },
    user: {
      type: Number,
      required: true
    }
  }
);

module.exports = mongoose.model('Message', MessageSchema);