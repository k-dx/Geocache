import { createServer } from 'http';
import express, { urlencoded } from 'express';

var app = express();

app.set('view engine', 'ejs');
app.set('views', './src/views');
app.use(express.static('./src/public'));

app.use(urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.render('index');
})
app.get('/admin/routes/list', (req, res) => {
    // TODO list all routes
    res.render('admin-list');
})
app.get('/admin/routes/create', (req, res) => {
    // TODO: create a new route with id
    const newId = 42;
    res.redirect(`/admin/routes/edit/${newId}`);
})
app.get('/admin/routes/edit/:id', (req, res) => {
    const id = req.params.id;
    res.render('routes-edit', { id: id });
})
app.post('/admin/routes/edit/:id', (req, res) => {
    const id = req.params.id;
    // TODO update the changes to the database
    res.redirect('/admin/routes/list');
})

createServer(app).listen(3000);

