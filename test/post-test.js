require("dotenv").config();
const { expect, requester } = require("./setup");
const { users } = require("./fake-data");
describe("Post", () => {
    it("Create a new post with correct access token", async () => {
        const user2 = users[1];
        const user = {
            email: user2.email,
            password: user2.password,
        };

        const res = await requester.post("/api/user/signin").send(user);
        const { access_token } = res.body;

        const createPostRes = await requester
            .post("/api/post")
            .set("Authorization", access_token)
            .send({
                content: "Mocha is not matcha",
                audience_type_id: 1,
            });

        expect(createPostRes.status).to.equal(201);
        expect(createPostRes.body.id).to.be.a("number");
    });
});
