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

createServer(app).listen(3000);

