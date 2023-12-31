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

async function createRoute(name, ownerId, waypoints = null) {
    const res = await pool.query(
        'INSERT INTO Routes (name, owner_id) VALUES (?, ?)',
        [name, ownerId]
    );
    const routeId = res[0].insertId;
    if (waypoints !== null) {
        await pool.query(
            'INSERT INTO Waypoints (route_id, latitude, longitude, order_id, name) VALUES ?',
            [waypoints.sort((a, b) => a.orderId - b.orderId)
                .map((w, _) => [routeId, w.lat, w.lng, w.orderId, w.name])]
        );
    }
}

async function updateRoute(routeId, name, ownerId, waypoints = null) {
    await pool.query(
        'UPDATE Routes SET name = ? WHERE id = ? AND owner_id = ?',
        [name, routeId, ownerId]
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

async function getRoute(id) {
    const [rows] = await pool.query(
        'SELECT * FROM Routes WHERE id = ?',
        [id]
    );
    return rows[0];
}

async function getRoutes(userId) {
    if (userId) {
        const [rows] = await pool.query(
            'SELECT * FROM Routes WHERE owner_id = ?',
            [userId]
        );
        return rows;
    } else {
        const [rows] = await pool.query('SELECT * FROM Routes');
        return rows;
    }
}

async function getWaypoints(routeId) {
    const res = await pool.query(
        'SELECT * FROM Waypoints WHERE route_id = ?',
        [routeId]
    );
    return res[0];
}

async function getWaypoint(waypointId) {
    const res = await pool.query(
        'SELECT * FROM Waypoints WHERE id = ?',
        [waypointId]
    );
    return res[0][0];
}

/**
 * @returns a random UUID that is not used by any waypoint
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
 * @param {?} waypointId 
 * @returns full url that marks the waypoint as visited for the user
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
 * @returns id of the created user
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

async function deleteUser(id) {
    const res = await pool.query(
        'DELETE FROM Users WHERE id = ?',
        [id]
    );
    return res;
}

async function getUser(id) {
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE id = ?',
        [id]
    );
    return rows[0];
}
async function getUserByEmail(email) {
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE email = ?',
        [email]
    );
    return rows[0];
}

export { pool, createRoute, updateRoute, getRoute, getRoutes, getWaypoints, getWaypoint, getWaypointVisitLink, createUser, deleteUser, getUser, getUserByEmail };