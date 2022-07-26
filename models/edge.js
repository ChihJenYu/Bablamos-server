const edgeTypes = {
    eventful_edge: 1,
    comment: 2,
    like: 3,
    followship: 4,
    friendship: 5,
};

// common attributes of posts (eventful edges) and comments
class Edge {
    constructor({
        id,
        edge_type,
        user_id,
        content,
        photo_count,
        created_at,
    }) {
        this.id = id || null;
        this.edge_type_id = edgeTypes[edge_type]; // required
        this.user_id = user_id; // required
        this.content = content; // required
        this.photo_count = photo_count || 0;
        this.created_at = created_at || null;
    }
}

module.exports = Edge;
