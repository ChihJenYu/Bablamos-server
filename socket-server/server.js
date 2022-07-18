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
        const onlineUser = new OnlineUser({ user_id, socket_id: socket.id });
        const beginTime = Date.now();
        await onlineUser.save();
    });

    socket.on(
        "notification_event",
        async ({
            notification_type_id,
            username,
            inv_user_id,
            inv_post_id,
            inv_comment_id,
            for_user_id,
            id,
            profile_pic_url,
            created_at,
        }) => {
            console.log({
                notification_type_id,
                username,
                inv_user_id,
                inv_post_id,
                inv_comment_id,
                for_user_id,
                id,
                profile_pic_url,
                created_at,
            });
            const result = await OnlineUser.find(["socket_id"], {
                user_id: for_user_id,
            });
            if (result.length === 0) {
                return;
            }
            const { socket_id } = result[0];
            io.to(socket_id).emit("display_notification", {
                notification_type_id,
                username,
                inv_user_id,
                inv_post_id,
                inv_comment_id,
                id,
                created_at,
                profile_pic_url,
            });
        }
    );

    socket.on("invalidate_notification_event", async ({ for_user_id, id }) => {
        console.log({
            for_user_id,
            id,
        });
        const result = await OnlineUser.find(["socket_id"], {
            user_id: for_user_id,
        });
        if (result.length === 0) {
            return;
        }
        const { socket_id } = result[0];
        io.to(socket_id).emit("invalidate_notification", {
            id,
        });
    });

    socket.on("disconnect", async () => {
        const beginTime = Date.now();
        await OnlineUser.delete({ socket_id: socket.id });
    });
});

server.listen(SOCKET_PORT, () => {
    console.log(`Socket server is listening on port: ${SOCKET_PORT}`);
});
