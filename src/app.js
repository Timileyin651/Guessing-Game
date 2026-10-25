const express = require('express')
const path = require('path')
const roomRouter = require('./routes/room')

const PORT = 3000
const localhost = 'localhost'


const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true}))

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.use(express.static(path.join(__dirname, '../public')))

app.use('/api/rooms', roomRouter);

//homepage
app.get('/', (req,res)=>{
    res.render('index')
})

module.exports = app