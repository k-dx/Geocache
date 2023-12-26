import { createServer } from 'http';
import express, { urlencoded } from 'express';
import mysql from 'mysql2';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { AuthorizationCode } from 'simple-oauth2';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
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

async function createRoute (name, owner_id) {
    const res = await pool.query(
        'INSERT INTO Routes (name, owner_id) VALUES (?, ?)',
        [ name, owner_id ]
    );
}

async function updateRoute (id, name, owner_id) {
    const res = await pool.query(
        'UPDATE Routes SET name = ? WHERE id = ? AND owner_id = ?',
        [ name, id, owner_id ]
    );
}

async function getRoute (id) {
    const [rows] = await pool.query(
        'SELECT * FROM Routes WHERE id = ?',
        [ id ]
    );
    return rows[0];
}

async function getRoutes () {
    const [rows] = await pool.query('SELECT * FROM Routes');
    return rows;
}

app.get('/', (req, res) => {
    res.render('index');
})
app.get('/admin/routes/list', async (req, res) => {
    // TODO list all routes
    res.render('admin-list', { routes: await getRoutes() });
})
app.get('/admin/routes/create', (req, res) => {
    const route = { owner_id: 1 }; // TODO: not-hardcoded owner_id
    res.render('routes-edit', { mode: CREATE_ROUTE, route: route }); 
})
app.post('/admin/routes/create', async (req, res) => {
    const name = req.body.name;
    const owner_id = req.body.owner_id;
    console.log(name, owner_id);
    await createRoute(name, owner_id);
    res.redirect('/admin/routes/list');
})
app.get('/admin/routes/edit/:route_id', async (req, res) => {
    const route_id = req.params.route_id;
    const route = await getRoute(route_id);
    // TODO get waypoints
    // const waypoints = getWaypoints(id);
    res.render('routes-edit', { 
        mode: EDIT_ROUTE, 
        route: route });
})
app.post('/admin/routes/edit', async (req, res) => {
    const id = req.body.route_id;
    const name = req.body.name;
    const owner_id = req.body.owner_id;
    console.log(id, name, owner_id);
    // TODO update the changes to the database
    await updateRoute(id, name, owner_id);
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

// login
app.get('/login', (req, res) => {
    const redirectUrl = req.query.returnUrl;
    let message = null;
    if (redirectUrl) {
        message = 'You must be logged in to view this page';
    }
    res.render('login', { message: message, google: authorizationUri });
});
app.post('/login', async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;

    const emailExistsRes = await emailExists(email);
    if (!emailExistsRes) {
        res.render('login',
                   { email: email, 
                     message: 'email is not associated with any account',
                     google: authorizationUri });
        return;
    }
    const passwordRes = await passwordCorrect(email, password);
    if (!passwordRes) {
        res.render('login', 
                   { email: email,
                     message: 'password is incorrect',
                     google: authorizationUri });
        return;
    }

    const redirectUrl = req.query.returnUrl || '/login/success';
    res.cookie('user', email, { signed: true });
    res.redirect(redirectUrl);
})

app.get('/register', (req, res) => {
    res.render('register');
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
    console.log(result);

    // teraz są dwie możliwości
    // 1. użyć access_token żeby zapytać serwera kto kryje się pod wskazaną tożsamością
    // 2. użyć id_token gdzie od razu zapisana jest wskazana tożsamość
    var access_token = result.token.access_token;
    var id_token     = result.token.id_token;

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
    var profile = jwt.verify(id_token, getKey, async (err, profile) => {
        console.log(profile);
        if (!profile.email) {
            // TODO nicer error page
            res.status(500).send('No email in Google account');
        }

        let user = await getUser(profile.email);
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
        res.cookie('user', profile.email, { signed: true });
        res.redirect('/login/success');    
    });
});

/**
 * Checks if email is okay to register
 * @param {string} email 
 * @returns `true` if okay, error message otherwise
 */
async function emailOk (email) {
    const nonEmpty = email !== '';
    if (!nonEmpty) 
        return 'email cannot be empty';
    const oneAt = (email.split('@').length - 1) === 1;
    if (!oneAt)
        return 'email must contain exactly one @';

    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE email = ?',
        [ email ]
    );
    const notTaken = rows.length === 0;
    if (!notTaken)
        return 'email is already taken';
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
        return 'username cannot be empty';
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE username = ?',
        [ username ]
    );
    const notTaken = rows.length === 0;
    if (!notTaken)
        return 'username is already taken';
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
        return 'password must be at least 8 characters long';
    return true;
}

app.post('/register', async (req, res) => {
    const email = req.body.email;
    const username = req.body.username;
    const password = req.body.password;

    const formdata = { email: email, username: username };
    
    const emailOkRes = await emailOk(email);
    if (emailOkRes !== true) {
        res.render('register', { formdata: formdata, message: emailOkRes });
        return;
    }

    const usernameOkRes = await usernameOk(username);
    if (usernameOkRes !== true) {
        res.render('register', { formdata: formdata, message: usernameOkRes });
        return;
    }

    const passwordOkRes = await passwordOk(password);
    if (passwordOkRes !== true) {
        res.render('register', { formdata: formdata, message: passwordOkRes });
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

async function getUsername(email) {
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE email = ?',
        [ email ]
    );
    return rows[0].username;
}
async function getUser(email) {
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE email = ?',
        [ email ]
    );
    return rows[0];
}
app.get('/account', authorize, async (req, res) => {
    const username = await getUsername(req.user);
    res.render('account-info', { email: req.user, username: username });
})

createServer(app).listen(3000);

