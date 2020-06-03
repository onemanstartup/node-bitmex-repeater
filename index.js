// https://github.com/BitMEX/api-connectors/issues/203
// Keys
// niwe@free-temp.net
const apiKey = "ZBSAfAmW6FilmSQhyrTapDyB";
const apiKeySecret = "Cr0iKoPuG5w9zTWP28m9hG_4t3f3E_pvUm4Gpls5x_aKRyH-";
// dimiro@mail-card.net
const apiKeyRepeater = "WD0zf4cr7Fy0eMHQmUVfm1P9";
const apiKeySecretRepeater = "odymbD_HLA_2Z3mDIpwl3lwEFybQ7xPZy19Q_dyTB_0elV3M";

// Http Library Import
const util = require("util");
const request = util.promisify(require("request"));
// const request = require("request");
const crypto = require("crypto");

const isTestnet = true;

async function makeRequest(verb, path, data) {
  // Pre-compute the postBody so we can be sure that we're using *exactly* the same body in the request
  // and in the signature. If you don't do this, you might get differently-sorted keys and blow the signature.
  var postBody = JSON.stringify(data);

  var expires = Math.round(new Date().getTime() / 1000) + 60; // 1 min in the future
  var signature = crypto
    .createHmac("sha256", apiKeySecretRepeater)
    .update(verb + path + expires + postBody)
    .digest("hex");

  var headers = {
    "content-type": "application/json",
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    // This example uses the 'expires' scheme. You can also use the 'nonce' scheme. See
    // https://www.bitmex.com/app/apiKeysUsage for more details.
    "api-expires": expires,
    "api-key": apiKeyRepeater,
    "api-signature": signature
  };

  const requestOptions = {
    headers: headers,
    url: `https://testnet.bitmex.com` + path,
    method: verb,
    body: postBody
  };

  return await request(requestOptions)
    .then(function(result) {
      return JSON.parse(result.body);
    })
    .catch(e => console.log(error));
}

// Websocket Library
const BitMEXClient = require("./bitmex-realtime-api");

// See 'options' reference below
const client = new BitMEXClient({
  testnet: isTestnet, // set `true` to connect to the testnet site (testnet.bitmex.com)
  // Set API Key ID and Secret to subscribe to private streams.
  // See `Available Private Streams` below.
  apiKeyID: apiKey,
  apiKeySecret: apiKeySecret,
  maxTableLen: 10000 // the maximum number of table elements to keep in memory (FIFO queue)
});

async function processData(data, symbol, stream) {
  if (stream === "order") {
    console.log(data);
    for (const order of data) {
      let orderPlaced;
      try {
        orderPlacedPromise = isOrderPlacedByClOrdID(order.orderID);
        orderPlaced = await orderPlacedPromise;
      } catch (error) {
        console.log(error);
      }
      if (order.ordStatus === "New") {
        console.log("New - orderPlaced? - " + orderPlaced);
        if (!orderPlaced) {
          // Invalid stopPx for ordType
          const reqPromise = makeRequest("POST", "/api/v1/order", {
            symbol: symbol,
            orderQty: order.orderQty,
            price: order.price,
            ordType: order.ordType,
            stopPx: order.stopPx,
            execInst: order.execInst,
            timeInForce: order.timeInForce,
            clOrdID: order.orderID // Client Order equals order which being copied
          });
          const res = await reqPromise;
          console.log(res);
        } else {
          if (order.text.startsWith("Amended")) {
            // if there is order => check for amending and if not amending do nothing
            makeRequest("PUT", "/api/v1/order", {
              origClOrdID: order.orderID, // Client Order equals order which being copied
              orderQty: order.orderQty,
              price: order.price
            });
          }
        }
      }
      if (order.ordStatus === "Canceled") {
        if (orderPlaced) {
          // if there is order => delete by clOrdID
          makeRequest("DELETE", "/api/v1/order", {
            clOrdID: order.orderID
          });
        }
      }
    }
  }

  if (stream === "position") {
    // console.log(data);
    // /position/isolate
    // enabled:		True for isolated margin, false for cross margin.
    // /position/leverage
    // leverage	(required) Leverage value. Send a number between 0.01 and 100 to enable isolated margin with a fixed leverage. Send 0 to enable cross margin.

    // /position/riskLimit
    // riskLimit	(required) New Risk Limit, in Satoshis.

    // POST /position/transferMargin Transfer equity in or out of a position.
    // amount	(required) Amount to transfer, in Satoshis. May be negative.

    // riskLimit: 20000000000,
    // leverage: 2,
    // crossMargin: false,

    for (const position of data) {
      // NOTES
      // You can't change position with transferMargin when cross margin enabled

      // console.log(position);
      const reqPromise = makeRequest("POST", "/api/v1/position/leverage", {
        symbol: symbol,
        leverage: position.leverage // 0.01 <=||=> 100 || 0
      });
      const res = await reqPromise;
    }
  }

  if (stream === "execution") {
    console.log(data);
    for (const position of data) {
    }
  }
}

async function isOrderPlacedByClOrdID(clOrdID) {
  let result;
  let ordersPromise = makeRequest("GET", "/api/v1/order", {
    filter: { open: true },
    columns: ["clOrdID", "ordStatus"]
  });
  const orders = await ordersPromise;

  function isPlaced(order) {
    return order.clOrdID === clOrdID;
  }

  if (orders === undefined) {
    result = false;
  } else {
    result = orders.some(isPlaced);
  }
  return result;
}

client.on("initialize", () => {});

symbols = ["XBTUSD"];
streams = [
  "execution",
  // "transact",
  // "wallet",
  // "margin",
  // "privateNotifications",
  // "account",
  "position",
  "order"
];

for (const symbol of symbols) {
  for (const stream of streams) {
    client.addStream(symbol, stream, function(data, _symbol, tableName) {
      console.log("-> " + _symbol + " " + stream);
      processData(data, symbol, stream).then(function(result) {});
    });
  }
}
