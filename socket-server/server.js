require("dotenv").config();
const socketio = require("socket.io");
const http = require("http");
const express = require("express");
const app = express();
const server = http.createServer(app);
const { SOCKET_PORT } = process.env;
const OnlineUser = require("./models/online-user");
const io = socketio(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

io.on("connection", (socket) => {
    socket.on("login", async ({ user_id }) => {
        console.log("Connected client: ", socket.id);
        console.log("Connected user's id: ", user_id);
        const onlineUser = new OnlineUser({ user_id, socket_id: socket.id });
        const beginTime = Date.now();
        await onlineUser.save();
        console.log(`Inserting online user took ${Date.now() - beginTime}ms`);
    });

    socket.on(
        "type_1_notification_event",
        async ({ username, inv_user_id, inv_post_id, for_user_id, id, profile_pic_url, created_at }) => {
            const result = await OnlineUser.find(["socket_id"], {
                user_id: for_user_id,
            });
            const { socket_id } = result[0];
            io.to(socket_id).emit("display_type_1_notification", {
                username,
                inv_user_id,
                inv_post_id,
                id,
                created_at,
                profile_pic_url,
            });
        }
    );

    socket.on("disconnect", async () => {
        console.log("Disconnected client: ", socket.id);
        const beginTime = Date.now();
        await OnlineUser.delete({ socket_id: socket.id });
        console.log(
            `Removing online user took ${
                Date.now() - beginTime
            }ms\n----------------------------`
        );
    });
});

server.listen(SOCKET_PORT, () => {
    console.log(`Socket server is listening on port: ${SOCKET_PORT}`);
});
