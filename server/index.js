const express = require('express');
const {getSymbols, startPriceService, startService, getDB, getSymbolData, getHofSymbolData, getSignals, getChartData} = require('./src/services/binance');
const SocketIO = require('socket.io');
const http = require('http');
const cors = require('cors');
const { get } = require('jquery');

let app = express();
app.use(cors());

// app.use('/binance', require('./src/routes/binance'));
app.get('/db', getDB);
app.get('/symbol-data', getSymbolData);
app.get('/hofSymbol-data', getHofSymbolData);
app.get('/chart-data', getChartData);


const httpServer = http.createServer(app);
const io = SocketIO(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

httpServer.listen(3000, function () {
  console.log('backend is listening on port 3000!');


});
setTimeout(getSignals, 10000);

/*getSymbols(io)
.then(symbols => {
  startPriceService(symbols);
  startService(symbols)
})
.catch(e => console.log(e));
*/
setTimeout(getDB, 10000);
