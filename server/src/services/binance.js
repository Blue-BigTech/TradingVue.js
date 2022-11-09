

const axios = require('axios');
const WebSocket = require('ws');
const volumeData = new Map();
const priceData = new Map();
let ioServer = null;
const {sprintf} = require('sprintf-js');
const dbConn = require('../../_core/dbConn');
const bannedSymbols = [ "USDTUSDT", "USDCUSDT", "BUSDUSDT", "DAIUSDT", "USTUSDT", "TUSDUSDT", "PAXUSDT", "HUSDUSDT", "RSRUSDT", "USDNUSDT", "GUSDUSDT", "FEIUSDT", "LUSDUSDT", "FRAXUSDT", "SUSDUSDT", "EURSUSDT", "USDXUSDT", "VAIUSDT", "QCUSDT", "SBDUSDT", "CUSDUSDT", "DGDUSDT", "MUSDUSDT", "XSGDUSDT", "USDKUSDT", "USNBTUSDT", "IDRTUSDT", "BITCNYUSDT", "DGXUSDT", "EOSDTUSDT", "XCHFUSDT", "XAURUSDT", "USDSUSDT", "HGTUSDT", "ITLUSDT", "MDSUSDT", "USDPUSDT", "TRYBUSDT", "MTRUSDT", "ZUSDUSDT", "CEURUSDT", "USDLUSDT", "BVNDUSDT", "RSVUSDT", "DPTUSDT", "MDOUSDT", "PARUSDT", "USDBUSDT", "EURTUSDT", "USDQUSDT", "KBCUSDT", "1GOLDUSDT", "USDEXUSDT", "USDFLUSDT", "FLUSDUSDT", "BITUSDUSDT", "BITGOLDUSDT", "BITEURUSDT", "CONSTUSDT", "XEURUSDT", "BGBPUSDT", "EBASEUSDT", "BKRWUSDT", "UETHUSDT", "ALUSDUSDT", "USDSBUSDT" ];
var y = 0;
const updateJsonTable = (symbols, json) => {
        //Check Chart-data table if symbol exist if not Insert it else update 
        let sql = sprintf("select COUNT(*) from `chart-data` where `Symbol` = '%s'", symbols);
        dbConn.query(sql, function (err, result, fields) {
          if (err) throw err;
          let exist = result[0]["COUNT(*)"];
          //If item exist update
          if(exist >= 1){
            console.log("update");
          let sql1 = sprintf("UPDATE `chart-data` SET json = '%j' WHERE symbol = '%s'", json, symbols);
            dbConn.query(sql1, function (er, result1, fields1) {
              if (er) throw er;
              y++;
              console.log("Json Updated", y);
            })
        }
        //If Json does not exist insert it into the table
        else if(exist == 0){
          //let sql = "INSERT INTO chart-data (symbol, json) VALUES" + (symbols, json);
          let sql = sprintf("INSERT INTO `chart-data` (`symbol`, `json`) VALUES('%s', '%s')", symbols, json);
          dbConn.query(sql, function (err, result, fields) {
            if (err) throw err;
            console.log('Chart json Inserted');
            y++;
            console.log(y);
          })
         // console.log("insert");
        }
      })
}

//This function takes an argument symbol array and makes an API call get candlestick data and save it to the DB
const fetchChart = (symbols) => {
  //https://api3.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h
  axios.get('https://api3.binance.com/api/v3/klines?symbol=' + symbols +'&interval=1h')
  .then(function (response) {
    //return response;
    //Saving to DB Function
    console.log("fetch 1");
    updateJsonTable(symbols, response.data);
  })
  
  .catch(function (error) {
    // handle error
    console.log(error);
  })
};
const getSignals = () => {
  console.log("looking for each unique item in DB");
  dbConn.query("SELECT DISTINCT symbol FROM signals", function (err, result, fields) {
    if (err) throw err;
    let signal_symbol = [];
    result.forEach(element => fetchChart(element.symbol));
    //return signal_symbol;
    console.log("done");
  });
}

const getSymbols = (io) => {
  ioServer = io;
  return new Promise((resolve, reject) => {
    axios.get('https://api.binance.com/api/v3/exchangeInfo')
      .then(r => {
        const filtered = r.data.symbols.filter(item => item.symbol.endsWith('USDT'));
        resolve(filtered);
      }).catch(e => {
      reject(e);
    })
  })
};


const startPriceService = (symbols) => {
  const params = symbols.map(item => `${item.symbol.toLowerCase()}@aggTrade`);
  let socket = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${params.join('/')}/!ticker@arr`);
  // let socket = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${params.join('/')}`);
  socket.on('open', () => {
    // socket.send(JSON.stringify(subscribe))
    console.log('socket opened');
  });
  socket.on('message', data => {
    const parsedData = JSON.parse(data);
    if (parsedData.stream.includes('aggTrade')) {
      const symbol = parsedData.stream.split('@')[0].toUpperCase();
      const price = parsedData.data.p;
      const timestamp = new Date().toISOString();
      priceData.has(symbol) || priceData.set(symbol, {timestamp, price, alertPrice: price, highPrice: price});
      priceData.has(symbol) && priceData.set(symbol, {...priceData.get(symbol), price});
      priceData.has(symbol) && price > priceData.get(symbol).highPrice && priceData.set(symbol, {...priceData.get(symbol), highPrice: price})
    }
    if (parsedData.stream === '!ticker@arr') {
      // console.log('arr--', parsedData.data.length);
      parsedData.data.map(item => {
        // console.log('symbol---', item.s, item.c, item.P, priceData.has(item.s));
        const timestamp = new Date().toISOString();
        priceData.has(item.s) || priceData.set(item.s, {timestamp, price: item.c, alertPrice: item.c, highPrice: item.c, change: item.P});
        priceData.has(item.s) && priceData.set(item.s, {...priceData.get(item.s), change: item.P});
      })
    }
  });
  socket.on('error', e => {
    console.log('e--', e);
  })
};

const startService = (symbols) => {
  console.log('symbols---', symbols.length);
  symbols.map((symbol, index) => {
    setTimeout(async () => {
      calculateVolume(symbol.symbol);
      calculateRSI(symbol.symbol);
    }, index * 5000)
  });
  setTimeout(() => {
    startService(symbols)
  }, 1800000)
};

const calculateVolume = (symbol) => {
  axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbol}&interval=1h&limit=3`)
    .then(res => {
      const oldVal = res.data[0][5];
      const newVal = res.data[1][5];
      const percentage = Math.abs(oldVal - newVal) / oldVal;
      //changed
      var daylight = (isDaylight()===true) ? 0:60*60000;
      var tzoffset = (new Date()).getTimezoneOffset() * 60000-daylight;
      const timestamp = new Date(Date.now() - tzoffset).toISOString();
      priceData.has(symbol) && (res.data[2][2] > priceData.get(symbol).highPrice) && priceData.set(symbol, {...priceData.get(symbol), highPrice: res.data[2][4]});
      priceData.has(symbol) && priceData.set(symbol, {...priceData.get(symbol), timestamp: timestamp, price: res.data[2][4]});
      priceData.has(symbol) || priceData.set(symbol, {timestamp, price: res.data[2][4], alertPrice: res.data[2][4], highPrice: res.data[2][4]});
      if (percentage > 0.03) {
        saveToDB(timestamp, symbol, res.data[2][4], 'Volume', percentage);
        priceData.set(symbol, {...priceData.get(symbol), alertPrice: res.data[2][4], highPrice: res.data[2][4]})
      }
   }).catch(e => {
     console.log('volume error---', e);
  })
};

const calculateRSI = async (symbol) => {
  const alerts = require('trading-indicator').alerts;
  const pair = symbol.substring(0, symbol.length - 4) + '/USDT';
  const s = symbol.toLowerCase();
  try {
    const cal = await alerts.rsiCheck(14, 70, 30, "binance", pair, "1h", false);
    //changed
    var daylight = (isDaylight()===true) ? 0:60*60000;
    var tzoffset = (new Date()).getTimezoneOffset() * 60000 -daylight;
    const timestamp = new Date(Date.now() - tzoffset).toISOString();
    if ((cal.overBought || cal.overSold) && priceData.has(symbol)) {
      if(cal.overBought){
        saveToDB(timestamp, symbol, priceData.get(symbol).price, 'RSI Overbought', cal.rsiVal);
      }
      if(cal.overSold){
        saveToDB(timestamp, symbol, priceData.get(symbol).price, 'RSI Oversold', cal.rsiVal);
      }
      // pingEmit('ping', {type: 'rsi', symbol: symbol.symbol, data: cal})
      priceData.set(symbol, {...priceData.get(symbol), alertPrice: priceData.get(symbol).price, highPrice: priceData.get(symbol).price});
    }

  } catch (e) {
    console.log('error---', e, pair);
  }
};

const pingEmit = (event, data) => {
  if (ioServer) {
    // console.log('event----', event, data);
    ioServer.sockets.emit(event, data);
  }
};

const saveToDB = (timestamp, symbol, price, type, value) => {
  let sql = sprintf("INSERT INTO `pings` (`timestamp`, `symbol`, `price`, `type`, `value`) VALUES('%s', '%s', '%f', '%s', '%f')", timestamp, symbol, price, type, value);
  var flag = false;
  for(let i in bannedSymbols){
    if(symbol == bannedSymbols[i]){
      flag = true;
    }
  }
  if(flag == false ){
    dbConn.query(sql, null, (e, r) => {
       //console.log('save data--', r, e, sql);
  });
//    sql = sprintf("INSERT INTO `pings-hof` (`timestamp`, `symbol`, `price`, `type`, `value`) VALUES('%s', '%s', '%f', '%s', '%f')", timestamp, symbol, price, type, value);
//      dbConn.query(sql, null, (e, r) => {
          // console.log('save data--', r, e, sql);
//      });
}
};

const getDB = (req, res) => {
  const timestamp0 = new Date(new Date() - 24 * 60 * 60 * 1000).toISOString();
  let sql = sprintf("delete from `pings` where `timestamp` < '%s'", timestamp0);
  dbConn.query(sql, null, (e1, r1) => {
    // console.log('----', e1, r1);
    sql = "select v.*, w.pings, w.timestamp, w.alertPrice from `pings` v, (select symbol, max(timestamp) timestamp, count(*) pings, min(price) alertPrice from `pings` group by symbol) w where v.symbol = w.symbol and v.timestamp = w.timestamp order by v.timestamp desc";
    dbConn.query(sql, null, (e, r) => {
      // console.log('get db---', e, r);
      if (!e && r) {
        let data = r.map(item => {
          if (priceData.has(item.symbol)) {
            const change = priceData.get(item.symbol).change ? priceData.get(item.symbol).change : '0';
            return {symbol: item.symbol, change, alertPrice: item.alertPrice, price: priceData.get(item.symbol).price, highPrice: priceData.get(item.symbol).highPrice, pings: item.pings, timestamp: item.timestamp, hof: percIncrease(item.alertPrice, priceData.get(item.symbol).highPrice)}
          }
        });
        data = data.filter(el => el !== undefined);
       
        pingEmit('ping', data);
        res && res.send(JSON.stringify(data));
        // console.log('data---', data);
      }
    })
  });
  let sql1 = "select v.*, w.pings, w.timestamp, w.alertPrice from `pings-hof` v, (select symbol, max(timestamp) timestamp, count(*) pings, min(price) alertPrice from `pings-hof` group by symbol) w where v.symbol = w.symbol and v.timestamp = w.timestamp order by v.timestamp desc";
    dbConn.query(sql1, null, (e, r) => {
        // console.log('get db---', e, r);
        if (!e && r) {
            let data = r.map(item => {
                if (priceData.has(item.symbol)) {
                    const change = priceData.get(item.symbol).change ? priceData.get(item.symbol).change : '0';
                    return {symbol: item.symbol, change, alertPrice: item.alertPrice, price: priceData.get(item.symbol).price, highPrice: priceData.get(item.symbol).highPrice, pings: item.pings, timestamp: item.timestamp, hof: percIncrease(item.alertPrice, priceData.get(item.symbol).highPrice)}
                }
            });
            data = data.filter(el => el !== undefined);
            hofHandler(data);
            res && res.send(JSON.stringify(data));
            // console.log('data---', data);
        }
    })
  setTimeout(getDB, 10000);
};
const hofHandler = async (data) => {
  let temp = await data.sort((a, b) => parseFloat(a.hof) < parseFloat(b.hof) ? 1 : -1).slice(0, 10);
  console.log('hof---', temp.length);
    pingEmit('hof', temp);
    return;
    let dbData = [];
    temp.map(item => {
        dbData.push([
            item.symbol,
            item.price,
            item.alertPrice,
            item.highPrice,
            item.hof
        ])
    })
  let sql = "delete from `hof`";
  dbConn.query(sql, (e, r) => {
   sql = "insert into `hof`(symbol, price, alertPrice, highPrice, maxGain) values ?";
    dbConn.query(sql, [dbData], (e1, r1) => {
      console.log('hof save----', e1, r1);
    })
  })
}
function percIncrease(a, b) {
    let percent;
    if(b !== 0) {
        if(a !== 0) {
            percent = (b - a) / a * 100;
        } else {
            percent = b * 100;
        }
    } else {
        percent = - a * 100;
    }
    return parseFloat(percent).toFixed(2);
}
function isDaylight(){
  Date.prototype.stdTimezoneOffset = function () {
      var jan = new Date(this.getFullYear(), 0, 1);
      var jul = new Date(this.getFullYear(), 7, 1);
      return Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  }

  Date.prototype.isDstObserved = function () {
      return this.getTimezoneOffset() < this.stdTimezoneOffset();
  }

  var today = new Date();
  if (today.isDstObserved()) { 
      return true;
  }
  else return false;
}
const getSymbolData = (req, res) => {
  const {symbol} = req.query;
  let sql = sprintf("select * from `pings` where `symbol` = '%s' order by `timestamp` asc", symbol);
  dbConn.query(sql, null, (e, r) => {
    if (!e && r) {
      console.log('db data---', e, r);
      r.map(el => {el.highPrice = priceData.get(symbol).highPrice});
      res.send({price: priceData.get(symbol).price, data: r});
    }
  })
};

const getChartData = (req, res) => {
  const {symbol} = req.query;
  console.log(symbol);
  let sql = sprintf("select * from `chart-data` where `Symbol` = '%s'", symbol);
  dbConn.query(sql, null, (e, r) => {
    if (!e && r) {

      let chart_data = {
        "ohlcv": [],
        "onchart": [{
          "name": "Data sections",
          "type": "Splitters",
          "data": [],
          "settings": {
              "legend": false
          }
        }]
      }
      if(typeof r !== 'undefined' && r.length > 0) {
        ohlcv_data = JSON.parse(r[0].json);
        for (var i = 0; i < ohlcv_data.length; i++) {
          for (var j = 0; j < 6; j++) {
            ohlcv_data[i].pop();
            ohlcv_data[i][j] = parseFloat(ohlcv_data[i][j]);
          }
        }

        chart_data.ohlcv = ohlcv_data;
        onchart_data = [];

        let sql2 = "select UNIX_TIMESTAMP(STR_TO_DATE(`Timestamp`, '%d-%m-%Y %h:%i:%s %p')) * 1000 as time, Signal_type from `signals` where `Symbol` = '" + symbol + "'";
        dbConn.query(sql2, null, (e, r) => {
          if (!e && r) {
            if(typeof r !== 'undefined' && r.length > 0) {
              for (var i = 0; i < r.length; i++) {
                arr = [];
                arr.push(r[i].time);
                arr.push(r[i].Signal_type);
                if(r[i].Signal_type == "Sell")
                  arr.push(0);
                else if(r[i].Signal_type == "Buy")
                  arr.push(1);
                if(r[i].Signal_type == "Sell")
                  arr.push("#EA5455");
                else if(r[i].Signal_type == "Buy")
                  arr.push("#09ae57");
                if(r[i].Signal_type == "Sell")
                  arr.push(0.75);
                else if(r[i].Signal_type == "Buy")
                  arr.push(0.65);
                onchart_data.push(arr);
              }
            }
            chart_data.onchart[0].data = onchart_data;
            res.send({data: chart_data});
          }
        })

      }

    }
  })
};

const getHofSymbolData = (req, res) => {
    const {symbol} = req.query;
    let sql = sprintf("select * from `pings-hof` where `symbol` = '%s' order by `timestamp` asc", symbol);
    dbConn.query(sql, null, (e, r) => {
        if (!e && r) {
            console.log('db data---', e, r);
            r.map(el => {el.highPrice = priceData.get(symbol).highPrice});
            res.send({price: priceData.get(symbol).price, data: r});
        }
    })
};

module.exports = {
  getSignals,
  getSymbols,
  startPriceService,
  startService,
  getDB,
  getSymbolData,
  getHofSymbolData,
  getChartData
};
