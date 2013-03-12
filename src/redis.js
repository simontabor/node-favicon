var redis = require('redis');

var redisHost = 'localhost';
var redisPort = 6379;
var redisAuth = false;

if(process.env.REDISTOGO_URL){
  var rtg = require('url').parse(process.env.REDISTOGO_URL);

  redisHost = rtg.hostname;
  redisPort = rtg.post;
  redisAuth = rtg.auth.split(':')[1];
}

var redisClient = module.exports = redis.createClient(redisPort, redisHost);

if(redisAuth) redisClient.auth(redisAuth);

