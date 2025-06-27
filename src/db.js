import mysql from 'mysql2';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { connectWithConnector as createConnectorPool } from './connect-connector.js';
import { BASE_URL } from './constants.js';
import dotenv from 'dotenv';
dotenv.config();

// used in development
function createTcpPool(config) {
    // database connection
    return mysql.createPool({
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        host: process.env.DB_INSTANCE_HOST,
        ...config,
    }).promise();
}

// 
// Retrieve and return a specified secret from Secret Manager
import {SecretManagerServiceClient} from '@google-cloud/secret-manager';
const client = new SecretManagerServiceClient();

async function accessSecretVersion(secretName) {
  const [version] = await client.accessSecretVersion({name: secretName});
  return version.payload.data;
}

const createPool = async () => {
    const config = {
        // [START cloud_sql_mysql_mysql2_limit]
        // 'connectionLimit' is the maximum number of connections the pool is allowed
        // to keep at once.
        connectionLimit: 5,
        // [END cloud_sql_mysql_mysql2_limit]

        // [START cloud_sql_mysql_mysql2_timeout]
        // 'connectTimeout' is the maximum number of milliseconds before a timeout
        // occurs during the initial connection to the database.
        connectTimeout: 10000, // 10 seconds
        // 'waitForConnections' determines the pool's action when no connections are
        // free. If true, the request will queued and a connection will be presented
        // when ready. If false, the pool will call back with an error.
        waitForConnections: true, // Default: true
        // 'queueLimit' is the maximum number of requests for connections the pool
        // will queue at once before returning an error. If 0, there is no limit.
        queueLimit: 0, // Default: 0
        // [END cloud_sql_mysql_mysql2_timeout]

        // [START cloud_sql_mysql_mysql2_backoff]
        // The mysql module automatically uses exponential delays between failed
        // connection attempts.
        // [END cloud_sql_mysql_mysql2_backoff]
    };

    // Check if a Secret Manager secret version is defined
    // If a version is defined, retrieve the secret from Secret Manager and set as the DB_PASS
    const { CLOUD_SQL_CREDENTIALS_SECRET } = process.env;
    if (CLOUD_SQL_CREDENTIALS_SECRET) {
        const secrets = await accessSecretVersion(CLOUD_SQL_CREDENTIALS_SECRET);
        try {
            process.env.DB_PASS = secrets.toString();
        } catch (err) {
            err.message = `Unable to parse secret from Secret Manager. Make sure that the secret is JSON formatted: \n ${err.message} `;
            throw err;
        }
    }

    if (process.env.INSTANCE_CONNECTION_NAME) {
        // Uses the Cloud SQL Node.js Connector when INSTANCE_CONNECTION_NAME
        // (e.g., project:region:instance) is defined
        if (process.env.DB_IAM_USER) {
            //  Either a DB_USER or a DB_IAM_USER should be defined. If both are
            //  defined, DB_IAM_USER takes precedence
            // return createConnectorIAMAuthnPool(config);
            throw 'DB_IAM_USER is defined, i dont know what to do :(';
        } else {
            return createConnectorPool(config);
        }
    } else if (process.env.DB_INSTANCE_HOST) {
        // Use a TCP socket when DB_INSTANCE_HOST (e.g., 127.0.0.1) is defined
        return createTcpPool(config);
    } else if (process.env.INSTANCE_UNIX_SOCKET) {
        // Use a Unix socket when INSTANCE_UNIX_SOCKET (e.g., /cloudsql/proj:region:instance) is defined.
        // return createUnixSocketPool(config);
        throw 'INSTANCE_UNIX_SOCKET is defined, i dont know what to do :(';
    } else {
        throw 'Set either `INSTANCE_CONNECTION_NAME` or `DB_INSTANCE_HOST` or `INSTANCE_UNIX_SOCKET` environment variables.';
    }
};

const pool = await createPool();

/**
 * Creates a new route in the database with the given name, ownerId, waypoints, and thumbnailPath.
 * @param {string} name - The name of the route.
 * @param {number} ownerId - The ID of the user who owns the route.
 * @param {Array<{lat: number, lng: number, orderId: number, name: string}>} waypoints - An array of waypoints for the route, each with latitude, longitude, order ID, and name.
 * @param {string} thumbnailPath - The path to the thumbnail image for the route.
 * @returns {Promise<number>} - The ID of the created route.
 */
async function createRoute(name, ownerId, waypoints = null, thumbnailPath = null) {
    const res = await pool.query(
        'INSERT INTO Routes (name, owner_id, thumbnail) VALUES (?, ?, ?)',
        [name, ownerId, thumbnailPath]
    );
    const routeId = res[0].insertId;
    if (waypoints !== null) {
        await pool.query(
            'INSERT INTO Waypoints (route_id, latitude, longitude, order_id, name) VALUES ?',
            [waypoints.sort((a, b) => a.orderId - b.orderId)
                .map((w, _) => [routeId, w.lat, w.lng, w.orderId, w.name])]
        );
    }
    return routeId;
}

/**
 * Updates an existing route in the database with the given routeId, name, ownerId, waypoints, and thumbnailPath.
 * If a waypoint is in the database but not in the waypoints list, it will be deleted.
 * If a waypoint is in the waypoints list but not in the database, it will be created.
 * If a waypoint is in both the database and the waypoints list, it will    be updated.
 * @param {number} routeId - The ID of the route to update.
 * @param {string} name - The new name of the route.
 * @param {number} ownerId - The ID of the user who owns the route.
 * @param {Array<{id: number, lat: number, lng: number, orderId: number, name: string}>} waypoints - An array of waypoints for the route, each with an ID, latitude, longitude, order ID, and name.
 * @param {string} thumbnailPath - The new path to the thumbnail image for the route.
 * @returns {null}
 */
async function updateRoute(routeId, name, ownerId, waypoints = null, thumbnailPath = null) {
    await pool.query(
        'UPDATE Routes SET name = ?, thumbnail = ? WHERE id = ? AND owner_id = ?',
        [name, thumbnailPath, routeId, ownerId]
    );

    // delete waypoints that are in the database but not on the waypoints list
    let waypointsToDelete = [];
    const [waypointsInDB] = await pool.query(
        'SELECT * FROM Waypoints WHERE route_id = ?',
        [routeId]
    );
    for (const waypointInDB of waypointsInDB) {
        if (!waypoints.some(w => Number(w.id) === Number(waypointInDB.id))) {
            waypointsToDelete.push(waypointInDB.id);
        }
    }
    for (const waypointToDeleteId of waypointsToDelete) {
        await pool.query(
            'DELETE FROM Waypoints WHERE id = ?',
            [waypointToDeleteId]
        );
    }

    // we want to  those waypoints that are EITHER:
    // 1. if the waypoint is already in the database and belong to the edited routeId, then update it 
    // 2. if the waypoint is not in the database then create it
    for (const waypoint of waypoints) {
        const [rows] = await pool.query(
            'SELECT * FROM Waypoints WHERE id = ?',
            [waypoint.id]
        );
        if (rows.length === 0) { // new waypoint
            await pool.query(
                'INSERT INTO Waypoints (route_id, latitude, longitude, order_id, name) VALUES (?, ?, ?, ?, ?)',
                [routeId, waypoint.lat, waypoint.lng, waypoint.orderId, waypoint.name]
            );
        } else if (rows[0].route_id === routeId) { // waypoint belongs to the route we are editing
            await pool.query(
                'UPDATE Waypoints SET latitude = ?, longitude = ?, name = ? WHERE id = ?',
                [waypoint.lat, waypoint.lng, waypoint.name, waypoint.id]
            );
        }
    }
}

/**
 * Retrieves a route by its ID from the database.
 * @param {number} id - The ID of the route to retrieve.
 * @returns {Promise<Object>} - A promise that resolves to the route object.
 */
async function getRoute(id) {
    const [rows] = await pool.query(
        'SELECT * FROM Routes WHERE id = ?',
        [id]
    );
    return rows[0];
}

/**
 * Retrieves a list of routes from the database, optionally filtered by user ID and name.
 * @param {{userId: number|null, nameLike: string}} options - An object containing optional parameters for filtering routes.
 * @return {Promise<Array<Object>>} - A promise that resolves to an array of route objects.
 */
async function getRoutes({userId = null, nameLike = ''}) {
    if (userId) {
        const [rows] = await pool.query(
            'SELECT * FROM Routes WHERE owner_id = ? AND name LIKE ?',
            [userId, `%${nameLike}%`]
        );
        return rows;
    } else {
        const [rows] = await pool.query(
            'SELECT * FROM Routes WHERE name LIKE ?',
            [`%${nameLike}%`]
        );
        return rows;
    }
}

/**
 * Gives a list of players (i.e. users that joined) for a given route
 * with an array of waypoints that they visited
 * @param {number} routeId 
 * @return {Promise<Array<{user_id: number, username: string, visitedWaypoints: Array<number>}>>}
 */
async function getPlayers(routeId) {
    const resQuery = await pool.query(
        'SELECT Users.id as user_id_, Users.*, JoinedRoutes.*, Visits.* FROM Users JOIN JoinedRoutes ON Users.id = JoinedRoutes.user_id LEFT JOIN Visits on Users.id = Visits.user_id WHERE JoinedRoutes.route_id = ?',
        [routeId]
    );
    const res = resQuery[0];

    let result = {};
    for (const row of res) {
        if (!result[row.user_id]) {
            result[row.user_id] = {
                user_id: row.user_id_,
                username: row.username,
                visitedWaypoints: []
            };
        }
        result[row.user_id].visitedWaypoints.push(row.waypoint_id);
    }
    return Object.values(result);
}

/**
 * Retrieves all waypoints for a given route ID from the database.
 * @param {number} routeId - The ID of the route for which to retrieve waypoints.
 * @returns {Promise<Array<Object>>} - A promise that resolves to an array of waypoint objects.
 */
async function getWaypoints(routeId) {
    const res = await pool.query(
        'SELECT * FROM Waypoints WHERE route_id = ?',
        [routeId]
    );
    return res[0];
}

/**
 * Retrieves a waypoint by its ID from the database.
 * @param {number} waypointId - The ID of the waypoint to retrieve.
 * @returns {Promise<Object>} - A promise that resolves to the waypoint object.
 */
async function getWaypoint(waypointId) {
    const res = await pool.query(
        'SELECT * FROM Waypoints WHERE id = ?',
        [waypointId]
    );
    return res[0][0];
}

/**
 * Generates a random UUID that is not used by any waypoint in the database.
 * @return {Promise<string>} - A promise that resolves to a random UUID.
 */
async function randomWaypointUUID() {
    let uuid = crypto.randomUUID();
    const [rows] = await pool.query(
        'SELECT * FROM Waypoints WHERE uuid = ?',
        [uuid]
    );
    if (rows.length === 0) {
        return uuid;
    } else {
        return await randomWaypointUUID();
    }
}

/**
 * Generates a link that marks the waypoint as visited for the user.
 * @param {number} waypointId 
 * @returns {Promise<string>} - A promise that resolves to a link that marks the waypoint as visited.
 */
async function getWaypointVisitLink(waypointId) {
    const waypoint = await getWaypoint(waypointId);

    let uuid = waypoint.uuid;
    if (uuid === null) {
        // generate a link and save it in the database
        uuid = await randomWaypointUUID();
        await pool.query(
            'UPDATE Waypoints SET uuid = ? WHERE id = ?',
            [uuid, waypointId]
        );
    }
    return `${BASE_URL}/visit/${uuid}`;
}

/**
 * Hashes a password using bcrypt with a specified number of rounds.
 * @param {string} password - The password to hash.
 * @returns {Promise<string>} - A promise that resolves to the hashed password.
 */
async function hashPassword(password) {
    const rounds = 12;
    const hash = await bcrypt.hash(password, rounds);
    return hash;
}

/**
 * Creates an account with the given credentials in the database. Does not
 * verify if the credentials are valid. Either password or googleId must 
 * be provided.
 * @param {string} email 
 * @param {string} username 
 * @param {string} password (not hashed)
 * @param {string} googleId
 * @returns {Promise<number>} - A promise that resolves to the ID of the created user.
 */
async function createUser({ email, username, password = null, googleId = null }) {
    if (password !== null) {
        const hash = await hashPassword(password);
        const res = await pool.query(
            'INSERT INTO Users (email, username, password) VALUES (?, ?, ?)',
            [email, username, hash]
        );
        return res[0].insertId;
    }
    else if (googleId !== null) {
        const res = await pool.query(
            'INSERT INTO Users (email, username, googleId) VALUES (?, ?, ?)',
            [email, username, googleId]
        );
        return res[0].insertId;
    }
    else {
        throw new Error('Either password or googleId must be provided');
    }
}

/**
 * Deletes a user from the database by their ID.
 * @param {number} id - The ID of the user to delete.
 * @returns {Promise<Object>} - A promise that resolves to the result of the delete operation
 */
async function deleteUser(id) {
    const res = await pool.query(
        'DELETE FROM Users WHERE id = ?',
        [id]
    );
    return res;
}

/**
 * Retrieves a user by their ID from the database.
 * @param {number} id - The ID of the user to retrieve.
 * @returns {Promise<Object>} - A promise that resolves to the user object.
 */
async function getUser(id) {
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE id = ?',
        [id]
    );
    return rows[0];
}
/**
 * Retrieves a user by their email from the database.
 * @param {string} email - The email of the user to retrieve.
 * @returns {Promise<Object>} - A promise that resolves to the user object.
 */
async function getUserByEmail(email) {
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE email = ?',
        [email]
    );
    return rows[0];
}

/**
 * @typedef {Object} WaypointWithVisits
 * @property {string} name - The name of the waypoint.
 * @property {number} latitude - The latitude of the waypoint.
 * @property {number} longitude - The longitude of the waypoint.
 * @property {number} visits - The number of visits to the waypoint.
 * Retrieves the top 10 waypoints with the most visits from the database.
 * @returns {Promise<Array<WaypointWithVisits>>} - A promise that resolves to an array of waypoint objects.
 */
async function getWaypointsWithMostVisits() {
    const [rows] = await pool.query(
        `SELECT visits, name, latitude, longitude
         FROM LeaderboardWaypointsWithMostVisits l
         LEFT JOIN Waypoints w ON l.waypoint_id = w.id
         ORDER BY visits DESC
         LIMIT 10`
    );
    return rows;
}
/**
 * @typedef {Object} UserWithMostVisits
 * @property {number} id - The ID of the user.
 * @property {string} username - The username of the user.
 * @property {number} visits - The number of visits made by the user.
 * Retrieves the top 10 users with the most visits from the database.
 * @returns {Promise<Array<UserWithMostVisits>>} - A promise that resolves to an array of user objects.
 */
async function getUsersWithMostVisits() {
    const [rows] = await pool.query(
        `SELECT u.username, visits
         FROM LeaderboardUsersWithMostVisits l
            LEFT JOIN Users u ON l.user_id = u.id
         ORDER BY visits DESC
         LIMIT 10`
    );
    return rows;
}

/**
 * @typedef {Object} UserWithCompletedRoutes
 * @property {number} id - The ID of the user.
 * @property {string} username - The username of the user.
 * @property {number} completed_routes - The number of completed routes for the user.
 * Retrieves the top 10 users with the most completed routes from the database.
 * @returns {Promise<Array<UserWithCompletedRoutes>>} - A promise that resolves to an array of user objects.
 */
async function getUsersWithMostCompletedRoutes() {
    const [rows] = await pool.query(
        `SELECT u.username, completed_routes
         FROM LeaderboardUsersWithMostCompletedRoutes l
            LEFT JOIN Users u ON l.user_id = u.id
         ORDER BY completed_routes DESC
         LIMIT 10`
    );
    return rows;
}

/**
 * @typedef {Object} Achievement
 * @property {number} id - The ID of the achievement.
 * @property {string} name - The name of the achievement.
 * @property {string} description - A description of the achievement.
 * @property {string} icon - The URL of the icon representing the achievement.
 * @property {number|null} user_id - The ID of the user who completed the achievement. Null if the user has not completed the achievement.
 */
/**
 * Retrieves all achievements for a user, including those not yet completed.
 * If the user has not completed an achievement, `user_id` will be null.
 * @param {number} userId - The ID of the user for whom to retrieve achievements.
 * @returns {Promise<Array<Achievement>>} - A promise that resolves to an array of achievement objects.
 */
async function getAchievements(userId) {
    const [rows] = await pool.query(
        `SELECT *
            FROM Achievements a LEFT JOIN UserAchievements ua 
                ON a.id = ua.achievement_id AND ua.user_id = ?`,
        [userId]
    );
    return rows;
}


export { pool, createRoute, updateRoute, getRoute, getRoutes, getPlayers, getWaypoints, getWaypoint, getWaypointVisitLink, createUser, deleteUser, getUser, getUserByEmail, getWaypointsWithMostVisits, getUsersWithMostVisits, getUsersWithMostCompletedRoutes, getAchievements };