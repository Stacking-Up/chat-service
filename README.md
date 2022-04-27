# chat-service
StackingUp socket server for the chat service

## Server Listeners
* **join(UserId)**: Takes the id of the user you want to chat with and joins to that chat.
* **message(msg)**: Sends messages to a chat room after having joined it.
* **leave()**: Leaves current chat room.

## Client Listeners
* **chats**: On connection, will receive a list of id's of all the users you have chatted with. 
* **join**: Will receive all the messages from a room when successfully joined using `join(UserId)`.
* **message**: Will receive the messages sent to the server through `message(msg)`.
* **error**: Will receive any errors that occur.