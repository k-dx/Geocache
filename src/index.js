import { createServer } from 'http';
import express, { urlencoded } from 'express';
import mysql from 'mysql2';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { AuthorizationCode } from 'simple-oauth2';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import qrcode from 'qrcode';
import crypto from 'crypto';
dotenv.config();

const EDIT_ROUTE = 'edit';
const CREATE_ROUTE = 'create';

const oauth2 = new AuthorizationCode({
    client: {
        id: process.env.GOOGLE_CLIENT_ID,
        secret: process.env.GOOGLE_CLIENT_SECRET,
    },
    auth: {
        tokenHost: 'https://www.googleapis.com',
        tokenPath: '/oauth2/v4/token',
        authorizeHost: 'https://accounts.google.com',
        authorizePath: '/o/oauth2/v2/auth'
    },
});

const authorizationUri = oauth2.authorizeURL({
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    scope: 'openid profile email'
});

var app = express();

app.set('view engine', 'ejs');
app.set('views', './src/views');
app.use(express.static('./src/public'));

app.use(urlencoded({ extended: true }));
app.use(cookieParser('djdiej4iutjf323xmzz02mfdg'));

// TODO: move to a separate file
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

app.get('/', injectUser, (req, res) => {
    res.render('index');
})
app.get('/dev', injectUser, (req, res) => {
    res.render('dev');
})
app.get('/admin/routes/list', [authorize, injectUser], async (req, res) => {
    const userId = req.user;
    res.render('admin-list', { 
        routes: await getRoutes(userId)
    });
})
app.get('/admin/routes/create', [authorize, injectUser], async (req, res) => {
    res.render('routes-edit', { 
        mode: CREATE_ROUTE,
        route: {},
        waypoints: [] 
    });
})
app.get('/admin/routes/summary/:route_id', [authorize, injectUser], async (req, res) => {
    // TODO check if user is the owner of the route
    const routeId = req.params.route_id;
    const route = await getRoute(routeId);
    const waypoints = await getWaypoints(routeId);
    if (!route) {
        res.render('error-generic', {
            message: 'No route with this id!'
        });
        return;
    }
    res.render('route-summary', {
        route: route,
        waypoints: waypoints
    })
})
app.get('/admin/routes/delete/:route_id', [authorize, injectUser], async (req, res) => {
    // check if user is the owner of the route
    const routeId = req.params.route_id;
    const route = await getRoute(routeId);
    if (!route) {
        res.render('error-generic', {
            message: 'No route with this id!'
        });
        return;
    }
    res.render('route-delete', {
        route: route
    });
})
app.post('/admin/routes/delete/:route_id', [authorize, injectUser], async (req, res) => {
    const routeId = req.params.route_id;

    const route = await getRoute(routeId);
    if (!route) {
        res.render('error-generic', {
            message: 'No route with this id!'
        });
        return;
    }

    // TODO check if user is the owner of the route
    await pool.query(
        'DELETE FROM Waypoints WHERE route_id = ?',
        [ routeId ]
    );

    await pool.query(
        'DELETE FROM Routes WHERE id = ?',
        [ routeId ]
    );

    res.redirect('/admin/routes/list');
})

/**
 * Taken from https://www.npmjs.com/package/qrcode
 * @param {string} text text to encode in the QR code
 * @returns a base64-encoded image of the QR code
 */
const generateQR = async text => {
    try {
        return await qrcode.toDataURL(text);
    } catch (err) {
        console.error(err);
        return null;
    }
}

// TODO: merge those two into one?
app.get('/downloads/waypoint-qr/:waypoint_id', [authorize, injectUser], async (req, res) => {
    const waypointId = req.params.waypoint_id;
    const [waypointEntry] = await pool.query(
        'SELECT * FROM Waypoints WHERE id = ?',
        [ waypointId ]
    );
    if (waypointEntry.length === 0) {
        res.render('error-generic', {
            message: 'No waypoint with this id.'
        });
        return;
    }

    const waypointVisitLink = await getWaypointVisitLink(waypointId);
    const qr = await generateQR(waypointVisitLink);
    
    if (qr === null) {
        res.render('error-generic', {
            message: 'Error generating QR code. Please try again.'
        });
        return;
    }

    const waypoint = await getWaypoint(waypointId);
    const route = await getRoute(waypoint.route_id);
    // TODO check if user is the owner of the route

    res.render('waypoints-qrs', {
        qrImgs: [qr],
        waypoints: [waypoint],
        waypointsVisitLinks: [waypointVisitLink],
        route: route
    })
})
app.get('/downloads/waypoints-qrs/:route_id', [authorize, injectUser], async (req, res) => {
    const routeId = req.params.route_id;
    const route = await getRoute(routeId);
    if (!route) {
        res.render('error-generic', {
            message: 'No route with this id!'
        });
        return;
    }
    const waypoints = await getWaypoints(routeId);
    // TODO check if user is the owner of the route
    let qrImgs = [];
    let waypointsVisitLinks = [];
    for (const waypoint of waypoints) {
        const waypointVisitLink = await getWaypointVisitLink(waypoint.id);
        const qr = await generateQR(waypointVisitLink);
        if (qr === null) {
            res.render('error-generic', 
                { message: 'Error generating QR code. Please try again.' });
            return;
        }
        waypointsVisitLinks.push(waypointVisitLink);
        qrImgs.push(qr);
    }
    res.render('waypoints-qrs', {
        qrImgs: qrImgs,
        waypoints: waypoints,
        waypointsVisitLinks: waypointsVisitLinks,
        route: route
    })
})
app.get('/visit/:uuid', authorize, async (req, res) => {
    const uuid = req.params.uuid;
    const [rows] = await pool.query(
        'SELECT * FROM Waypoints WHERE uuid = ?',
        [ uuid ]
    );
    if (rows.length === 0) {
        res.render('error-generic', { message: 'No such waypoint.' });
        return;
    }

    const waypoint = rows[0];
    const userId = req.signedCookies.user;

    // check if user has joined the route that the waypoint belongs to
    const [joinedRows] = await pool.query(
        'SELECT * FROM JoinedRoutes WHERE user_id = ? AND route_id = ?',
        [ userId, waypoint.route_id ]
    )
    if (joinedRows.length === 0) {
        const route = await getRoute(waypoint.route_id);
        res.render('error-route-not-joined', { route: route });
        return;
    }

    // check if user has alread visited the waypoint
    const [visitsRows] = await pool.query(
        'SELECT * FROM Visits WHERE user_id = ? AND waypoint_id = ?',
        [ userId, waypoint.id ]
    )
    if (visitsRows.length !== 0) {
        res.render('error-generic', {
            message: 'You have already visited this waypoint!'
        });
        return;
    }
    
    // mark the waypoint as visited for the user
    const result = await pool.query(
        'INSERT INTO Visits (user_id, waypoint_id) VALUES (?, ?)',
        [ userId, waypoint.id ]
    );
    res.render('waypoint-visited', {
        waypoint: waypoint
    })
})

function getWaypointsFromRequest (req) {
    let waypoints = [];
    for (let i = 0; i < 500; i++) {
        // console.log(i);
        const waypoint = {
            id: req.body[`w${i}-id`],
            orderId: req.body[`w${i}-order-id`],
            lat: req.body[`w${i}-lat`],
            lng: req.body[`w${i}-lng`],
            name: req.body[`w${i}-name`],
        };
        if (waypoint.orderId === undefined) break;
        waypoints.push(waypoint);
    }
    return waypoints;
}

/**
 * Returns null if okay otherwise an object for response
 * @param {string} routeName 
 * @param {array} waypoints 
 */
function validateRoute (route, waypoints) {
    let message = null;
    if (route.name === '') {
        message = `Route name cannot be empty!`;
    } 
    for (const waypoint of waypoints) {
        if (waypoint.name === '') {
            message = `Waypoint name cannot be empty! (Waypoint ${waypoint.orderId})`;
            break;
        }

        if (waypoint.lat === '' || waypoint.lng === '') {
            message = `Waypoint coordinates cannot be empty! (Waypoint ${waypoint.orderId})`;
            break;   
        }
    }
    if (message !== null) {
        const waypointsResponse = waypoints.map((w, _) => {
            return {
                orderId: w.orderId,
                latitude: w.lat,
                longitude: w.lng,
                name: w.name,
                id: w.id
            }
        });

        return {
            message: message,
            route: route,
            waypoints: waypointsResponse
        }
    }

    return null;

}
app.post('/admin/routes/create', authorize, async (req, res) => {
    const userId = req.user;
    const routeName = req.body.name;
    const waypoints = getWaypointsFromRequest(req);

    const validation = validateRoute({ name: routeName }, waypoints);
    if (validation !== null) {
        res.render('routes-edit', {
            message: validation.message,
            mode: CREATE_ROUTE,
            route: validation.route,
            waypoints: validation.waypoints
        });
        return;
    }

    await createRoute(routeName, userId, waypoints);
    res.redirect('/admin/routes/list');
})
app.get('/admin/routes/edit/:route_id', [authorize, injectUser], async (req, res) => {
    const routeId = req.params.route_id;
    const route = await getRoute(routeId);
    if (!route) {
        res.render('error-generic', {
            message: 'No route with this id!'
        });
        return;
    }
    const userId = req.signedCookies.user;
    const ownerId = route.owner_id;
    // TODO: is this comparison with .toString() correct?
    if (ownerId.toString() !== userId) {
        res.render('error-generic', {
            message: 'You are not the owner of this route!'
        });
        return;
    }

    const waypoints = await getWaypoints(routeId);
    res.render('routes-edit', { 
        mode: EDIT_ROUTE, 
        route: route,
        waypoints: waypoints
    });
})
app.post('/admin/routes/edit', authorize,  async (req, res) => {
    const routeId = req.body.route_id;
    const routeName = req.body.name;
    const userId = req.user;
    const waypoints = getWaypointsFromRequest(req);

    const route = await getRoute(routeId); 
    // check if the route exists
    if (!route) {
        console.log(`routeId=${routeId}`);
        console.log(`route=${route}`);
        res.render('error-generic', {
            message: 'No route with this id!'
        });
        return;
    }

    // check if the user is the owner of the route
    const ownerId = route.owner_id;
    if (ownerId.toString() !== userId) {
        res.render('error-generic', {
            message: 'You are not the owner of this route!'
        });
        return;
    } 

    // check if route and waypoints are correct
    const validation = validateRoute(route, waypoints);
    if (validation !== null) {
        res.render('routes-edit', {
            message: validation.message,
            mode: EDIT_ROUTE,
            route: validation.route,
            waypoints: validation.waypoints
        });
        return;
    }

    await updateRoute(routeId, routeName, userId, waypoints);
    res.redirect('/admin/routes/list');
})

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
 */
async function createUser({email, username, password=null, googleId=null}) {
    if (password !== null) {
        const hash = await hashPassword(password);
        const res = await pool.query(
            'INSERT INTO Users (email, username, password) VALUES (?, ?, ?)',
            [ email, username, hash ]
        );
        return res;
    }
    else if (googleId !== null) {
        const res = await pool.query(
            'INSERT INTO Users (email, username, googleId) VALUES (?, ?, ?)',
            [ email, username, googleId ]
        );
        return res;
    }
    else {
        throw new Error('Either password or googleId must be provided');
    }
}

async function linkAccountWithGoogle({userId, googleId}) {
    const res = await pool.query(
        'UPDATE Users SET googleId = ? WHERE id = ?',
        [ googleId, userId ]
    );
}

async function deleteUser(email) {
    const res = await pool.query(
        'DELETE FROM Users WHERE email = ?',
        [ email ]
    );
    return res;
}

// login
app.get('/login', (req, res) => {
    const redirectUrl = req.query.returnUrl;
    let message = null;
    if (redirectUrl) {
        message = 'You must be logged in to view this page';
    }
    res.render('login', { 
        message: message,
        google: authorizationUri,
        returnUrl: redirectUrl
    });
});
app.post('/login', async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;
    const redirectUrl = req.query.returnUrl || '/';
    console.log(req.body);
    console.log(req.query);
    console.log(req.query.returnUrl);

    const emailExistsRes = await emailExists(email);
    if (!emailExistsRes) {
        res.render('login',
                   { email: email, 
                     message: 'Email is not associated with any account!',
                     google: authorizationUri });
        return;
    }
    const passwordRes = await passwordCorrect(email, password);
    if (!passwordRes) {
        res.render('login', 
                   { email: email,
                     message: 'Password is incorrect!',
                     google: authorizationUri });
        return;
    }

    const user = await getUserByEmail(email);

    res = setUserCookie(res, user.id);
    res.redirect(redirectUrl);
})

app.get('/register', (req, res) => {
    res.render('register', { google: authorizationUri });
});

/**
 * Slightly modified code from the lecture
 */
app.get('/oauth/google', async (req, res) => {
    const code = req.query.code;
    const options = {
        code,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI
    };

    // żądanie do punktu końcowego oauth2 zamieniające code na access_token i id_token
    var result       = await oauth2.getToken(options)
    // console.log(result);

    // teraz są dwie możliwości
    // 1. użyć access_token żeby zapytać serwera kto kryje się pod wskazaną tożsamością
    // 2. użyć id_token gdzie od razu zapisana jest wskazana tożsamość
    var accessToken = result.token.access_token;
    var idToken     = result.token.id_token;

    // wariant 1. - żądanie do usługi profile API Google+ po profil użytkownika
    /*
    var response = 
        await fetch('https://openidconnect.googleapis.com/v1/userinfo', 
                    { headers:  {
                      "Authorization": `Bearer ${encodeURIComponent(access_token)}`
                    }});
    var profile = await response.json();                        
    if (profile.email) {
        // zalogowanie 
        res.cookie('user', profile.email, { signed: true });
        res.redirect('/');
    }
    */ 

    // wariant 2. - tożsamość bez potrzeby dodatkowego żądania
    // Uwaga! Formalnie token JWT należy zweryfikować, posługując się kluczami publicznymi
    // z https://www.googleapis.com/oauth2/v3/certs
    var client = jwksClient({
        jwksUri: 'https://www.googleapis.com/oauth2/v3/certs'
    });
    function getKey(header, callback){
        client.getSigningKey(header.kid, function(err, key) {
            var signingKey = key.publicKey || key.rsaPublicKey;
            callback(null, signingKey);
        });
    } 
    var profile = jwt.verify(idToken, getKey, async (err, profile) => {
        // TODO handle err
        // console.log(profile);
        if (!profile.email) {
            res.render('error-generic', {
                message: 'No email in Google account'
            });
            return;
        }

        let user = await getUserByEmail(profile.email);
        if (!user) {
            // utworzenie konta
            user = await createUser({
                email: profile.email,
                username: profile.name,
                googleId: profile.sub
            });
        }
        if (user.googleId === null) {
            await linkAccountWithGoogle({
                userId: user.id,
                googleId: profile.sub
            });
        }

        // zalogowanie
        res = setUserCookie(res, user.id);
        // TODO: redirect to returnUrl
        res.redirect('/');
    });
});

function setUserCookie (res, userId) {
    res.cookie('user', userId, { signed: true });
    return res;
}

/**
 * Checks if email is okay to register
 * @param {string} email 
 * @returns `true` if okay, error message otherwise
 */
async function emailOk (email) {
    const nonEmpty = email !== '';
    if (!nonEmpty) 
        return 'Email cannot be empty!';
    const oneAt = (email.split('@').length - 1) === 1;
    if (!oneAt)
        return 'Email must contain exactly one @!';

    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE email = ?',
        [ email ]
    );
    const notTaken = rows.length === 0;
    if (!notTaken)
        return 'Email is already taken!';
    return true;
}

/**
 * Checks if username is okay to register
 * @param {string} username 
 * @returns `true` if okay, error message otherwise
 */
async function usernameOk (username) {
    const nonEmpty = username !== '';
    if (!nonEmpty) 
        return 'Username cannot be empty!';
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE username = ?',
        [ username ]
    );
    const notTaken = rows.length === 0;
    if (!notTaken)
        return 'Username is already taken!';
    return true;
}

/**
 * Checks if password is okay to register
 * @param {string} password 
 * @returns `true` if okay, error message otherwise
 */
async function passwordOk (password) {
    const longEnough = password.length >= 8;
    if (!longEnough)
        return 'Password must be at least 8 characters long!';
    return true;
}

app.post('/register', async (req, res) => {
    const email = req.body.email;
    const username = req.body.username;
    const password = req.body.password;

    const formdata = { email: email, username: username };
    
    const emailOkRes = await emailOk(email);
    if (emailOkRes !== true) {
        res.render('register', { 
            formdata: formdata,
            message: emailOkRes,
            google: authorizationUri
        });
        return;
    }

    const usernameOkRes = await usernameOk(username);
    if (usernameOkRes !== true) {
        res.render('register', { 
            formdata: formdata, 
            message: usernameOkRes,
            google: authorizationUri

        });
        return;
    }

    const passwordOkRes = await passwordOk(password);
    if (passwordOkRes !== true) {
        res.render('register', { 
            formdata: formdata, 
            message: passwordOkRes,
            google: authorizationUri

        });
        return;
    }

    await createUser({
        email: email,
        username: username,
        password: password
    });
    res.redirect('/register/success');
})

async function emailExists(email) {
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE email = ?',
        [ email ]
    );
    return rows.length === 1;
}

async function passwordCorrect(email, password) {
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE email = ?',
        [ email ]
    );
    const hash = rows[0].password;
    const res = await bcrypt.compare(password, hash);
    return res;
}

/**
*
* @param {http.IncomingMessage} req
* @param {http.ServerResponse} res
* @param {*} next
*/
function authorize(req, res, next) {
    if (req.signedCookies.user) {
        req.user = req.signedCookies.user;
        next();
    } else {
        res.redirect('/login?returnUrl=' + req.url);
    }
}
function injectUser(req, res, next) {
    if (req.signedCookies.user) {
        res.locals.user = req.signedCookies.user;
    }
    next();
}

app.get('/register/success', (req, res) => {
    res.render('register-success');
})
app.get('/login/success', authorize, (req, res) => {
    res.render('login-success');
})
app.get('/logout', (req, res) => {
    res.cookie('user', '', { maxAge: -1 } );
    res.redirect('/')
});

async function getUser(id) {
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE id = ?',
        [ id ]
    );
    return rows[0];
}
async function getUserByEmail(email) {
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE email = ?',
        [ email ]
    );
    return rows[0];
}
app.get('/account', [authorize, injectUser], async (req, res) => {
    const user = await getUser(req.user);
    res.render('account-info', { email: user.email, username: user.username });
})
app.get('/account/delete', [authorize, injectUser], async (req, res) => {
    const user = await getUser(req.user);
    res.render('account-delete', { email: user.email, username: user.username });
})
app.post('/account/delete', authorize, async (req, res) => {
    await deleteUser(req.user);
    res.redirect('/logout');
})
app.get('/about', injectUser, (req, res) => {
    res.render('about');
})
app.get('/routes/browse', injectUser, async (req, res) => {
    const userId = req.signedCookies.user;
    let routes = [];
    // TODO: fix this!
    // if (userId) {
    //     const routesQuery = await pool.query(
    //         `SELECT Routes.*, JoinedRoutes.user_id
    //         FROM Routes
    //         LEFT JOIN JoinedRoutes ON Routes.id = JoinedRoutes.route_id
    //         WHERE JoinedRoutes.user_id = ? OR JoinedRoutes.user_id IS NULL`,
    //         [ userId ]
    //     );
    //     routes = routesQuery[0];
    //     console.log(routes);
    // } else {
    //     routes = await getRoutes();
    // }
    routes = await getRoutes();
    res.render('routes-browse', { routes: routes });
})
app.get('/routes/join/:route_id', [authorize, injectUser], async (req, res) => {
    const userId = req.user;
    const routeId = req.params.route_id;
    // update the JoinedRoutes table
    try {
        await pool.query(
            'INSERT INTO JoinedRoutes (user_id, route_id) VALUES (?, ?)',
            [ userId, routeId ]
        );
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            res.status(500).render('error-generic', {
                message: 'You have already joined this route!'
            });
            return;
        } else {
            console.error(`routes/join/${routeId}`, err);
            res.render('error-generic', {
                message: 'An error occured. Please try again.'
            });
            return;
        }
    }
    const route = await getRoute(routeId);
    res.render('success-route-joined', { route: route });
})
app.get('/routes/view/:route_id', injectUser, async (req, res) => {
    const routeId = req.params.route_id;
    const route = await getRoute(routeId);
    if (!route) {
        res.render('error-generic', {
            message: 'No route with this id!'
        });
        return;
    }
    const userId = req.signedCookies.user;
    let joined = false;
    if (userId) {
        const joinedQuery = await pool.query(
            'SELECT * FROM JoinedRoutes WHERE route_id = ? AND user_id = ?',
            [ routeId, userId ]
        );
        joined = joinedQuery[0].length === 1;
    }
    const waypoints = await getWaypoints(routeId);
    res.render('route-view', {
        route: route,
        waypoints: waypoints,
        joined: joined,
    })
})

createServer(app).listen(process.env.PORT);

