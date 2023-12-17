import { createServer } from 'http';
import express, { urlencoded } from 'express';
import mysql from 'mysql2';
import dotenv from 'dotenv';
dotenv.config();

const EDIT_ROUTE = 'edit';
const CREATE_ROUTE = 'create';

var app = express();

app.set('view engine', 'ejs');
app.set('views', './src/views');
app.use(express.static('./src/public'));

app.use(urlencoded({ extended: true }));

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
    console.log(res);
}

async function getRoute (id) {
    const [rows] = await pool.query(
        'SELECT * FROM Routes WHERE id = ?',
        [ id ]
    );
    return rows[0];
}

app.get('/', (req, res) => {
    res.render('index');
})
app.get('/admin/routes/list', (req, res) => {
    // TODO list all routes
    res.render('admin-list');
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
app.post('/admin/routes/edit/:id', (req, res) => {
    const id = req.params.id;
    // TODO update the changes to the database
    res.redirect('/admin/routes/list');
})

createServer(app).listen(3000);

