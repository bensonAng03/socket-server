const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server, {
  // maxHttpBufferSize: 1024 * 1024, // 最大消息大小为1MB
  pingInterval: 25000, // 心跳包发送间隔为25秒
  pingTimeout: 60000, // 断开连接的超时时间为60秒
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});
const cameraRooms = []; 
const shareRooms = [];
const users = [];
const publishers = [];
const countDown=[];

io.on("connection", (socket) => {
  socket.on("join-room", (roomId, userId, username, isPublisher = false) => {
    socket.join(roomId);
    if (!publishers[roomId]) {
      publishers[roomId] = []; // 初始化房间的用户ID数组
    }
    if (!cameraRooms[roomId]) {
      cameraRooms[roomId] = []; // 初始化房间的用户ID数组
    }
    if (!shareRooms[roomId]) {
      shareRooms[roomId] = []; // 初始化房间的用户ID数组
    }
    if (!users[roomId]) {
      users[roomId] = []; // 初始化房间的用户ID数组
    }
    if (!countDown[roomId]) {
      countDown[roomId] = 30*60; // 初始化房间的用户ID数组
    }
    if (isPublisher) {
      if (userId.startsWith("camera")) {
        publishers[roomId].cameraId = userId;
      } else if (userId.startsWith("share")) {
        publishers[roomId].shareId = userId;
      }
    }
    socket.to(roomId).emit("user-connected", userId, username);
    if (userId.startsWith("camera")) {
      // 用户属于 cameraPeer
      const existingUsersId = cameraRooms[roomId];
      const existingUsers = users[roomId];
      if (existingUsers.length > 0) {
        socket.emit("get-info", existingUsersId, existingUsers,countDown[roomId]);
      }
      cameraRooms[roomId].push(userId);
    } else if (userId.startsWith("share")) {
      // 用户属于 sharePeer
      const existingUsersId = shareRooms[roomId];
      const existingUsers = users[roomId];
      if (existingUsers.length > 0) {
        socket.emit("get-info", existingUsersId, existingUsers,countDown[roomId]);
      }
      shareRooms[roomId].push(userId);
    }
    socket.on("disconnect", () => {
      if (userId.startsWith("camera")) {
        const index = cameraRooms[roomId].indexOf(userId);
        if (index > -1) {
          cameraRooms[roomId].splice(index, 1); // Remove the userID from the camera room's array
        }
      } else if (userId.startsWith("share")) {
        const index = shareRooms[roomId].indexOf(userId);
        if (index > -1) {
          shareRooms[roomId].splice(index, 1); // Remove the userID from the share room's array
        }
      }
      if (userId.startsWith("camera")) {
        if (publishers[roomId].cameraId == userId) {
          publishers[roomId].cameraId = "";
        }
      } else if (userId.startsWith("share")) {
        if (publishers[roomId].shareId == userId) {
          publishers[roomId].shareId = "";
        }
      }

      // Remove the user data from the users array
      const userIndex = users[roomId]?.findIndex(
        (userData) => userData.userCameraId === userId
      );
      let disconnectedUser;
      if (userIndex !== -1) {
        disconnectedUser = users[roomId][userIndex].username;
        users[roomId].splice(userIndex, 1);
        publishers; // Emit the "user-disconnected" event with the disconnected user's username and userID
      }
      socket
        .to(roomId)
        .emit(
          "user-disconnected",
          disconnectedUser ? disconnectedUser : "",
          userId
        );
    });
  });
  socket.on("message", (data) => {
    const { content, sender, roomId } = data;
      let charData = { content, sender };
      socket.to(roomId).emit("message", charData);
  });
  socket.on("request-video-stream", (roomId, userId) => {
    if (users[roomId].length !== 0) {
      socket.to(roomId).emit("requested-video-stream", userId);
    }
  });
  socket.on("stop-video-stream", (roomId, userId) => {
    socket.to(roomId).emit("stopped-video-stream", userId);
  });
  socket.on("stop-share-video-stream", (roomId, userId, publisherId = "") => {
    socket.to(roomId).emit("stopped-share-video-stream", userId, publisherId);
  });
  socket.on("request-share-video-stream", (roomId, userId) => {
    if (users[roomId].length !== 0) {
      socket
        .to(roomId)
        .emit(
          "requested-share-video-stream",
          userId,
          publishers[roomId].shareId
        );
    }
  });
  socket.on(
    "request-share-myvideo-stream",
    (roomId, userId, userSharedScreenId) => {
      if (users[roomId]?.length !== 0) {
        io.to(roomId).emit(
          "requested-share-myvideo-stream",
          userId,
          userSharedScreenId,
          publishers[roomId].shareId || publishers[roomId].shareId
        );
      }
    }
  );
  socket.on("request-share-yourvideo-stream", (roomId, userId, isShare) => {
    io.to(roomId).emit("requested-share-yourvideo-stream", userId, isShare);
  });
  socket.on(
    "personal-status",
    (
      roomId,
      username,
      userCameraId,
      userScreenId,
      isShareScreen,
      isOpenCamera,
      isShareAudio
    ) => {
      if (users[roomId]?.length !== 0) {
        const user = users[roomId]?.find(
          (userData) => userData.username === username
        );
        if (user) {
          user.username = username;
          user.userCameraId = userCameraId;
          user.userScreenId = userScreenId;
          user.isOpenCamera = isOpenCamera;
          user.isShareScreen = isShareScreen;
          user.isShareAudio = isShareAudio;
        } else {
          // 如果找不到对应用户的数据，则创建新的用户数据对象
          users[roomId]?.push({
            username,
            userCameraId,
            userScreenId,
            isOpenCamera,
            isShareScreen,
            isShareAudio,
          });
        }
      } else {
        users[roomId]?.push({
          username,
          userCameraId,
          userScreenId,
          isOpenCamera,
          isShareScreen,
          isShareAudio,
        });
      }
    }
  );
  socket.on("get-all-user-info", (roomId, userId) => {
    if (users[roomId]?.length !== 0) {
      io.to(roomId).emit("got-all-user-info", users[roomId], userId);
    }
  });
  socket.on("raise-hand", (roomId, userId, username, isRaiseHand) => {
    socket.to(roomId).emit("raised-hand", userId, username, isRaiseHand);
  });
  socket.on("mute-audio", (roomId,userId) => {
    io.to(roomId).emit("muted-audio",userId);
  });
  socket.on("user-inactive", (roomId, userId, isShowWarning) => {
    socket.to(roomId).emit("user-inactivated", userId, isShowWarning);
  });
  socket.on("modify-interaction-time", (roomId, interactionTime) => {
    countDown[roomId]=+interactionTime
    socket.to(roomId).emit("modified-interaction-time", interactionTime);
  });
  socket.on("reset-publisher-id", (roomId, userCameraId, userScreenId) => {
    if (!publishers[roomId]) {
      publishers[roomId] = []; // 初始化房间的用户ID数组
    }
    publishers[roomId].cameraId = userCameraId;
    publishers[roomId].shareId = userScreenId;
  });
});

const port = process.env.PORT || 8000;
server.listen(port,() => {
  console.log(`Socket.IO server running on port ${port}`);
});
