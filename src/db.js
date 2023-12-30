import mysql from 'mysql2';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();

// database connection
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
}).promise();

async function createRoute (name, ownerId, waypoints=null) {
    const res = await pool.query(
        'INSERT INTO Routes (name, owner_id) VALUES (?, ?)',
        [ name, ownerId ]
    );
    const routeId = res[0].insertId;
    if (waypoints !== null) {
        await pool.query(
            'INSERT INTO Waypoints (route_id, latitude, longitude, order_id, name) VALUES ?',
            [ waypoints.sort((a, b) => a.orderId - b.orderId)
                .map((w, _) => [ routeId, w.lat, w.lng, w.orderId, w.name ]) ]
        );
    }
}

async function updateRoute (routeId, name, ownerId, waypoints=null) {
    const res = await pool.query(
        'UPDATE Routes SET name = ? WHERE id = ? AND owner_id = ?',
        [ name, routeId, ownerId ]
    );

    // delete waypoints that are in the database but not on the waypoints list
    let waypointsToDelete = [];
    const [waypointsInDB] = await pool.query(
        'SELECT * FROM Waypoints WHERE route_id = ?',
        [ routeId ]
    );
    for (const waypointInDB of waypointsInDB) {
        if (!waypoints.some(w => Number(w.id) === Number(waypointInDB.id))) {
            waypointsToDelete.push(waypointInDB.id);
        }
    }
    for (const waypointToDeleteId of waypointsToDelete) {
        await pool.query(
            'DELETE FROM Waypoints WHERE id = ?',
            [ waypointToDeleteId ]
        );
    }

    // we want to  those waypoints that are EITHER:
    // 1. if the waypoint is already in the database and belong to the edited routeId, then update it 
    // 2. if the waypoint is not in the database then create it
    for (const waypoint of waypoints) {
        const [rows] = await pool.query(
            'SELECT * FROM Waypoints WHERE id = ?',
            [ waypoint.id ]
        );
        if (rows.length === 0) { // new waypoint
            await pool.query(
                'INSERT INTO Waypoints (route_id, latitude, longitude, order_id, name) VALUES (?, ?, ?, ?, ?)',
                [ routeId, waypoint.lat, waypoint.lng, waypoint.orderId, waypoint.name ]
            );
        } else if (rows[0].route_id === routeId) { // waypoint belongs to the route we are editing
            await pool.query(
                'UPDATE Waypoints SET latitude = ?, longitude = ?, name = ? WHERE id = ?',
                [ waypoint.lat, waypoint.lng, waypoint.name, waypoint.id ]
            );
        }
    }
}

async function getRoute (id) {
    const [rows] = await pool.query(
        'SELECT * FROM Routes WHERE id = ?',
        [ id ]
    );
    return rows[0];
}

async function getRoutes (userId) {
    if (userId) {
        const [rows] = await pool.query(
            'SELECT * FROM Routes WHERE owner_id = ?',
            [ userId ]
        );
        return rows;
    } else {
        const [rows] = await pool.query('SELECT * FROM Routes');
        return rows;
    }
}

async function getWaypoints (routeId) {
    const res = await pool.query(
        'SELECT * FROM Waypoints WHERE route_id = ?',
        [ routeId ]
    );
    return res[0];
}

async function getWaypoint (waypointId) {
    const res = await pool.query(
        'SELECT * FROM Waypoints WHERE id = ?',
        [ waypointId ]
    );
    return res[0][0];
}

/**
 * @returns a random UUID that is not used by any waypoint
 */
async function randomWaypointUUID () {
    let uuid = crypto.randomUUID();
    const [rows] = await pool.query(
        'SELECT * FROM Waypoints WHERE uuid = ?',
        [ uuid ]
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
async function getWaypointVisitLink (waypointId) {
    const waypoint = await getWaypoint(waypointId);

    let uuid = waypoint.uuid;
    if (uuid === null) {
        // generate a link and save it in the database
        uuid = await randomWaypointUUID();
        await pool.query(
            'UPDATE Waypoints SET uuid = ? WHERE id = ?',
            [ uuid, waypointId ]
        );
    }
    return `${process.env.DOMAIN}:${process.env.PORT}/visit/${uuid}`;
}

async function hashPassword (password) {
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
async function createUser({email, username, password=null, googleId=null}) {
    if (password !== null) {
        const hash = await hashPassword(password);
        const res = await pool.query(
            'INSERT INTO Users (email, username, password) VALUES (?, ?, ?)',
            [ email, username, hash ]
        );
        return res[0].insertId;
    }
    else if (googleId !== null) {
        const res = await pool.query(
            'INSERT INTO Users (email, username, googleId) VALUES (?, ?, ?)',
            [ email, username, googleId ]
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
        [ id ]
    );
    return res;
}

export { pool, createRoute, updateRoute, getRoute, getRoutes, getWaypoints, getWaypoint, getWaypointVisitLink, createUser, deleteUser };