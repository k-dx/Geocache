import { createServer } from 'http';
import express, { urlencoded } from 'express';
import mysql from 'mysql2';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
dotenv.config();

const EDIT_ROUTE = 'edit';
const CREATE_ROUTE = 'create';

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
 * Creates an account with the given credentials in the database
 * Does not verify if the credentials are valid
 * @param {string} email 
 * @param {string} username 
 * @param {string} password (not hashed)
 */
async function createUser(email, username, password) {
    const hash = await hashPassword(password);
    const res = await pool.query(
        'INSERT INTO Users (email, username, password) VALUES (?, ?, ?)',
        [ email, username, hash ]
    );
}

// login
app.get('/login', (req, res) => {
    const redirectUrl = req.query.returnUrl;
    let message = null;
    if (redirectUrl) {
        message = 'You must be logged in to view this page';
    }
    res.render('login', { message: message });
});
app.get('/register', (req, res) => {
    res.render('register');
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

    await createUser(email, username, password);
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

app.post('/login', async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;

    const emailExistsRes = await emailExists(email);
    if (!emailExistsRes) {
        res.render('login', { email: email, message: 'email is not associated with any account' });
        return;
    }
    const passwordRes = await passwordCorrect(email, password);
    if (!passwordRes) {
        res.render('login', { email: email, message: 'password is incorrect' });
        return;
    }

    const redirectUrl = req.query.returnUrl || '/login/success';
    res.cookie('user', email, { signed: true });
    res.redirect(redirectUrl);
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

async function getUsername(email) {
    const [rows] = await pool.query(
        'SELECT * FROM Users WHERE email = ?',
        [ email ]
    );
    return rows[0].username;
}
app.get('/account', authorize, async (req, res) => {
    const username = await getUsername(req.user);
    res.render('account-info', { email: req.user, username: username });
})

createServer(app).listen(3000);

