import { createServer } from 'http';
import express, { urlencoded } from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import qrcode from 'qrcode';
import accountRoute from './routes/account.js';
import adminRoute from './routes/admin.js';
import routesRoute from './routes/routes.js';
import { authorize, injectUser, emailExists, passwordCorrect, oauth2, authorizationUri } from './auth.js';
import { pool, getRoute, getWaypoints, getWaypoint, getWaypointVisitLink, createUser, deleteUser, getUser, getUserByEmail } from './db.js';
dotenv.config();

var app = express();

app.set('view engine', 'ejs');
app.set('views', './src/views');
app.use(express.static('./src/public'));

app.use(urlencoded({ extended: true }));
app.use(cookieParser('djdiej4iutjf323xmzz02mfdg'));

app.get('/', injectUser, (req, res) => {
    res.render('index');
})
app.get('/dev', injectUser, (req, res) => {
    res.render('dev');
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

    // check if user is the owner of the route
    // this comparison is ugly
    const userId = req.signedCookies.user;
    const ownerId = route.owner_id;
    if (ownerId.toString() !== userId.toString()) {
        res.render('error-generic', {
            message: 'You are not the owner of this route!'
        });
        return;
    }

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

    // check if user is the owner of the route
    // this comparison is ugly
    const userId = req.signedCookies.user;
    const ownerId = route.owner_id;
    if (ownerId.toString() !== userId.toString()) {
        res.render('error-generic', {
            message: 'You are not the owner of this route!'
        });
        return;
    }


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
    await pool.query(
        'INSERT INTO Visits (user_id, waypoint_id) VALUES (?, ?)',
        [ userId, waypoint.id ]
    );
    res.render('waypoint-visited', {
        waypoint: waypoint
    })
})

async function linkAccountWithGoogle({userId, googleId}) {
    await pool.query(
        'UPDATE Users SET googleId = ? WHERE id = ?',
        [ googleId, userId ]
    );
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
    // var accessToken = result.token.access_token;
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
    var _profile = jwt.verify(idToken, getKey, async (err, profile) => {
        if (err) {
            console.error('when trying to verify jwt during google login', err);
            res.render('error-generic', {
                message: 'An error occured. Please try again.'
            });
            return;
        }
        if (!profile.email) {
            res.render('error-generic', {
                message: 'No email in Google account'
            });
            return;
        }

        let user = await getUserByEmail(profile.email);
        if (!user) {
            // create account
            const userId = await createUser({
                email: profile.email,
                username: profile.name,
                googleId: profile.sub
            });
            user = await getUser(userId);
        }
        console.log(user);
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

app.use('/account', accountRoute);

app.get('/about', injectUser, (req, res) => {
    res.render('about');
})

app.use('/admin', adminRoute);
app.use('/routes', routesRoute);

createServer(app).listen(process.env.PORT);

export { authorize, injectUser, getUser, deleteUser };